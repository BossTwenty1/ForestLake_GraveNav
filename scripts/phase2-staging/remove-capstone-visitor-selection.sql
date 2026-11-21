-- Restore the two original public views before dropping this optional feature.
begin;

create or replace view public.public_burial_records with (security_barrier = true) as
select br.burial_id,d.display_name,d.birth_date,d.death_date,br.record_status,l.lot_code,l.location_geom,
 l.px_loc_x,l.px_loc_y,l.coordinate_verified as location_verified,
 coalesce(a.area_name,la.area_name) as area_name,s.sector_name,b.block_number,br.interment_date,
 l.coordinate_status,
 public.project_sample_plot_reference(br.record_source,br.quality_notes,l.lot_id::text) as synthetic_plot_reference
from public.burial_record br join public.deceased d using(deceased_id) join public.lot l using(lot_id)
left join public.area a on a.area_id=l.area_id left join public.block b using(block_id)
left join public.sector s using(sector_id) left join public.area la on la.area_id=s.area_id
where br.record_status='active' and d.public_display and br.deleted_at is null and l.deleted_at is null;

create or replace view public.public_burial_photos with (security_barrier = true) as
select p.photo_id,p.burial_id,p.storage_path,p.file_name,p.caption,p.captured_at
from public.photo p join public.public_burial_records br using(burial_id)
where p.approval_status='approved' and p.public_display;

drop table gis_private.capstone_visitor_selection;
commit;
