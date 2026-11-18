begin;

-- Staff read models only. No rows, protected writers, grants or GIS policy change.
-- P2S availability/capacity are sample admission policy, never physical inventory.

CREATE OR REPLACE FUNCTION public.staff_dashboard_counts()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.is_active_admin_or_manager() then
    raise exception 'An active staff account is required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'active', (select count(*) from public.burial_record where deleted_at is null and record_status='active'),
    'pending', (select count(*) from public.burial_record where deleted_at is null and record_status='pending'),
    'archived', (select count(*) from public.burial_record where deleted_at is null and record_status='archived'),
    'syntheticPlots', (select count(*) from public.lot where deleted_at is null and lot_code ~ '^P2S-[0-9a-f]{64}$'),
    'plots', (select count(*) from public.lot where deleted_at is null and lot_code !~ '^P2S-[0-9a-f]{64}$'),
    'unverified', (select count(*) from public.lot where deleted_at is null and lot_code !~ '^P2S-[0-9a-f]{64}$' and not coordinate_verified),
    'missingCoordinates', (select count(*) from public.lot where deleted_at is null and lot_code !~ '^P2S-[0-9a-f]{64}$' and location_geom is null),
    'pendingCoordinates', (select count(*) from public.lot where deleted_at is null and lot_code !~ '^P2S-[0-9a-f]{64}$' and location_geom is not null and coordinate_status='pending')
  );
end $function$;

CREATE OR REPLACE FUNCTION public.staff_dashboard_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    where l.deleted_at is null and l.lot_code !~ '^P2S-[0-9a-f]{64}$'
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
      'syntheticPlots', (select count(*) from public.lot where deleted_at is null and lot_code ~ '^P2S-[0-9a-f]{64}$'),
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
$function$;

CREATE OR REPLACE FUNCTION public.staff_plot_management(p_query text DEFAULT ''::text, p_area text DEFAULT 'all'::text, p_state text DEFAULT 'all'::text, p_verification text DEFAULT 'all'::text, p_sort text DEFAULT 'updated'::text, p_direction text DEFAULT 'desc'::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
      (l.lot_code ~ '^P2S-[0-9a-f]{64}$') as synthetic_sample,
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
      and (state_filter = 'all' or (not source.synthetic_sample and source.operational_state = state_filter))
      and (verification_filter = 'all' or (not source.synthetic_sample and source.coordinate_state = verification_filter))
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
        'total', count(*) filter (where not synthetic_sample),
        'syntheticPlots', count(*) filter (where synthetic_sample),
        'occupied', count(*) filter (where not synthetic_sample and operational_state = 'occupied'),
        'available', count(*) filter (where not synthetic_sample and operational_state = 'available'),
        'booked', count(*) filter (where not synthetic_sample and operational_state = 'booked'),
        'onHold', count(*) filter (where not synthetic_sample and operational_state = 'hold'),
        'unknown', count(*) filter (where not synthetic_sample and operational_state = 'unknown'),
        'needsVerification', count(*) filter (
          where not synthetic_sample and (location_geom is null or coordinate_status in ('pending', 'rejected'))
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
$function$;

CREATE OR REPLACE FUNCTION public.staff_coordinate_verification(p_query text DEFAULT ''::text, p_area text DEFAULT 'all'::text, p_state text DEFAULT 'actionable'::text, p_sort text DEFAULT 'priority'::text, p_direction text DEFAULT 'asc'::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
      (array_agg(br.burial_id order by br.deleted_at nulls first, br.burial_id))[1] as burial_id,
      bool_and(br.deleted_at is not null) as burial_deleted,
      (array_agg(d.display_name order by br.deleted_at nulls first, br.burial_id))[1] as deceased_name,
      string_agg(d.display_name, ' ') as search_names
    from public.burial_record as br
    left join public.deceased as d on d.deceased_id = br.deceased_id
    group by br.lot_id
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
      assigned.search_names,
      case
        when l.location_geom is null then 'missing'
        when l.coordinate_status = 'rejected' then 'rejected'
        when l.coordinate_status = 'verified' and l.coordinate_verified then 'verified'
        else 'pending'
      end as coordinate_state
    from public.lot as l
    left join public.area as a on a.area_id = l.area_id
    left join assigned on assigned.lot_id = l.lot_id
    where l.deleted_at is null and l.lot_code !~ '^P2S-[0-9a-f]{64}$'
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
              ' ', source.lot_code, source.area_code, source.area_name, source.search_names
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
$function$;

CREATE OR REPLACE FUNCTION public.staff_gis_readiness(p_site_id bigint, p_area_id bigint, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions', 'pg_temp'
AS $function$
declare result jsonb; active_release uuid; active_scope_revision integer:=0;
begin
  if not public.is_active_admin_or_manager() then
    raise exception 'An active staff account is required' using errcode='42501';
  end if;
  if p_site_id is null or p_site_id<=0 or p_area_id is null or p_area_id<=0 then
    raise exception 'Valid positive site and area IDs are required';
  end if;
  if p_page is null or p_page<1 or p_page>100000 then raise exception 'Page is outside the supported bound'; end if;
  if p_page_size is null or p_page_size<1 or p_page_size>50 then raise exception 'Page size is outside the supported bound'; end if;
  select mp.release_id,(select count(*)::integer from public.mapping_publication_event pe
      where pe.site_id=mp.site_id and pe.area_id=mp.area_id)
    into active_release,active_scope_revision
  from public.mapping_publication mp join public.mapping_release mr on mr.release_id=mp.release_id
  where mp.site_id=p_site_id and mp.area_id=p_area_id and mr.site_id=p_site_id and mr.status='published';
  with source as materialized (
    select r.site_id,r.area_id,r.lot_id,r.lot_code,r.occupancy,r.legacy_coordinate,r.release_id,r.scope_revision,
      r.geometry_ready,r.routing_ready,r.reason
    from gis_private.lot_gis_readiness r
    where r.site_id=p_site_id and r.area_id=p_area_id and r.deleted_at is null and r.lot_code !~ '^P2S-[0-9a-f]{64}$'
  ), page_rows as (
    select s.site_id,s.area_id,s.lot_id,s.lot_code,s.occupancy,s.legacy_coordinate,s.release_id,s.scope_revision,
      s.geometry_ready,s.routing_ready,s.reason
    from source s order by s.lot_id limit p_page_size offset (p_page-1)*p_page_size
  )
  select jsonb_build_object(
    'schemaVersion',1,'siteId',p_site_id::text,'areaId',p_area_id::text,
    'releaseId',active_release::text,'scopeRevision',coalesce(active_scope_revision,0),
    'page',p_page,'pageSize',p_page_size,'total',(select count(*) from source),
    'totalPages',case when (select count(*) from source)=0 then 0 else ceil((select count(*) from source)::numeric/p_page_size)::integer end,
    'counts',jsonb_build_object(
      'geometryReady',(select count(*) from source where geometry_ready),
      'routingReady',(select count(*) from source where routing_ready),
      'legacyMissing',(select count(*) from source where legacy_coordinate='missing')),
    'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'lotId',p.lot_id::text,'lotCode',p.lot_code,'areaId',p.area_id::text,'occupancy',p.occupancy,
      'legacyCoordinate',p.legacy_coordinate,'geometryReady',p.geometry_ready,'routingReady',p.routing_ready,
      'reason',p.reason) order by p.lot_id) from page_rows p),'[]'::jsonb)
  ) into result;
  return result;
end $function$;

commit;
