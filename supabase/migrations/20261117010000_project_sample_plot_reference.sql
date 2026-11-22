begin;

-- Project samples retain the real lot code. Publish only their bounded fictional
-- display reference, never private notes, source paths, owners or CAD identity.
create or replace function public.project_sample_plot_reference(p_source text, p_notes text, p_lot_id text)
returns text language plpgsql immutable parallel safe set search_path = pg_catalog
as $$
declare note jsonb; reference text;
begin
 if p_source is distinct from 'GRAVENAV_PHASE2_PROJECT_SAMPLE_V1' then return null; end if;
 begin note := p_notes::jsonb; exception when invalid_text_representation then return null; end;
 if jsonb_typeof(note) is distinct from 'object'
   or note->>'data_classification' is distinct from 'PROJECT_SAMPLE_FICTIONAL'
   or jsonb_typeof(note->'existing_lot_id') is distinct from 'string'
   or note->>'existing_lot_id' is distinct from p_lot_id
   or jsonb_typeof(note->'source_row_key') is distinct from 'string'
   or coalesce(note->>'source_row_key','') !~ '^[0-9a-f]{64}$'
   or jsonb_typeof(note->'display_reference') is distinct from 'string' then return null; end if;
 reference := btrim(note->>'display_reference');
 if length(reference) not between 1 and 200 then return null; end if;
 return reference;
end $$;
revoke all on function public.project_sample_plot_reference(text,text,text) from public;
grant execute on function public.project_sample_plot_reference(text,text,text) to anon, authenticated;

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
revoke all on public.public_burial_records from public;
grant select on public.public_burial_records to anon, authenticated;

-- Staff use the same projection. Conflicting references at a shared lot are
-- withheld for review instead of selecting an arbitrary person's provenance.
create or replace function public.staff_sample_plot_references(p_lot_ids bigint[])
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
 if not public.is_active_admin_or_manager() then
   raise exception 'An active staff account is required' using errcode = '42501';
 end if;
 if coalesce(cardinality(p_lot_ids),0) > 100 then raise exception 'At most 100 plot IDs are allowed'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('lotId',lot_id::text,'reference',reference)), '[]'::jsonb)
 from (select br.lot_id, case when count(distinct public.project_sample_plot_reference(br.record_source,br.quality_notes,br.lot_id::text)) = 1
   then min(public.project_sample_plot_reference(br.record_source,br.quality_notes,br.lot_id::text)) end as reference
   from public.burial_record br join public.lot l using(lot_id)
   where br.lot_id = any(p_lot_ids) and br.deleted_at is null and l.deleted_at is null
   group by br.lot_id) refs);
end $$;
revoke all on function public.staff_sample_plot_references(bigint[]) from public, anon;
grant execute on function public.staff_sample_plot_references(bigint[]) to authenticated;

create or replace function public.search_public_burials(
 p_query text default '', p_section text default 'all', p_year text default 'any',
 p_sort text default 'name', p_page integer default 1, p_page_size integer default 20
) returns jsonb language plpgsql stable security definer
set search_path = public, extensions, pg_temp
as $$
declare q text := public.search_normalize(left(coalesce(p_query, ''), 160));
 size integer := greatest(1, least(coalesce(p_page_size, 20), 50));
 page integer := greatest(1, least(coalesce(p_page, 1), 10000));
 result jsonb;
begin
 with candidates as (
 select v.*, case
   when q = '' then 1
   when public.search_name_key(v.display_name) = public.search_name_key(q)
     or replace(public.search_normalize(v.lot_code), ' ', '') = replace(q, ' ', '')
     or replace(public.search_normalize(v.synthetic_plot_reference), ' ', '') = replace(q, ' ', '') then 0
   when not exists (select 1 from regexp_split_to_table(q, ' +') token
     where position(token in public.search_normalize(v.display_name)) = 0)
     or position(replace(q, ' ', '') in replace(public.search_normalize(v.lot_code), ' ', '')) > 0
   or position(replace(q, ' ', '') in replace(public.search_normalize(v.synthetic_plot_reference), ' ', '')) > 0 then 1
   else 2 end as rank,
 extensions.similarity(public.search_normalize(v.display_name), q) as score
 from public.public_burial_records v
 where (coalesce(p_section, 'all') = 'all' or v.area_name = p_section)
 and (coalesce(p_year, 'any') = 'any'
   or (p_year = '1800-1899' and v.death_date >= date '1800-01-01' and v.death_date < date '1900-01-01')
   or (p_year = '1900-1999' and v.death_date >= date '1900-01-01' and v.death_date < date '2000-01-01')
   or (p_year = '2000-present' and v.death_date >= date '2000-01-01'))
 -- Keep the 0.3 cutoff without requiring permission to set an extension parameter.
 and (q = '' or extensions.similarity(public.search_normalize(v.display_name), q) >= 0.3::real
   or not exists (select 1 from regexp_split_to_table(q, ' +') token
     where position(token in public.search_normalize(v.display_name)) = 0)
   or position(replace(q, ' ', '') in replace(public.search_normalize(v.lot_code), ' ', '')) > 0
   or position(replace(q, ' ', '') in replace(public.search_normalize(v.synthetic_plot_reference), ' ', '')) > 0)
 ), paged as (
 select *, case rank when 0 then 'exact' when 1 then 'matched' else 'similar' end as match_type
 from candidates order by rank,
 case when rank = 2 then score end desc,
 case when p_sort = 'newest' then death_date end desc nulls last,
 display_name, burial_id limit size offset (page - 1) * size
 ) select jsonb_build_object('items', coalesce((select jsonb_agg(to_jsonb(paged) - 'rank' - 'score') from paged), '[]'::jsonb),
 'total', (select count(*) from candidates), 'page', page, 'pageSize', size) into result;
 return result;
end $$;
revoke all on function public.search_public_burials(text,text,text,text,integer,integer) from public;
grant execute on function public.search_public_burials(text,text,text,text,integer,integer) to anon, authenticated;
commit;
