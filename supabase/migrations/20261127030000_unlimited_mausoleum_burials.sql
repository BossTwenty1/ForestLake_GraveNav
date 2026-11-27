-- Mausoleums have no configured burial limit; regular graves remain limited to six.
begin;

create or replace function public.grave_interment_limit(p_type text, p_approved_capacity integer)
returns integer language sql immutable set search_path = pg_catalog
as $$
  select case p_type when 'regular' then 6 when 'mausoleum' then null else 1 end
$$;

create or replace function public.guard_grave_policy()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare highest_slot integer;
begin
  if tg_op = 'UPDATE' then
    if (new.grave_type, new.grave_policy_reference, new.approved_mausoleum_capacity)
      is not distinct from (old.grave_type, old.grave_policy_reference, old.approved_mausoleum_capacity) then
      return new;
    end if;
  elsif new.grave_type is null and new.grave_policy_reference is null and new.approved_mausoleum_capacity is null then
    return new;
  end if;
  if not public.is_active_admin() then
    raise exception 'Only administrators may approve grave classification or mausoleum capacity' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    insert into public.grave_interment_write_fence(lot_id) values (new.lot_id)
      on conflict (lot_id) do update set lot_id = excluded.lot_id;
  end if;
  select max(interment_slot) into highest_slot from public.burial_record where lot_id = new.lot_id;
  if new.grave_type is distinct from 'mausoleum' and highest_slot > greatest(1, public.grave_interment_limit(new.grave_type, new.approved_mausoleum_capacity)) then
    raise exception 'Approved capacity cannot be reduced below existing reservations';
  end if;
  return new;
end
$$;

create or replace function public.reserve_interment_slot()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  plot public.lot%rowtype;
  new_slot boolean := tg_op = 'INSERT';
  check_order boolean := tg_op = 'INSERT';
  legacy_active boolean := false;
begin
  new.interment_order_number := nullif(btrim(new.interment_order_number), '');
  if tg_op = 'UPDATE' then
    -- Only pre-migration rows can carry an unknown confirmation state.
    if old.interment_confirmed is false and new.interment_confirmed is null then
      new.interment_confirmed := false;
    end if;
    new_slot := new.lot_id is distinct from old.lot_id;
    check_order := new_slot or new.interment_order_number is distinct from old.interment_order_number
      or (new.interment_confirmed is true and old.interment_confirmed is not true);
    legacy_active := not new_slot and old.interment_confirmed is null and old.record_status = 'active';
    if old.interment_confirmed is true and (new.interment_confirmed is not true
      or new.interment_order_number is distinct from old.interment_order_number) then
      raise exception 'Confirmed interment approval and order are retained; refer corrections for reconciliation';
    end if;
    if new_slot then
      perform 1 from public.lot where lot_id in (old.lot_id, new.lot_id)
        order by lot_id for no key update;
      if old.interment_confirmed is true or exists (
        select 1 from public.lot where lot_id = old.lot_id and grave_type is not null
      ) then
        raise exception 'Moving a classified or confirmed interment requires a separate reconciliation';
      end if;
    else
      new.interment_slot := old.interment_slot;
    end if;
  else
    new.interment_confirmed := coalesce(new.interment_confirmed, false);
  end if;

  if new_slot or check_order or new.interment_confirmed is true then
    select * into plot from public.lot where lot_id = new.lot_id and deleted_at is null for no key update;
    if not found then raise exception 'The plot is unavailable'; end if;
    insert into public.grave_interment_write_fence(lot_id) values (new.lot_id)
      on conflict (lot_id) do update set lot_id = excluded.lot_id;
  else
    select * into plot from public.lot where lot_id = new.lot_id and deleted_at is null;
  end if;
  if not found then raise exception 'The plot is unavailable'; end if;

  if new_slot then
    if plot.status <> 'AVAILABLE' then raise exception 'The selected plot is not available'; end if;
    select coalesce(max(interment_slot), 0) + 1 into new.interment_slot
      from public.burial_record where lot_id = new.lot_id;
    if plot.grave_type is distinct from 'mausoleum' and new.interment_slot > public.grave_interment_limit(plot.grave_type, plot.approved_mausoleum_capacity) then
      if plot.grave_type is null then raise exception 'The selected plot already has a burial record'; end if;
      raise exception 'The plot has no remaining approved interment capacity';
    end if;
  end if;

  if check_order and new.interment_order_number is not null and exists (
    select 1 from public.burial_record b
    where b.lot_id = new.lot_id and b.burial_id is distinct from new.burial_id
      and lower(btrim(b.interment_order_number)) = lower(new.interment_order_number)
  ) then raise exception 'This interment order already has a record on the plot; reconcile it before proceeding'; end if;

  if new.interment_confirmed is true and exists (
    select 1 from public.deceased incoming
    join public.burial_record existing on existing.lot_id = new.lot_id
      -- A pending duplicate cannot block editing or recovery of a confirmed burial.
      and existing.interment_confirmed is not false
      and existing.burial_id is distinct from new.burial_id and existing.deceased_id <> new.deceased_id
    join public.deceased known on known.deceased_id = existing.deceased_id
    where incoming.deceased_id = new.deceased_id
      and lower(regexp_replace(btrim(incoming.display_name), '\s+', ' ', 'g')) =
          lower(regexp_replace(btrim(known.display_name), '\s+', ' ', 'g'))
      and (incoming.birth_date is not null or incoming.death_date is not null)
      and (incoming.birth_date, incoming.death_date) is not distinct from (known.birth_date, known.death_date)
  ) then raise exception 'A matching person already has an association at this plot; reconcile before proceeding'; end if;

  if new.interment_confirmed is true and (new.interment_order_number is null or new.interment_date is null) then
    raise exception 'Confirm an interment only with a reviewed order and interment date';
  end if;
  if plot.grave_type is not null and new.record_status = 'active'
    and new.interment_confirmed is not true and not legacy_active then
    raise exception 'Resolve and confirm the interment before making its record active';
  end if;
  return new;
end
$$;

create or replace function public.staff_interment_plot_options()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_active_admin_or_manager() then
    raise exception 'An active staff account is required' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'lotId', lot_id, 'lotCode', lot_code, 'section', area_name, 'status', 'AVAILABLE',
      'graveType', grave_type, 'confirmedCount', confirmed, 'remaining', case when grave_type='mausoleum' then null else capacity - reserved end
    ) order by lot_code, lot_id), '[]'::jsonb)
    from (
      select l.lot_id, l.lot_code, l.grave_type, a.area_name,
        public.grave_interment_limit(l.grave_type, l.approved_mausoleum_capacity) as capacity,
        coalesce(max(b.interment_slot), 0) as reserved,
        count(*) filter (where b.interment_confirmed is true) as confirmed
      from public.lot l join public.area a on a.area_id = l.area_id
      left join public.burial_record b on b.lot_id = l.lot_id
      where l.deleted_at is null and l.status = 'AVAILABLE'
      group by l.lot_id, a.area_name
    ) choices where grave_type='mausoleum' or capacity > reserved
  );
end
$$;

create or replace function public.staff_plot_management(p_query text DEFAULT ''::text, p_area text DEFAULT 'all'::text, p_state text DEFAULT 'all'::text, p_verification text DEFAULT 'all'::text, p_sort text DEFAULT 'updated'::text, p_direction text DEFAULT 'desc'::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20)
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
      case when l.grave_type='mausoleum' then null else greatest(0, public.grave_interment_limit(l.grave_type, l.approved_mausoleum_capacity)
        - coalesce(assigned.reserved, 0)) end as remaining,
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

commit;
