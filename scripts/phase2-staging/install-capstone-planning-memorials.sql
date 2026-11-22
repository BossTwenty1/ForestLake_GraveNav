-- Optional companion to install-capstone-planning-assignments.sql for the local planning map.
begin;

create or replace function public.get_capstone_planning_memorials(p_cad_candidate_id text, p_plan_sha256 text)
returns table(id text, name text, birth_date date, death_date date, reference text)
language sql stable security definer set search_path = pg_catalog
as $$
  select visible.burial_id::text, visible.display_name::text, visible.birth_date, visible.death_date,
    visible.synthetic_plot_reference
  from gis_private.capstone_planning_lot plot
  join gis_private.capstone_visitor_selection approved on approved.lot_id = plot.lot_id
  join public.burial_record br on br.burial_id = approved.burial_id
    and br.deceased_id = approved.deceased_id and br.lot_id = approved.lot_id
  join public.public_burial_records visible on visible.burial_id = br.burial_id
  where plot.cad_candidate_id = p_cad_candidate_id and plot.plan_sha256 = p_plan_sha256
  order by visible.display_name, visible.burial_id
$$;

revoke all on function public.get_capstone_planning_memorials(text,text) from public;
grant execute on function public.get_capstone_planning_memorials(text,text) to anon, authenticated;

commit;
