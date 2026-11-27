-- Public highlights use the same visibility rules as public map memorials.
begin;
create or replace function public.map_plot_highlights(
 p_plan_sha256 text,p_release_id uuid default null,p_staff boolean default false
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare memorials text[] := '{}'; occupied text[] := '{}';
begin
 if p_staff and not public.is_active_admin_or_manager() then
   raise exception 'An active staff account is required' using errcode='42501';
 end if;
 if p_release_id is not null then
   with mapped as (select r.lot_id,r.lot_code,r.occupancy from gis_private.lot_gis_readiness r where r.release_id=p_release_id and r.geometry_ready),
   visible_lots as (select distinct br.lot_id from public.public_burial_records visible
     join public.burial_record br using(burial_id) join mapped using(lot_id)
     where visible.record_status='active' or br.record_source='GRAVENAV_MAP_PUBLIC_V1')
   select coalesce(array_agg(mapped.lot_id::text order by mapped.lot_id) filter(where visible_lots.lot_id is not null),'{}'),
     coalesce(array_agg(mapped.lot_id::text order by mapped.lot_id) filter(where p_staff and mapped.occupancy='occupied' and mapped.lot_code !~ '^P2S-[0-9a-f]{64}$'),'{}')
   into memorials,occupied from mapped left join visible_lots using(lot_id);
 elsif to_regclass('gis_private.capstone_planning_lot') is not null
   and to_regclass('gis_private.capstone_visitor_selection') is not null then
   execute $planning$
     with mapped as (select p.cad_candidate_id,p.lot_id,l.lot_code from gis_private.capstone_planning_lot p
       join public.lot l using(lot_id) where p.plan_sha256=$1 and l.deleted_at is null),
     visible_lots as (select distinct br.lot_id from public.burial_record br
       join public.public_burial_records visible on visible.burial_id=br.burial_id
       join mapped on mapped.lot_id=br.lot_id
       where br.record_status='active' or br.record_source='GRAVENAV_MAP_PUBLIC_V1' or exists
         (select 1 from gis_private.capstone_visitor_selection a where a.burial_id=br.burial_id and a.deceased_id=br.deceased_id and a.lot_id=br.lot_id))
     select coalesce(array_agg(mapped.cad_candidate_id order by mapped.cad_candidate_id) filter(where visible_lots.lot_id is not null),'{}'),
       coalesce(array_agg(mapped.cad_candidate_id order by mapped.cad_candidate_id) filter(where $2 and mapped.lot_code !~ '^P2S-[0-9a-f]{64}$'
         and exists(select 1 from public.burial_record br where br.lot_id=mapped.lot_id)),'{}')
     from mapped left join visible_lots using(lot_id)
   $planning$ into memorials,occupied using p_plan_sha256,p_staff;
 end if;
 return jsonb_build_object('memorials',memorials,'occupied',occupied);
end;
$$;
revoke all on function public.map_plot_highlights(text,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.map_plot_highlights(text,uuid,boolean) to anon,authenticated;
commit;
