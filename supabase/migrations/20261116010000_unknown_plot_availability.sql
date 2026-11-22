begin;

-- Availability is a separate assessed fact. No burial relationship does not
-- establish vacancy, ownership, sale status or permission to book a plot.
-- Preserve all existing rows, IDs, revisions and confirmed statuses.
alter table public.lot drop constraint lot_status_check;
alter table public.lot add constraint lot_status_check
  check (status in ('UNKNOWN', 'AVAILABLE', 'BOOKED', 'HOLD'));
alter table public.lot alter column status set default 'UNKNOWN';
comment on column public.lot.status is
  'UNKNOWN means availability has not been assessed; it does not mean vacant, unsold or available for booking. AVAILABLE requires authoritative confirmation. Burial assignments are tracked separately.';

-- The existing protected writer omits absent patch fields, so it uses the
-- database default on create and retains the stored value on partial update.
-- CREATE OR REPLACE retains reader privileges and security boundaries.
create or replace function public.staff_dashboard_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if not public.is_active_admin_or_manager() then
    raise exception 'An active staff account is required' using errcode = '42501';
  end if;

  with current_lots as (
    select
      l.lot_id,
      l.area_id,
      l.lot_code,
      l.status,
      l.location_geom,
      l.coordinate_status,
      l.coordinate_verified,
      l.coordinate_rejection_reason,
      l.updated_at
    from public.lot as l
    where l.deleted_at is null
  ),
  assigned_lots as (
    -- Existing creation and uniqueness rules treat every burial relationship
    -- as an assignment, including a recoverable soft-deleted burial record.
    select distinct br.lot_id
    from public.burial_record as br
  ),
  lot_summary as (
    select
      count(*)::bigint as total,
      count(*) filter (where assigned.lot_id is not null)::bigint as occupied,
      count(*) filter (
        where assigned.lot_id is null and lots.status = 'AVAILABLE'
      )::bigint as available,
      count(*) filter (
        where assigned.lot_id is null and lots.status = 'BOOKED'
      )::bigint as booked,
      count(*) filter (
        where assigned.lot_id is null and lots.status = 'HOLD'
      )::bigint as on_hold,
      count(*) filter (
        where assigned.lot_id is null and lots.status = 'UNKNOWN'
      )::bigint as unknown
    from current_lots as lots
    left join assigned_lots as assigned using (lot_id)
  ),
  verification_queue as (
    select
      lots.lot_id,
      lots.lot_code,
      case
        when lots.location_geom is null then 'Missing coordinates'
        when lots.coordinate_status = 'rejected' then 'Rejected coordinates'
        else 'Awaiting verification'
      end as issue,
      case
        when lots.location_geom is null then 'missing'
        when lots.coordinate_status = 'rejected' then 'rejected'
        else 'pending'
      end as status,
      lots.coordinate_rejection_reason,
      lots.updated_at
    from current_lots as lots
    where lots.location_geom is null
       or lots.coordinate_status in ('pending', 'rejected')
  ),
  section_counts as (
    select
      area.area_id,
      area.area_name,
      count(*)::bigint as burial_count
    from public.burial_record as burial
    join current_lots as lots on lots.lot_id = burial.lot_id
    join public.area as area on area.area_id = lots.area_id
    where burial.deleted_at is null
    group by area.area_id, area.area_name
  ),
  audit_events as (
    select
      audit.audit_id,
      audit.created_at,
      case
        when audit.table_name = 'burial_record' and audit.action = 'insert'
          then 'Burial record created'
        when audit.table_name = 'burial_record'
          and (audit.old_values ->> 'lot_id') is distinct from (audit.new_values ->> 'lot_id')
          then 'Plot assignment changed'
        when audit.table_name = 'burial_record' and audit.action = 'status_change'
          then 'Burial record status changed'
        when audit.table_name = 'burial_record'
          and audit.old_values ->> 'deleted_at' is null
          and audit.new_values ->> 'deleted_at' is not null
          then 'Burial record removed'
        when audit.table_name = 'burial_record'
          and audit.old_values ->> 'deleted_at' is not null
          and audit.new_values ->> 'deleted_at' is null
          then 'Burial record restored'
        when audit.table_name = 'burial_record' and audit.action = 'update'
          then 'Burial record updated'
        when audit.table_name = 'lot' and audit.action = 'verify'
          and audit.new_values ->> 'coordinate_status' = 'verified'
          then 'Coordinates verified'
        when audit.table_name = 'lot' and audit.action = 'verify'
          and audit.new_values ->> 'coordinate_status' = 'rejected'
          then 'Coordinates rejected'
        when audit.table_name = 'lot' and audit.action = 'update'
          and (audit.old_values -> 'location_geom') is distinct from (audit.new_values -> 'location_geom')
          and audit.new_values ->> 'location_geom' is not null
          then 'Coordinates submitted'
        when audit.table_name = 'lot' and audit.action = 'status_change'
          then 'Plot status changed'
        when audit.table_name = 'lot' and audit.action = 'insert'
          then 'Plot created'
        else null
      end as event_label,
      deceased.display_name as subject,
      coalesce(burial_lot.lot_code, changed_lot.lot_code) as plot_code
    from public.audit_log as audit
    left join public.burial_record as burial
      on audit.table_name = 'burial_record'
     and burial.burial_id::text = audit.record_id
    left join public.deceased as deceased on deceased.deceased_id = burial.deceased_id
    left join public.lot as burial_lot on burial_lot.lot_id = burial.lot_id
    left join public.lot as changed_lot
      on audit.table_name = 'lot'
     and changed_lot.lot_id::text = audit.record_id
    where audit.table_name in ('burial_record', 'lot')
  ),
  recent_changes as (
    select *
    from audit_events
    where event_label is not null
    order by created_at desc, audit_id desc
    limit 6
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'totalBurialRecords', (
        select count(*) from public.burial_record where deleted_at is null
      ),
      'occupiedPlots', summary.occupied,
      'availablePlots', summary.available,
      'needsVerification', (select count(*) from verification_queue)
    ),
    'burialsBySection', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'areaId', sections.area_id,
          'areaName', sections.area_name,
          'burialCount', sections.burial_count
        ) order by sections.burial_count desc, sections.area_name, sections.area_id
      )
      from section_counts as sections
    ), '[]'::jsonb),
    'occupancy', jsonb_build_object(
      'occupied', summary.occupied,
      'available', summary.available,
      'booked', summary.booked,
      'onHold', summary.on_hold,
      'unknown', summary.unknown,
      'total', summary.total,
      'occupancyPercent', case
        when summary.total = 0 then 0
        else round((summary.occupied * 100.0) / summary.total)::integer
      end
    ),
    'recentChanges', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'auditId', changes.audit_id,
          'label', changes.event_label,
          'subject', changes.subject,
          'plotCode', changes.plot_code,
          'createdAt', changes.created_at
        ) order by changes.created_at desc, changes.audit_id desc
      )
      from recent_changes as changes
    ), '[]'::jsonb),
    'verificationItems', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'lotId', queue.lot_id,
          'plot', queue.lot_code,
          'issue', queue.issue,
          'status', queue.status,
          'rejectionReason', queue.coordinate_rejection_reason,
          'updatedAt', queue.updated_at
        ) order by
          case queue.status when 'rejected' then 1 when 'missing' then 2 else 3 end,
          queue.updated_at desc,
          queue.lot_id desc
      )
      from (
        select *
        from verification_queue
        order by
          case status when 'rejected' then 1 when 'missing' then 2 else 3 end,
          updated_at desc,
          lot_id desc
        limit 6
      ) as queue
    ), '[]'::jsonb)
  )
  into result
  from lot_summary as summary;

  return result;
