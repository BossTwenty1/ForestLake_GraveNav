begin;

-- Bounded staff read model for Plot Management. Operational occupancy follows
-- GraveNav's existing assignment rule: any burial relationship reserves a
-- plot, including a recoverable soft-deleted burial record. The stored lot
-- status is considered only when the plot has no burial assignment.
create function public.staff_plot_management(
  p_query text default '',
  p_area text default 'all',
  p_state text default 'all',
  p_verification text default 'all',
  p_sort text default 'updated',
  p_direction text default 'desc',
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
  state_filter text := lower(coalesce(nullif(trim(p_state), ''), 'all'));
  verification_filter text := lower(coalesce(nullif(trim(p_verification), ''), 'all'));
  sort_key text := lower(coalesce(nullif(trim(p_sort), ''), 'updated'));
  sort_direction text := lower(coalesce(nullif(trim(p_direction), ''), 'desc'));
  page_number integer := greatest(1, least(coalesce(p_page, 1), 100000));
  page_size integer := greatest(10, least(coalesce(p_page_size, 20), 50));
  result jsonb;
begin
  if not public.is_active_admin_or_manager() then
    raise exception 'An active staff account is required' using errcode = '42501';
  end if;

  if area_filter <> 'all' and area_filter !~ '^[1-9][0-9]{0,9}$' then
    raise exception 'Invalid plot area filter';
  end if;
  area_id_filter := case when area_filter = 'all' then null else area_filter::integer end;
  if state_filter not in ('all', 'available', 'occupied', 'booked', 'hold') then
    raise exception 'Invalid operational plot state filter';
  end if;
  if verification_filter not in ('all', 'missing', 'pending', 'verified', 'rejected') then
    raise exception 'Invalid coordinate verification filter';
  end if;
  if sort_key not in ('updated', 'plot', 'area', 'state', 'coordinate') then
    raise exception 'Invalid plot sort';
  end if;
  if sort_direction not in ('asc', 'desc') then
    raise exception 'Invalid plot sort direction';
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
  plot_source as materialized (
    select
      l.revision,
      l.lot_id,
      l.lot_code,
      l.area_id,
      l.block_id,
      l.lot_owner_id,
      l.legacy_location_code,
      l.legacy_pa_number,
      l.status as stored_status,
      l.length_m,
      l.width_m,
      l.px_loc_x,
      l.px_loc_y,
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
        when assigned.lot_id is not null then 'occupied'
        when l.status = 'BOOKED' then 'booked'
        when l.status = 'HOLD' then 'hold'
        else 'available'
      end as operational_state,
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
    from plot_source as source
    where (
        q = ''
        or not exists (
          select 1
          from regexp_split_to_table(q, ' +') as token
          where position(
            token in public.search_normalize(concat_ws(
              ' ',
              source.lot_code,
              source.legacy_location_code,
              source.legacy_pa_number,
              source.area_code,
              source.area_name,
              source.deceased_name
            ))
          ) = 0
        )
      )
      and (area_id_filter is null or source.area_id = area_id_filter)
      and (state_filter = 'all' or source.operational_state = state_filter)
      and (verification_filter = 'all' or source.coordinate_state = verification_filter)
  ),
  page_rows as (
    select filtered.*
    from filtered
    order by
      case when sort_key = 'plot' and sort_direction = 'asc' then lot_code end asc,
      case when sort_key = 'plot' and sort_direction = 'desc' then lot_code end desc,
      case when sort_key = 'area' and sort_direction = 'asc' then area_name end asc nulls last,
      case when sort_key = 'area' and sort_direction = 'desc' then area_name end desc nulls last,
      case when sort_key = 'state' and sort_direction = 'asc' then operational_state end asc,
      case when sort_key = 'state' and sort_direction = 'desc' then operational_state end desc,
      case when sort_key = 'coordinate' and sort_direction = 'asc' then coordinate_state end asc,
      case when sort_key = 'coordinate' and sort_direction = 'desc' then coordinate_state end desc,
      case when sort_key = 'updated' and sort_direction = 'asc' then updated_at end asc,
      case when sort_key = 'updated' and sort_direction = 'desc' then updated_at end desc,
      lot_id desc
    limit page_size
    offset (page_number - 1) * page_size
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'revision', page.revision,
        'lotId', page.lot_id,
        'lotCode', page.lot_code,
        'areaId', page.area_id,
        'blockId', page.block_id,
        'lotOwnerId', page.lot_owner_id,
        'legacyLocationCode', page.legacy_location_code,
        'legacyPaNumber', page.legacy_pa_number,
        'status', page.stored_status,
        'lengthM', page.length_m,
        'widthM', page.width_m,
        'pxLocX', page.px_loc_x,
        'pxLocY', page.px_loc_y,
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
        'coordinateRejectionReason', page.coordinate_rejection_reason,
        'updatedAt', page.updated_at,
        'areaCode', page.area_code,
        'areaName', page.area_name,
        'operationalState', page.operational_state,
        'coordinateState', page.coordinate_state,
        'assignedBurialId', page.burial_id,
        'assignedDeceasedName', page.deceased_name,
        'assignedBurialDeleted', coalesce(page.burial_deleted, false)
      ) order by
        case when sort_key = 'plot' and sort_direction = 'asc' then page.lot_code end asc,
        case when sort_key = 'plot' and sort_direction = 'desc' then page.lot_code end desc,
        case when sort_key = 'area' and sort_direction = 'asc' then page.area_name end asc nulls last,
        case when sort_key = 'area' and sort_direction = 'desc' then page.area_name end desc nulls last,
        case when sort_key = 'state' and sort_direction = 'asc' then page.operational_state end asc,
        case when sort_key = 'state' and sort_direction = 'desc' then page.operational_state end desc,
        case when sort_key = 'coordinate' and sort_direction = 'asc' then page.coordinate_state end asc,
        case when sort_key = 'coordinate' and sort_direction = 'desc' then page.coordinate_state end desc,
        case when sort_key = 'updated' and sort_direction = 'asc' then page.updated_at end asc,
        case when sort_key = 'updated' and sort_direction = 'desc' then page.updated_at end desc,
        page.lot_id desc
      )
      from page_rows as page
    ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'totalAll', (select count(*) from plot_source),
    'summary', (
      select jsonb_build_object(
        'total', count(*),
        'occupied', count(*) filter (where operational_state = 'occupied'),
        'available', count(*) filter (where operational_state = 'available'),
        'booked', count(*) filter (where operational_state = 'booked'),
        'onHold', count(*) filter (where operational_state = 'hold'),
        'needsVerification', count(*) filter (
          where location_geom is null or coordinate_status in ('pending', 'rejected')
        )
      )
      from plot_source
    ),
    'areas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'areaId', area.area_id,
        'areaCode', area.area_code,
        'label', area.area_name
      ) order by area.area_name, area.area_id)
      from (
        select distinct area_id, area_code, area_name
        from plot_source
        where area_id is not null
      ) as area
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.staff_plot_management(text, text, text, text, text, text, integer, integer) from public;
grant execute on function public.staff_plot_management(text, text, text, text, text, text, integer, integer) to authenticated;

comment on function public.staff_plot_management(text, text, text, text, text, text, integer, integer) is
  'Authorized, bounded Plot Management read model with derived occupancy, coordinate readiness, search, filters, sorting, and pagination.';

commit;
