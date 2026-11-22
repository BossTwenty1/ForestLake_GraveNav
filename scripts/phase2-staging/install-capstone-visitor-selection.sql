-- Optional capstone environment only. Apply after approving the exact target.
-- This installs an empty approval list. No records are selected by this file.
begin;

create table gis_private.capstone_visitor_selection (
  burial_id bigint primary key references public.burial_record(burial_id) on delete cascade,
  deceased_id bigint not null references public.deceased(deceased_id),
  lot_id bigint not null references public.lot(lot_id),
  review_reference text not null check (length(btrim(review_reference)) between 1 and 250),
  approved_at timestamptz not null default now()
);

alter table gis_private.capstone_visitor_selection enable row level security;
revoke all on gis_private.capstone_visitor_selection from public, anon, authenticated, service_role;

-- Keep normal operational eligibility and add only the exact reviewed pending records.
-- The per-person public flag remains necessary. Selected records retain their real status.
create or replace view public.public_burial_records with (security_barrier = true) as
select br.burial_id,d.display_name,d.birth_date,d.death_date,br.record_status,l.lot_code,
 (case when br.record_status='active' then l.location_geom end)::extensions.geography(Point,4326) as location_geom,
 case when br.record_status='active' then l.px_loc_x end as px_loc_x,
 case when br.record_status='active' then l.px_loc_y end as px_loc_y,
 case when br.record_status='active' then l.coordinate_verified else false end as location_verified,
 coalesce(a.area_name,la.area_name) as area_name,s.sector_name,b.block_number,br.interment_date,
 case when br.record_status='active' then l.coordinate_status end as coordinate_status,
 public.project_sample_plot_reference(br.record_source,br.quality_notes,l.lot_id::text) as synthetic_plot_reference
from public.burial_record br join public.deceased d using(deceased_id) join public.lot l using(lot_id)
left join public.area a on a.area_id=l.area_id left join public.block b using(block_id)
left join public.sector s using(sector_id) left join public.area la on la.area_id=s.area_id
where d.public_display and br.deleted_at is null and l.deleted_at is null
 and (br.record_status='active' or (
   br.record_status='pending' and br.interment_confirmed is false
   and l.location_geom is null and l.coordinate_verified is false
   and public.project_sample_plot_reference(br.record_source,br.quality_notes,l.lot_id::text) is not null
   and exists (
     select 1 from gis_private.capstone_visitor_selection selected
     where selected.burial_id=br.burial_id and selected.deceased_id=d.deceased_id and selected.lot_id=l.lot_id
   )
 ));

-- Extending the memorial reader does not extend photo-metadata eligibility.
create or replace view public.public_burial_photos with (security_barrier = true) as
select p.photo_id,p.burial_id,p.storage_path,p.file_name,p.caption,p.captured_at
from public.photo p join public.public_burial_records br using(burial_id)
where p.approval_status='approved' and p.public_display and br.record_status='active';

commit;
