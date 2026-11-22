-- Disposable local test records only; run after the RC migrations.
begin;
insert into public.site(site_id,site_name,address) values(70001,'Fictional search test','Test only');
insert into public.area(area_id,site_id,area_code,area_name,area_category) values
 (71001,70001,'TEST-A','Fictional garden A','garden'),(71002,70001,'TEST-B','Fictional garden B','garden');
insert into public.lot(lot_id,area_id,lot_code,status)
 select 72000+i,case when i%2=0 then 71002 else 71001 end,'TEST-LOT-'||lpad(i::text,4,'0'),'AVAILABLE' from generate_series(1,64) i;
insert into public.deceased(deceased_id,display_name,birth_date,death_date,public_display)
 select 73000+i,case i when 1 then 'Fictional Reference Person' when 2 then 'Maria Santos' when 3 then 'Maria Santoso'
 when 4 then 'cabxyzat' when 5 then 'cabxyat' when 6 then 'cabxyzzat' else 'Fictional Search Person '||i end,
 '1840-01-01'::date,case i%3 when 0 then '1880-01-01'::date when 1 then '1950-01-01'::date else '2020-01-01'::date end,i<>7 from generate_series(1,64) i;
insert into public.burial_record(burial_id,deceased_id,lot_id,interment_date,record_status,interment_status,remains_type,record_source,quality_notes)
 select 74000+i,73000+i,72000+i,'2026-01-01',case i when 8 then 'pending' when 9 then 'archived' else 'active' end,'PERMANENT','ASH',
 case when i=1 then 'GRAVENAV_PHASE2_PROJECT_SAMPLE_V1' end,
 case when i=1 then jsonb_build_object('data_classification','PROJECT_SAMPLE_FICTIONAL','existing_lot_id',(72000+i)::text,'source_row_key',repeat('a',64),'display_reference','TEST A / Block 001 / Lot 0009')::text end from generate_series(1,64) i;
update public.burial_record set deleted_at=now() where burial_id=74010;
update public.lot set deleted_at=now() where lot_id=72011;

-- The oracle is the previous search predicate and function-local 0.3 setting.
-- It is created only by this test's caller in pg_temp, never in an application migration.
do $checks$
declare q text; config text; combination record; page integer; expected jsonb; actual jsonb; checked integer:=0;
begin
 if (select bool_or(c like 'pg_trgm.%') from pg_proc p cross join lateral unnest(p.proconfig) c
     where p.oid='public.search_public_burials(text,text,text,text,integer,integer)'::regprocedure) then raise exception 'Search still sets an extension parameter';end if;
 if not has_function_privilege('anon','public.search_public_burials(text,text,text,text,integer,integer)','EXECUTE') then raise exception 'Anonymous search grant changed';end if;
 if extensions.similarity('cat','cabxyzat')<>0.3::real or extensions.similarity('cat','cabxyat')<=0.3::real or extensions.similarity('cat','cabxyzzat')>=0.3::real then raise exception 'Threshold fixtures are invalid';end if;
 foreach config in array array['0.01','0.99'] loop
  perform set_config('pg_trgm.similarity_threshold',config,true);
  foreach q in array array['','Santos, Maria','Maria Santso','cat','TEST A Block 001 Lot 0009','TEST-LOT-0001','Fictional Search','no matching zzz'] loop
   for combination in select * from (values
     ('all','any','name'),('Fictional garden A','any','name'),('Fictional garden B','any','newest'),
     ('all','1800-1899','name'),('all','1900-1999','newest'),('all','2000-present','name')) as filters(garden,year,sort) loop
    for page in 1..2 loop
     expected:=pg_temp.previous_search_public_burials(q,combination.garden,combination.year,combination.sort,page,2);
     actual:=public.search_public_burials(q,combination.garden,combination.year,combination.sort,page,2);
     if actual is distinct from expected then raise exception 'Search parity failed: %, %, page %, ambient %',q,combination,page,config;end if;
     if current_setting('pg_trgm.similarity_threshold')::real<>config::real then raise exception 'Search changed caller setting';end if;
     checked:=checked+1;
    end loop;
   end loop;
  end loop;
 end loop;
 actual:=public.search_public_burials('cat','all','any','name',1,50);
 if not (actual->'items' @> '[{"burial_id":74004},{"burial_id":74005}]'::jsonb) or actual->'items' @> '[{"burial_id":74006}]'::jsonb then raise exception 'Inclusive 0.3 cutoff changed';end if;
 actual:=public.search_public_burials('TEST-LOT-0001');
 if actual#>>'{items,0,lot_code}'<>'TEST-LOT-0001' or actual#>>'{items,0,synthetic_plot_reference}'<>'TEST A / Block 001 / Lot 0009' then raise exception 'Internal/reference identity changed';end if;
 actual:=public.search_public_burials('');
 if exists(select 1 from jsonb_array_elements(actual->'items') item where (item->>'burial_id')::bigint in (74007,74008,74009,74010,74011)) or (actual->>'total')::integer<>59 then raise exception 'Public eligibility changed';end if;
 if public.search_public_burials(null,null,null,null,null,null) is distinct from pg_temp.previous_search_public_burials(null,null,null,null,null,null) then raise exception 'Null defaults changed';end if;
 if public.search_public_burials('', 'all','any','name',0,100) is distinct from pg_temp.previous_search_public_burials('', 'all','any','name',0,100) then raise exception 'Bounds changed';end if;
 raise notice 'PASS: % old/new result comparisons, inclusive cutoff, ambient-setting independence, filters, ranking, pagination, privacy and reference identity',checked;
end $checks$;
set local role anon;
do $anon$
begin
 if (public.search_public_burials('TEST-LOT-0001')->>'total')::integer<>1 then raise exception 'Anonymous search failed';end if;
end $anon$;
reset role;
rollback;
