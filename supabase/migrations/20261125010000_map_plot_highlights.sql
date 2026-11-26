-- A read-only batch of outline identifiers. No plot, burial, or release is changed.
begin;

create function public.map_plot_highlights(
  p_plan_sha256 text, p_release_id uuid default null, p_staff boolean default false
) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp
as $$
declare
  memorials text[] := '{}';
  occupied text[] := '{}';
begin
  if p_staff and not public.is_active_admin_or_manager() then
    raise exception 'An active staff account is required' using errcode = '42501';
  end if;

  if p_release_id is not null then
    with mapped as (
      select r.lot_id, r.lot_code, r.occupancy
      from gis_private.lot_gis_readiness r
      where r.release_id = p_release_id and r.geometry_ready
    ), visible_lots as (
      select distinct br.lot_id
      from public.public_burial_records visible
      join public.burial_record br using (burial_id)
      join mapped using (lot_id)
      where visible.record_status = 'active'
    )
    select
      coalesce(array_agg(mapped.lot_id::text order by mapped.lot_id)
        filter (where visible_lots.lot_id is not null), '{}'),
      coalesce(array_agg(mapped.lot_id::text order by mapped.lot_id)
        filter (where p_staff and mapped.occupancy = 'occupied'
          and mapped.lot_code !~ '^P2S-[0-9a-f]{64}$'), '{}')
    into memorials, occupied
    from mapped left join visible_lots using (lot_id);
  elsif to_regclass('gis_private.capstone_planning_lot') is not null
      and to_regclass('gis_private.capstone_visitor_selection') is not null then
    -- The capstone planning tables are optional in an ordinary GraveNav database.
    execute $planning$
      with mapped as (
        select plot.cad_candidate_id, plot.lot_id, lot.lot_code
        from gis_private.capstone_planning_lot plot
        join public.lot lot using (lot_id)
        where plot.plan_sha256 = $1 and lot.deleted_at is null
      ), visible_lots as (
        select distinct approved.lot_id
        from gis_private.capstone_visitor_selection approved
        join public.burial_record br on br.burial_id = approved.burial_id
          and br.deceased_id = approved.deceased_id and br.lot_id = approved.lot_id
        join public.public_burial_records visible on visible.burial_id = br.burial_id
        join mapped on mapped.lot_id = approved.lot_id
      )
      select
        coalesce(array_agg(mapped.cad_candidate_id order by mapped.cad_candidate_id)
          filter (where visible_lots.lot_id is not null), '{}'),
        coalesce(array_agg(mapped.cad_candidate_id order by mapped.cad_candidate_id)
          filter (where $2 and mapped.lot_code !~ '^P2S-[0-9a-f]{64}$'
            and exists (select 1 from public.burial_record br where br.lot_id = mapped.lot_id)), '{}')
      from mapped left join visible_lots using (lot_id)
    $planning$ into memorials, occupied using p_plan_sha256, p_staff;
  end if;

  return jsonb_build_object('memorials', memorials, 'occupied', occupied);
end;
$$;

revoke all on function public.map_plot_highlights(text, uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.map_plot_highlights(text, uuid, boolean) to anon, authenticated;

commit;
