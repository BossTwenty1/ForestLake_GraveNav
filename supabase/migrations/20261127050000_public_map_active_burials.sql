-- Include publicly eligible active burials on an already linked map plot.
-- Pending capstone samples still require their individual selection.
begin;
do $migration$
begin
  if to_regclass('gis_private.capstone_planning_lot') is null
      or to_regclass('gis_private.capstone_visitor_selection') is null
      or to_regprocedure('public.get_capstone_planning_memorials(text,text)') is null
      or to_regprocedure('public.get_capstone_planning_plot(bigint,text)') is null then
    return;
  end if;
  execute $sql$
    create or replace function public.get_capstone_planning_memorials(p_cad_candidate_id text, p_plan_sha256 text)
    returns table(id text, name text, birth_date date, death_date date, reference text)
    language sql stable security definer set search_path = pg_catalog as $body$
      select visible.burial_id::text, visible.display_name::text, visible.birth_date, visible.death_date, visible.synthetic_plot_reference
      from gis_private.capstone_planning_lot plot
      join public.burial_record br on br.lot_id=plot.lot_id
      join public.public_burial_records visible on visible.burial_id=br.burial_id
      where plot.cad_candidate_id=p_cad_candidate_id and plot.plan_sha256=p_plan_sha256
        and (br.record_status='active' or exists (
          select 1 from gis_private.capstone_visitor_selection approved
          where approved.burial_id=br.burial_id and approved.deceased_id=br.deceased_id and approved.lot_id=br.lot_id
        ))
      order by visible.display_name, visible.burial_id
    $body$
  $sql$;
  execute $sql$
    create or replace function public.get_capstone_planning_plot(p_burial_id bigint, p_plan_sha256 text)
    returns text language sql stable security definer set search_path = pg_catalog as $body$
      select plot.cad_candidate_id
      from gis_private.capstone_planning_lot plot
      join public.burial_record br on br.lot_id=plot.lot_id
      join public.public_burial_records visible on visible.burial_id=br.burial_id
      where visible.burial_id=p_burial_id and plot.plan_sha256=p_plan_sha256
        and (br.record_status='active' or exists (
          select 1 from gis_private.capstone_visitor_selection approved
          where approved.burial_id=br.burial_id and approved.deceased_id=br.deceased_id and approved.lot_id=br.lot_id
        ))
    $body$
  $sql$;
end;
$migration$;
commit;
