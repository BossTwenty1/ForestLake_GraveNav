\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database() not like 'gravenav_phase2_stage_%' then raise exception 'Disposable staging database required'; end if;
 if exists(select 1 from public.site) or exists(select 1 from public.lot) or exists(select 1 from public.deceased) then raise exception 'Fixture tests require an otherwise empty disposable RC schema';end if;
end $$;
-- Physical/staff fixtures exist only in this rollback transaction. No deceased is created.
insert into auth.users(id) values('20000000-0000-0000-0000-000000000001');
insert into public.account(account_id,role_id,username,is_active,account_status,approved_at)
select '20000000-0000-0000-0000-000000000001',role_id,'LOCAL-STAGING-FIXTURE-ONLY',true,'ACTIVE',now() from public.role where role_name='ADMIN';
insert into public.site(site_id,site_name,address) values(9007199254740993,'Fictional staging safeguard fixture','Disposable local test only');
insert into public.area(area_id,site_id,area_code,area_name,area_category) values(9007199254740994,9007199254740993,'TEST-ONLY','Fictional staging area','garden');
insert into public.sector(sector_id,area_id,sector_code) values(9007199254740995,9007199254740994,'TEST-ONLY');
insert into public.block(block_id,sector_id,block_number) values(9007199254740996,9007199254740995,51);
select setval(pg_get_serial_sequence('public.lot','lot_id'),9007199254740996,true);
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
set local role authenticated;
do $$
declare saved jsonb; replay jsonb; request_id uuid:=gen_random_uuid(); patch jsonb:=jsonb_build_object('area_id','9007199254740994','block_id','9007199254740996','lot_code','LOCAL-STAGING-FIXTURE-ONLY','status','HOLD');
begin
 saved:=public.staff_save_record('lot',null,null,patch,request_id,'save');
 replay:=public.staff_save_record('lot',null,null,patch,request_id,'save');
 if saved<>replay or saved->>'id'<>'9007199254740997' then raise exception 'ID or retry receipt changed';end if;
end $$;
reset role;
create temporary table fixture_lot_before on commit drop as select to_jsonb(l) payload from public.lot l;
create temporary table fixture_stage_link(source_ref text primary key,existing_lot_id bigint not null,expected_revision int not null) on commit drop;
insert into fixture_stage_link select 'LOCAL-FIXTURE-ONLY',lot_id,revision from public.lot where lot_code='LOCAL-STAGING-FIXTURE-ONLY';
do $$ begin
 if (select existing_lot_id from fixture_stage_link)<>9007199254740997 then raise exception 'Staging coerced the existing ID';end if;
 if (select count(*) from public.lot)<>1 then raise exception 'Retry created another physical plot';end if;
 if exists(select 1 from public.lot where status<>'HOLD' or grave_type is not null or lot_owner_id is not null or location_geom is not null or coordinate_verified) then raise exception 'Staging changed operational facts';end if;
 if exists(select 1 from public.lot l where to_jsonb(l) is distinct from(select payload from fixture_lot_before)) then raise exception 'Existing fixture row changed';end if;
 if public.grave_interment_limit('regular',null)<>6 or public.grave_interment_limit('mausoleum',null)<>0 then raise exception 'Shared-gravesite capacity rules changed';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.burial_record'::regclass and conname='burial_lot_interment_slot_key' and contype='u') then raise exception 'Shared interment slot uniqueness missing';end if;
 if has_table_privilege('anon','public.lot','INSERT') or has_table_privilege('authenticated','public.lot','INSERT') then raise exception 'Direct operational writes exposed';end if;
 if exists(select 1 from public.deceased) or exists(select 1 from public.burial_record) or exists(select 1 from public.lot_owner) then raise exception 'Personal fixtures were created';end if;
end $$;
set local role authenticated;
do $$
declare saved jsonb; changed jsonb; dashboard jsonb; plots jsonb; readiness jsonb;
 patch jsonb:=jsonb_build_object('area_id','9007199254740994','lot_code','LOCAL-UNKNOWN-STATUS-FIXTURE');
begin
 saved:=public.staff_save_record('lot',null,null,patch,gen_random_uuid(),'save');
 if (select status from public.lot where lot_id=(saved->>'id')::bigint)<>'UNKNOWN' then raise exception 'Missing status did not default to UNKNOWN';end if;
 changed:=public.staff_save_record('lot',saved->>'id',(saved->>'revision')::int,
   patch||jsonb_build_object('status','UNKNOWN'),gen_random_uuid(),'save');
 if (select status from public.lot where lot_id=(saved->>'id')::bigint)<>'UNKNOWN' then raise exception 'Explicit UNKNOWN update failed';end if;
 changed:=public.staff_save_record('lot',saved->>'id',(changed->>'revision')::int,
   patch||jsonb_build_object('legacy_pa_number','LOCAL-TEST-ONLY'),gen_random_uuid(),'save');
 if (select status from public.lot where lot_id=(saved->>'id')::bigint)<>'UNKNOWN' then raise exception 'Omitted status update changed availability';end if;
 dashboard:=public.staff_dashboard_data();
 if (dashboard#>>'{occupancy,unknown}')::int<>1 or (dashboard#>>'{occupancy,available}')::int<>0 then raise exception 'Dashboard inferred availability';end if;
 -- The existing staff plot reader only accepts bounded numeric area filters;
 -- all-areas mode safely exercises bigint lot identities without changing that API.
 plots:=public.staff_plot_management('LOCAL-UNKNOWN','all','unknown','all','plot','asc',1,20);
 if (plots->>'total')::int<>1 or plots#>>'{items,0,operationalState}'<>'unknown' then raise exception 'Staff plot reader inferred availability';end if;
 readiness:=public.staff_gis_readiness(9007199254740993,9007199254740994,1,20);
 if not exists(select 1 from jsonb_array_elements(readiness->'rows') r where r->>'lotId'=saved->>'id' and r->>'occupancy'='unknown') then raise exception 'GIS reader inferred availability';end if;
 if exists(select 1 from jsonb_array_elements(public.staff_interment_plot_options()) p where p->>'lotId'=saved->>'id') then raise exception 'UNKNOWN offered for burial';end if;
 if (select status from public.lot where lot_code='LOCAL-STAGING-FIXTURE-ONLY')<>'HOLD' then raise exception 'Existing HOLD changed';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
 begin
  perform public.staff_save_record('lot',null,null,jsonb_build_object('lot_code','LOCAL-UNAUTHORIZED-FIXTURE'),gen_random_uuid(),'save');
  raise exception 'Anonymous mutation unexpectedly permitted';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
select jsonb_build_object('dry_run','ISOLATED_SAFEGUARDS_PASSED','fixture_only',true,'existing_id_preserved','9007199254740997','retry_receipt_preserved',true,'unknown_default_and_explicit_status_supported',true,'unknown_not_available_in_staff_or_gis',true,'anonymous_write_rejected',true,'regular_capacity',public.grave_interment_limit('regular',null),'individual_interment_uniqueness_retained',true,'deceased_created',0,'operational_source_plots_imported',0);
rollback;
select jsonb_build_object('after_rollback_sites',(select count(*) from public.site),'after_rollback_lots',(select count(*) from public.lot),'after_rollback_deceased',(select count(*) from public.deceased),'after_rollback_interments',(select count(*) from public.burial_record));
