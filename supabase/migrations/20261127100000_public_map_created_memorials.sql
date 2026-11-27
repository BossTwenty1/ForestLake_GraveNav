-- A staff-created map burial may be displayed while its interment confirmation
-- remains pending, but only when public display is selected and a map link exists.
begin;
do $migration$
declare sample_condition text := 'false'; map_condition text := 'false';
begin
  if to_regclass('gis_private.capstone_visitor_selection') is not null then
    sample_condition := $sample$br.record_status='pending' and br.interment_confirmed is false
      and l.location_geom is null and l.coordinate_verified is false
      and public.project_sample_plot_reference(br.record_source,br.quality_notes,l.lot_id::text) is not null
      and exists (select 1 from gis_private.capstone_visitor_selection selected
        where selected.burial_id=br.burial_id and selected.deceased_id=d.deceased_id and selected.lot_id=l.lot_id)$sample$;
  end if;
  if to_regclass('gis_private.capstone_planning_lot') is not null then
    map_condition := $map$br.record_status='pending' and br.record_source='GRAVENAV_MAP_PUBLIC_V1'
      and exists (select 1 from gis_private.capstone_planning_lot linked where linked.lot_id=l.lot_id
        and linked.plan_sha256='02a4dba490872f9be8cf56280ccf432d31796431c1f808f542fbff86ac28ca77')$map$;
  end if;
  execute format($view$
    create or replace view public.public_burial_records with (security_barrier=true) as
    select br.burial_id,d.display_name,d.birth_date,d.death_date,br.record_status,l.lot_code,
      (case when br.record_status='active' or (%2$s) then l.location_geom end)::extensions.geography(Point,4326) as location_geom,
      case when br.record_status='active' or (%2$s) then l.px_loc_x end as px_loc_x,
      case when br.record_status='active' or (%2$s) then l.px_loc_y end as px_loc_y,
      case when br.record_status='active' or (%2$s) then l.coordinate_verified else false end as location_verified,
      coalesce(a.area_name,la.area_name) as area_name,s.sector_name,b.block_number,br.interment_date,
      case when br.record_status='active' or (%2$s) then l.coordinate_status end as coordinate_status,
      public.project_sample_plot_reference(br.record_source,br.quality_notes,l.lot_id::text) as synthetic_plot_reference,br.inscription
    from public.burial_record br join public.deceased d using(deceased_id) join public.lot l using(lot_id)
    left join public.area a on a.area_id=l.area_id left join public.block b using(block_id)
    left join public.sector s using(sector_id) left join public.area la on la.area_id=s.area_id
    where d.public_display and br.deleted_at is null and l.deleted_at is null
      and (br.record_status='active' or (%1$s) or (%2$s))
  $view$,sample_condition,map_condition);
  if to_regprocedure('public.get_capstone_planning_memorials(text,text)') is not null
    and to_regprocedure('public.get_capstone_planning_plot(bigint,text)') is not null
    and to_regclass('gis_private.capstone_visitor_selection') is not null
    and to_regclass('gis_private.capstone_planning_lot') is not null then
    execute $sql$create or replace function public.get_capstone_planning_memorials(p_cad_candidate_id text,p_plan_sha256 text)
      returns table(id text,name text,birth_date date,death_date date,reference text)
      language sql stable security definer set search_path=pg_catalog as $body$
      select visible.burial_id::text,visible.display_name::text,visible.birth_date,visible.death_date,visible.synthetic_plot_reference
      from gis_private.capstone_planning_lot plot join public.burial_record br on br.lot_id=plot.lot_id
      join public.public_burial_records visible on visible.burial_id=br.burial_id
      where plot.cad_candidate_id=p_cad_candidate_id and plot.plan_sha256=p_plan_sha256
        and (br.record_status='active' or br.record_source='GRAVENAV_MAP_PUBLIC_V1' or exists
          (select 1 from gis_private.capstone_visitor_selection a where a.burial_id=br.burial_id and a.deceased_id=br.deceased_id and a.lot_id=br.lot_id))
      order by visible.display_name,visible.burial_id $body$$sql$;
    execute $sql$create or replace function public.get_capstone_planning_plot(p_burial_id bigint,p_plan_sha256 text)
      returns text language sql stable security definer set search_path=pg_catalog as $body$
      select plot.cad_candidate_id from gis_private.capstone_planning_lot plot
      join public.burial_record br on br.lot_id=plot.lot_id join public.public_burial_records visible on visible.burial_id=br.burial_id
      where visible.burial_id=p_burial_id and plot.plan_sha256=p_plan_sha256
        and (br.record_status='active' or br.record_source='GRAVENAV_MAP_PUBLIC_V1' or exists
          (select 1 from gis_private.capstone_visitor_selection a where a.burial_id=br.burial_id and a.deceased_id=br.deceased_id and a.lot_id=br.lot_id)) $body$$sql$;
  end if;
end;
$migration$;
commit;
