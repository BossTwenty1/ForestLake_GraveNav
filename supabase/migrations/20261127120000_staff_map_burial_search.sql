-- Bounded staff search; public visibility does not control staff results.
begin;
create or replace function public.staff_map_burial_search(p_query text,p_plan_sha256 text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare q text := btrim(coalesce(p_query,'')); result jsonb; plots jsonb; drafts jsonb := '{"items":[],"more":false}'::jsonb;
begin
 if not public.is_active_admin_or_manager() then raise exception 'Active staff access is required' using errcode='42501'; end if;
 if length(q)<2 or length(q)>100 or p_plan_sha256 is null or p_plan_sha256 !~ '^[a-f0-9]{64}$' then
   raise exception 'Enter at least two characters' using errcode='22023';
 end if;
 if to_regclass('gis_private.capstone_planning_lot') is not null then
   execute $query$
    with matches as (
      select b.burial_id,d.display_name,l.lot_code,p.cad_candidate_id
      from public.burial_record b join public.deceased d using(deceased_id) join public.lot l using(lot_id)
      left join gis_private.capstone_planning_lot p on p.lot_id=l.lot_id and p.plan_sha256=$2
      where b.deleted_at is null and l.deleted_at is null and (strpos(lower(d.display_name),lower($1))>0 or (l.lot_code !~ '^P2S-[0-9a-f]{64}$' and strpos(lower(l.lot_code),lower($1))>0))
      order by lower(d.display_name),b.burial_id limit 21
    ), page as (select * from matches limit 20)
    select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',burial_id::text,'name',display_name,
      'plotCode',case when lot_code ~ '^P2S-[0-9a-f]{64}$' then null else lot_code end,
      'candidate',cad_candidate_id) order by lower(display_name),burial_id) from page),'[]'::jsonb),
      'more',(select count(*)>20 from matches))
   $query$ into result using q,p_plan_sha256;
 else
   with matches as (select b.burial_id,d.display_name,l.lot_code from public.burial_record b
     join public.deceased d using(deceased_id) join public.lot l using(lot_id)
     where b.deleted_at is null and l.deleted_at is null and (strpos(lower(d.display_name),lower(q))>0 or (l.lot_code !~ '^P2S-[0-9a-f]{64}$' and strpos(lower(l.lot_code),lower(q))>0))
     order by lower(d.display_name),b.burial_id limit 21), page as (select * from matches limit 20)
   select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',x.burial_id::text,'name',x.display_name,
     'plotCode',case when x.lot_code ~ '^P2S-[0-9a-f]{64}$' then null else x.lot_code end,'candidate',null)
     order by lower(x.display_name),x.burial_id) from page x),'[]'::jsonb),'more',(select count(*)>20 from matches)) into result;
 end if;
 if to_regclass('gis_private.capstone_planning_lot') is not null then
   execute $query$
    with matches as (select l.lot_id,l.lot_code,p.cad_candidate_id from public.lot l
      left join gis_private.capstone_planning_lot p on p.lot_id=l.lot_id and p.plan_sha256=$2
      where l.deleted_at is null and l.lot_code !~ '^P2S-[0-9a-f]{64}$' and strpos(lower(l.lot_code),lower($1))>0
      order by lower(l.lot_code),l.lot_id limit 21), page as (select * from matches limit 20)
    select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',lot_id::text,'code',lot_code,'candidate',cad_candidate_id) order by lower(lot_code),lot_id) from page),'[]'::jsonb),
      'more',(select count(*)>20 from matches))
   $query$ into plots using q,p_plan_sha256;
 else
   with matches as (select l.lot_id,l.lot_code from public.lot l where l.deleted_at is null
      and l.lot_code !~ '^P2S-[0-9a-f]{64}$' and strpos(lower(l.lot_code),lower(q))>0
      order by lower(l.lot_code),l.lot_id limit 21), page as (select * from matches limit 20)
   select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',lot_id::text,'code',lot_code,'candidate',null) order by lower(lot_code),lot_id) from page),'[]'::jsonb),
     'more',(select count(*)>20 from matches)) into plots;
 end if;
 if p_plan_sha256 = '02a4dba490872f9be8cf56280ccf432d31796431c1f808f542fbff86ac28ca77'
    and to_regclass('phase2_review.plot_draft') is not null then
   execute $query$
    with matches as (
      select distinct d.proposed_code,d.cad_candidate
      from phase2_review.plot_draft d
      where d.proposed_code is not null and length(d.proposed_code) between 1 and 100
        and d.cad_candidate ~ '^(lawn|estates):[1-9][0-9]*$'
        and strpos(lower(d.proposed_code),lower($1))>0
      order by d.proposed_code,d.cad_candidate limit 21
    ), page as (select * from matches limit 20)
    select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
      'code',proposed_code,'candidate',cad_candidate) order by proposed_code,cad_candidate) from page),'[]'::jsonb),
      'more',(select count(*)>20 from matches))
   $query$ into drafts using q;
 end if;
 return result || jsonb_build_object('plots',plots,'draftPlots',drafts);
end;
$$;
revoke all on function public.staff_map_burial_search(text,text) from public,anon,authenticated,service_role;
grant execute on function public.staff_map_burial_search(text,text) to authenticated;
commit;
