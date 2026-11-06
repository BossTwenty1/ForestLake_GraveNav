begin;

-- Coordinate Verification is intentionally administrator-only. Managers can
-- see readiness through Dashboard and Plot Management, but only an active
-- administrator may enter the review workspace or perform review mutations.
create function public.staff_coordinate_verification(
  p_query text default '',
  p_area text default 'all',
  p_state text default 'actionable',
  p_sort text default 'priority',
  p_direction text default 'asc',
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  q text := public.search_normalize(left(coalesce(p_query, ''), 160));
  area_filter text := lower(coalesce(nullif(trim(p_area), ''), 'all'));
  area_id_filter integer;
  state_filter text := lower(coalesce(nullif(trim(p_state), ''), 'actionable'));
  sort_key text := lower(coalesce(nullif(trim(p_sort), ''), 'priority'));
  sort_direction text := lower(coalesce(nullif(trim(p_direction), ''), 'asc'));
  page_number integer := greatest(1, least(coalesce(p_page, 1), 100000));
  page_size integer := greatest(10, least(coalesce(p_page_size, 20), 50));
  result jsonb;
begin
  if not public.is_active_admin() then
    raise exception 'An active administrator account is required' using errcode = '42501';
  end if;

  if area_filter <> 'all' and area_filter !~ '^[1-9][0-9]{0,9}$' then
    raise exception 'Invalid coordinate area filter';
  end if;
  area_id_filter := case when area_filter = 'all' then null else area_filter::integer end;
  if state_filter not in ('actionable', 'all', 'missing', 'pending', 'rejected', 'verified') then
    raise exception 'Invalid coordinate state filter';
  end if;
  if sort_key not in ('priority', 'updated', 'plot', 'area', 'status', 'accuracy') then
    raise exception 'Invalid coordinate verification sort';
  end if;
  if sort_direction not in ('asc', 'desc') then
    raise exception 'Invalid coordinate verification sort direction';
  end if;

  with assigned as materialized (
    select
      br.lot_id,
      br.burial_id,
      br.deleted_at is not null as burial_deleted,
      d.display_name as deceased_name
    from public.burial_record as br
    left join public.deceased as d on d.deceased_id = br.deceased_id
  ),
  coordinate_source as materialized (
    select
      l.revision,
      l.lot_id,
      l.lot_code,
      l.area_id,
      l.location_geom,
      l.coordinate_accuracy_m,
      l.coordinate_status,
      l.coordinate_verified,
      l.coordinate_rejection_reason,
      l.updated_at,
      a.area_code,
      a.area_name,
      assigned.burial_id,
      assigned.burial_deleted,
      assigned.deceased_name,
      case
        when l.location_geom is null then 'missing'
        when l.coordinate_status = 'rejected' then 'rejected'
        when l.coordinate_status = 'verified' and l.coordinate_verified then 'verified'
        else 'pending'
      end as coordinate_state
    from public.lot as l
    left join public.area as a on a.area_id = l.area_id
    left join assigned on assigned.lot_id = l.lot_id
    where l.deleted_at is null
  ),
  filtered as materialized (
    select source.*
    from coordinate_source as source
    where (
        q = ''
        or not exists (
          select 1
          from regexp_split_to_table(q, ' +') as token
          where position(
            token in public.search_normalize(concat_ws(
              ' ', source.lot_code, source.area_code, source.area_name, source.deceased_name
            ))
          ) = 0
        )
      )
      and (area_id_filter is null or source.area_id = area_id_filter)
      and (
        state_filter = 'all'
        or state_filter = source.coordinate_state
        or (state_filter = 'actionable' and source.coordinate_state in ('missing', 'pending', 'rejected'))
      )
  ),
  page_rows as materialized (
    select filtered.*
    from filtered
    order by
      case when sort_key = 'priority' and coordinate_state = 'rejected' then 1
           when sort_key = 'priority' and coordinate_state = 'pending' then 2
           when sort_key = 'priority' and coordinate_state = 'missing' then 3
           when sort_key = 'priority' then 4 end asc,
      case when sort_key = 'plot' and sort_direction = 'asc' then lot_code end asc,
      case when sort_key = 'plot' and sort_direction = 'desc' then lot_code end desc,
      case when sort_key = 'area' and sort_direction = 'asc' then area_name end asc nulls last,
      case when sort_key = 'area' and sort_direction = 'desc' then area_name end desc nulls last,
      case when sort_key = 'status' and sort_direction = 'asc' then coordinate_state end asc,
      case when sort_key = 'status' and sort_direction = 'desc' then coordinate_state end desc,
      case when sort_key = 'accuracy' and sort_direction = 'asc' then coordinate_accuracy_m end asc nulls last,
      case when sort_key = 'accuracy' and sort_direction = 'desc' then coordinate_accuracy_m end desc nulls last,
      case when sort_key = 'updated' and sort_direction = 'asc' then updated_at end asc,
      case when sort_key = 'updated' and sort_direction = 'desc' then updated_at end desc,
      updated_at desc,
      lot_id desc
    limit page_size
    offset (page_number - 1) * page_size
  ),
  coordinate_events as materialized (
    select
      audit.record_id::bigint as lot_id,
      audit.audit_id,
      audit.created_at,
      account.username as actor_name,
      case
        when audit.action = 'verify' and audit.new_values ->> 'coordinate_status' = 'verified'
          then 'verified'
        when audit.action = 'verify' and audit.new_values ->> 'coordinate_status' = 'rejected'
          then 'rejected'
        when audit.action = 'update'
          and (audit.old_values -> 'location_geom') is distinct from (audit.new_values -> 'location_geom')
          and audit.new_values -> 'location_geom' is not null
          then 'updated'
        when audit.action = 'insert' and audit.new_values ->> 'location_geom' is not null
          then 'submitted'
        else null
      end as event_type,
      audit.new_values ->> 'coordinate_rejection_reason' as reason,
      row_number() over (
        partition by audit.record_id
        order by audit.created_at desc, audit.audit_id desc
      ) as event_number
    from public.audit_log as audit
    join page_rows as page on page.lot_id::text = audit.record_id
    left join public.account as account on account.account_id = audit.actor_account_id
    where audit.table_name = 'lot'
      and (
        audit.action = 'verify'
        or (
          audit.action in ('insert', 'update')
          and (audit.old_values -> 'location_geom') is distinct from (audit.new_values -> 'location_geom')
        )
      )
  ),
  history_by_lot as materialized (
    select
      events.lot_id,
      jsonb_agg(jsonb_build_object(
        'auditId', events.audit_id,
        'event', events.event_type,
        'actorName', events.actor_name,
        'reason', events.reason,
        'createdAt', events.created_at
      ) order by events.created_at desc, events.audit_id desc) as history
    from coordinate_events as events
    where events.event_type is not null and events.event_number <= 5
    group by events.lot_id
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'revision', page.revision,
        'lotId', page.lot_id,
        'lotCode', page.lot_code,
        'areaId', page.area_id,
        'areaCode', page.area_code,
        'areaName', page.area_name,
        'coordinateState', page.coordinate_state,
        'location', case
          when page.location_geom is null then null
          else jsonb_build_object(
            'longitude', extensions.st_x(page.location_geom::extensions.geometry),
            'latitude', extensions.st_y(page.location_geom::extensions.geometry)
          )
        end,
        'coordinateAccuracyM', page.coordinate_accuracy_m,
        'coordinateStatus', page.coordinate_status,
        'coordinateVerified', page.coordinate_verified,
        'rejectionReason', page.coordinate_rejection_reason,
        'updatedAt', page.updated_at,
        'assignedBurialId', page.burial_id,
        'assignedDeceasedName', page.deceased_name,
        'assignedBurialDeleted', coalesce(page.burial_deleted, false),
        'history', coalesce(history.history, '[]'::jsonb)
      ) order by
        case when sort_key = 'priority' and page.coordinate_state = 'rejected' then 1
             when sort_key = 'priority' and page.coordinate_state = 'pending' then 2
             when sort_key = 'priority' and page.coordinate_state = 'missing' then 3
             when sort_key = 'priority' then 4 end asc,
        case when sort_key = 'plot' and sort_direction = 'asc' then page.lot_code end asc,
        case when sort_key = 'plot' and sort_direction = 'desc' then page.lot_code end desc,
        case when sort_key = 'area' and sort_direction = 'asc' then page.area_name end asc nulls last,
        case when sort_key = 'area' and sort_direction = 'desc' then page.area_name end desc nulls last,
        case when sort_key = 'status' and sort_direction = 'asc' then page.coordinate_state end asc,
        case when sort_key = 'status' and sort_direction = 'desc' then page.coordinate_state end desc,
        case when sort_key = 'accuracy' and sort_direction = 'asc' then page.coordinate_accuracy_m end asc nulls last,
        case when sort_key = 'accuracy' and sort_direction = 'desc' then page.coordinate_accuracy_m end desc nulls last,
        case when sort_key = 'updated' and sort_direction = 'asc' then page.updated_at end asc,
        case when sort_key = 'updated' and sort_direction = 'desc' then page.updated_at end desc,
        page.updated_at desc,
        page.lot_id desc
      )
      from page_rows as page
      left join history_by_lot as history on history.lot_id = page.lot_id
    ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'totalAll', (select count(*) from coordinate_source),
    'summary', (
      select jsonb_build_object(
        'needsVerification', count(*) filter (where coordinate_state in ('missing', 'pending', 'rejected')),
        'missing', count(*) filter (where coordinate_state = 'missing'),
        'pending', count(*) filter (where coordinate_state = 'pending'),
        'rejected', count(*) filter (where coordinate_state = 'rejected'),
        'verified', count(*) filter (where coordinate_state = 'verified')
      )
      from coordinate_source
    ),
    'areas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'areaId', area.area_id,
        'areaCode', area.area_code,
        'label', area.area_name
      ) order by area.area_name, area.area_id)
      from (
        select distinct area_id, area_code, area_name
        from coordinate_source
        where area_id is not null
      ) as area
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.staff_coordinate_verification(text, text, text, text, text, integer, integer) from public;
grant execute on function public.staff_coordinate_verification(text, text, text, text, text, integer, integer) to authenticated;

comment on function public.staff_coordinate_verification(text, text, text, text, text, integer, integer) is
  'Administrator-only, bounded Coordinate Verification read model with consistent readiness states, audit context, search, filters, sorting, and pagination.';

commit;
