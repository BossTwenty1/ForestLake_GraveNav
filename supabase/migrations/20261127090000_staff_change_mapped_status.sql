-- Change an empty, linked lawn plot without moving or changing its coordinates.
begin;
create or replace function public.staff_change_mapped_status(
 p_candidate text,p_plan_sha256 text,p_lot_id bigint,p_lot_code text,p_revision integer,p_status text,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare linked_id bigint; plot public.lot%rowtype; proposed text; unavailable text; stored_status text; kind text; receipt jsonb;
begin
 if not public.is_active_admin_or_manager() then raise exception 'Active staff access is required' using errcode='42501'; end if;
 if p_candidate is null or p_candidate !~ '^lawn:[1-9][0-9]*$' or length(p_candidate)>24
   or p_plan_sha256 is null or p_plan_sha256 !~ '^[a-f0-9]{64}$' or p_lot_id is null or p_lot_code is null
   or p_revision is null or p_request_id is null or p_status is null
   or p_status not in ('available','booked','hold','unavailable')
   or to_regclass('gis_private.capstone_planning_lot') is null then
   raise exception 'Invalid plot status request' using errcode='22023';
 end if;
 execute 'select lot_id from gis_private.capstone_planning_lot where cad_candidate_id=$1 and plan_sha256=$2 for share'
  into linked_id using p_candidate,p_plan_sha256;
 if linked_id is distinct from p_lot_id then raise exception 'Plot link changed; reopen the map' using errcode='40001'; end if;
 select * into plot from public.lot where lot_id=linked_id and deleted_at is null for no key update;
 if not found or plot.lot_code is distinct from p_lot_code or plot.lot_code ~ '^P2S-[0-9a-f]{64}$'
   then raise exception 'This plot is not ready for a status change' using errcode='22023'; end if;
 if exists(select 1 from public.burial_record b where b.lot_id=linked_id) then
   raise exception 'This plot has burial records; its status cannot be changed here' using errcode='22023';
 end if;
 if to_regclass('phase2_review.plot_draft') is not null then
   execute 'select proposed_code,review_availability from phase2_review.plot_draft where cad_candidate=$1' into proposed,unavailable using p_candidate;
   if proposed is not null and (proposed<>plot.lot_code or unavailable is not null) then
     raise exception 'The plot match needs review first' using errcode='22023';
   end if;
 end if;
 stored_status := case p_status when 'available' then 'AVAILABLE' when 'booked' then 'BOOKED' else 'HOLD' end;
 kind := case p_status when 'hold' then 'on_hold' when 'unavailable' then 'unavailable' else null end;
 receipt := public.staff_save_record('lot',p_lot_id::text,p_revision,
  jsonb_build_object('lot_code',plot.lot_code,'area_id',plot.area_id,'location_geom',to_jsonb(plot)->'location_geom','status',stored_status),p_request_id,'save');
 update public.lot set hold_kind=kind where lot_id=p_lot_id and hold_kind is distinct from kind;
 return receipt;
end;
$$;
revoke all on function public.staff_change_mapped_status(text,text,bigint,text,integer,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.staff_change_mapped_status(text,text,bigint,text,integer,text,uuid) to authenticated;
commit;
