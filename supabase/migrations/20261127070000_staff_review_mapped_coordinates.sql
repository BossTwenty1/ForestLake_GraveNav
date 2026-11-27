-- Review the coordinate of the exact, already-linked plot through the audited writer.
begin;
create or replace function public.staff_review_mapped_coordinates(
  p_candidate text, p_plan_sha256 text, p_lot_id bigint, p_lot_code text, p_revision integer,
  p_status text, p_reason text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare linked_id bigint; plot public.lot%rowtype; proposed text;
begin
  if not public.is_active_admin() then raise exception 'An active administrator is required' using errcode='42501'; end if;
  if p_candidate is null or p_candidate !~ '^lawn:[1-9][0-9]*$' or length(p_candidate)>24
    or p_plan_sha256 is null or p_plan_sha256 !~ '^[a-f0-9]{64}$'
    or p_lot_id is null or p_lot_code is null or p_revision is null or p_request_id is null
    or p_status is null or p_status not in ('verified','rejected') or length(coalesce(p_reason,''))>2000
    or (p_status='rejected' and nullif(btrim(p_reason),'') is null)
    or to_regclass('gis_private.capstone_planning_lot') is null then
      raise exception 'Invalid coordinate review' using errcode='22023';
  end if;
  execute 'select lot_id from gis_private.capstone_planning_lot where cad_candidate_id=$1 and plan_sha256=$2 for share'
    into linked_id using p_candidate,p_plan_sha256;
  if linked_id is distinct from p_lot_id then raise exception 'The plot link changed; reopen the map' using errcode='40001'; end if;
  select * into plot from public.lot where lot_id=linked_id and deleted_at is null for no key update;
  if not found or plot.lot_code is distinct from p_lot_code or plot.lot_code ~ '^P2S-[0-9a-f]{64}$'
    or plot.location_geom is null then raise exception 'This plot is not ready for coordinate review' using errcode='22023'; end if;
  if to_regclass('phase2_review.plot_draft') is not null then
    execute 'select nullif(proposed_code, '''') from phase2_review.plot_draft where cad_candidate=$1' into proposed using p_candidate;
    if proposed is not null and proposed <> plot.lot_code then
      raise exception 'The plot code and map match need review first' using errcode='22023';
    end if;
  end if;
  return public.staff_save_record('lot',p_lot_id::text,p_revision,
    jsonb_build_object('status',p_status,'reason',coalesce(p_reason,'')),p_request_id,'review');
end;
$$;
revoke all on function public.staff_review_mapped_coordinates(text,text,bigint,text,integer,text,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.staff_review_mapped_coordinates(text,text,bigint,text,integer,text,text,uuid) to authenticated;
commit;
