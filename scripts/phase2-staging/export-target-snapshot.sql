-- Run through a verified local Docker/PostgreSQL connection only. No hosted connection is made by the preview tools.
begin read only;
do $$ begin
 if to_regclass('public.site') is null or to_regclass('public.lot') is null then raise exception 'Wrong database model: expected the release candidate site/area/sector/block/lot schema';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='lot' and column_name='lot_id' and data_type='bigint') then raise exception 'Expected existing text-exported bigint lot IDs';end if;
end $$;
select jsonb_build_object(
 'model','gravenav-site-area-lot-bigint-v1',
 'origin',jsonb_build_object('kind',case when current_database() like 'gravenav_phase2_stage_%' then 'disposable-test-fixture' else 'local-read-only-snapshot' end,'database',current_database(),'captured_at',current_timestamp,'server_version',current_setting('server_version')),
 'site',coalesce((select jsonb_agg(jsonb_build_object('site_id',site_id::text,'site_name',site_name) order by site_id) from public.site),'[]'::jsonb),
 'area',coalesce((select jsonb_agg(jsonb_build_object('area_id',area_id::text,'site_id',site_id::text,'area_code',area_code,'area_name',area_name,'area_category',area_category) order by area_id) from public.area),'[]'::jsonb),
 'sector',coalesce((select jsonb_agg(jsonb_build_object('sector_id',sector_id::text,'area_id',area_id::text,'sector_code',sector_code) order by sector_id) from public.sector),'[]'::jsonb),
 'block',coalesce((select jsonb_agg(jsonb_build_object('block_id',block_id::text,'sector_id',sector_id::text,'block_number',block_number) order by block_id) from public.block),'[]'::jsonb),
 'lot',coalesce((select jsonb_agg(jsonb_build_object('lot_id',lot_id::text,'area_id',area_id::text,'block_id',block_id::text,'lot_code',lot_code,'revision',revision,'deleted',deleted_at is not null) order by lot_id) from public.lot),'[]'::jsonb));
rollback;
