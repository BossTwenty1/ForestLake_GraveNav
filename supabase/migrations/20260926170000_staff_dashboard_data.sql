begin;

-- The administrator dashboard is a bounded operational read model. Keep the
-- aggregation beside the data so the browser receives one intentional payload
-- instead of downloading full burial, lot, area, and audit tables.
create function public.staff_dashboard_data()
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
      )::bigint as on_hold
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

revoke all on function public.staff_dashboard_data() from public;
grant execute on function public.staff_dashboard_data() to authenticated;

create index if not exists audit_log_recent_idx
  on public.audit_log (created_at desc, audit_id desc);

comment on function public.staff_dashboard_data() is
  'Authorized bounded Dashboard read model. Current burial totals exclude soft-deleted records; occupancy follows the existing any-burial-assignment rule; availability requires AVAILABLE status and no burial assignment.';

commit;