end;
$$;

create or replace function public.staff_plot_management(
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
  if state_filter not in ('all', 'unknown', 'available', 'occupied', 'booked', 'hold') then
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
      (array_agg(br.burial_id order by br.deleted_at nulls first, br.burial_id))[1] as burial_id,
      bool_and(br.deleted_at is not null) as burial_deleted,
      (array_agg(d.display_name order by br.deleted_at nulls first, br.burial_id))[1] as deceased_name,
      string_agg(d.display_name, ' ') as search_names,
      count(*) filter (where br.interment_confirmed is true) as confirmed_count,
      max(br.interment_slot) as reserved,
      jsonb_agg(jsonb_build_object('id', br.burial_id, 'name', d.display_name,
        'status', br.record_status, 'confirmed', br.interment_confirmed,
        'removed', br.deleted_at is not null) order by br.interment_slot) as roster
    from public.burial_record as br
    left join public.deceased as d on d.deceased_id = br.deceased_id
    group by br.lot_id
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
      l.grave_type, l.grave_policy_reference, l.approved_mausoleum_capacity,
      coalesce(assigned.confirmed_count, 0) as confirmed_count,
      greatest(0, public.grave_interment_limit(l.grave_type, l.approved_mausoleum_capacity)
        - coalesce(assigned.reserved, 0)) as remaining,
      coalesce(assigned.roster, '[]'::jsonb) as roster,
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
      assigned.search_names,
      case
        when assigned.lot_id is not null then 'occupied'
        when l.status = 'BOOKED' then 'booked'
        when l.status = 'HOLD' then 'hold'
        when l.status = 'AVAILABLE' then 'available'
        else 'unknown'
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
              source.search_names
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
        'graveType', page.grave_type,
        'gravePolicyReference', page.grave_policy_reference,
        'approvedMausoleumCapacity', page.approved_mausoleum_capacity,
        'confirmedCount', page.confirmed_count,
        'remainingInterments', page.remaining,
        'interments', page.roster,
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
        'unknown', count(*) filter (where operational_state = 'unknown'),
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

create or replace view gis_private.lot_gis_readiness with (security_invoker=true) as
with published as materialized (
  select mp.site_id,mp.area_id,mp.release_id,
    (select count(*)::integer from public.mapping_publication_event pe
      where pe.site_id=mp.site_id and pe.area_id=mp.area_id) as scope_revision
  from public.mapping_publication mp
  join public.mapping_release mr on mr.release_id=mp.release_id
    and mr.site_id=mp.site_id and mr.status='published'
), reachable as materialized (
  select p.release_id,r.node_id
  from published p
  cross join lateral gis_private.reachable_nodes(p.release_id) as r(node_id)
), access_state as materialized (
  select a.mapping_release_id,a.lot_id,
    true as has_access,
    bool_or(a.review_state='approved' and n.review_state='approved') as has_approved_access,
    bool_or(a.review_state='approved' and n.review_state='approved' and r.node_id is not null) as has_reachable_access
  from public.grave_access_point a
  join public.map_node n on n.node_id=a.node_id and n.mapping_release_id=a.mapping_release_id and n.site_id=a.site_id
  left join reachable r on r.release_id=a.mapping_release_id and r.node_id=a.node_id
  group by a.mapping_release_id,a.lot_id
), assigned as materialized (
  select distinct br.lot_id from public.burial_record br
), stale_polygon as materialized (
  select distinct pg.lot_id
  from public.plot_geometry pg
  join published p on p.release_id=pg.mapping_release_id and p.site_id=pg.site_id and p.area_id=pg.area_id
  where pg.review_state='approved'
)
select
  a.site_id,l.area_id,l.lot_id,l.lot_code,l.deleted_at,
  case when assigned.lot_id is not null then 'occupied'
       when l.status='BOOKED' then 'booked'
       when l.status='HOLD' then 'hold'
       when l.status='AVAILABLE' then 'available'
       else 'unknown' end as occupancy,
  case when l.location_geom is null then 'missing'
       when l.coordinate_status='rejected' then 'rejected'
       when l.coordinate_status='verified' and l.coordinate_verified then 'verified'
       else 'pending' end as legacy_coordinate,
  p.release_id,p.scope_revision,
  (l.deleted_at is null and p.release_id is not null and pg.plot_geometry_id is not null) as geometry_ready,
  (l.deleted_at is null and p.release_id is not null and pg.plot_geometry_id is not null
    and coalesce(ax.has_reachable_access,false)) as routing_ready,
  case
    when l.deleted_at is not null then 'lot_removed'
    when p.release_id is null and stale_polygon.lot_id is not null then 'no_approved_polygon'
    when p.release_id is null then 'no_published_release'
    when pg.plot_geometry_id is null then 'no_approved_polygon'
    when not coalesce(ax.has_access,false) then 'no_access_point'
    when not coalesce(ax.has_approved_access,false) then 'unreviewed_access_point'
    when not coalesce(ax.has_reachable_access,false) then 'unreachable'
    else null
  end as reason
from public.lot l
join public.area a on a.area_id=l.area_id
left join assigned on assigned.lot_id=l.lot_id
left join published p on p.site_id=a.site_id and p.area_id=l.area_id
left join stale_polygon on stale_polygon.lot_id=l.lot_id
left join public.plot_geometry pg on pg.mapping_release_id=p.release_id and pg.lot_id=l.lot_id
  and pg.site_id=a.site_id and pg.area_id=l.area_id and pg.review_state='approved'
  and extensions.st_isvalid(pg.plot_geom) and not extensions.st_isempty(pg.plot_geom)
left join access_state ax on ax.mapping_release_id=p.release_id and ax.lot_id=l.lot_id;

commit;
