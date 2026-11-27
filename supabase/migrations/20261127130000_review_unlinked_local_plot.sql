-- Staff-reviewed links for locally staged, temporarily unavailable lawn plots.
begin;
create or replace function public.staff_proposed_plot_review(p_candidate text,p_plan_sha256 text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;
begin
 if not public.is_active_admin_or_manager() then raise exception 'Active staff access is required' using errcode='42501'; end if;
 if p_candidate !~ '^lawn:[1-9][0-9]*$' or length(p_candidate)>24 or p_plan_sha256 is distinct from '02a4dba490872f9be8cf56280ccf432d31796431c1f808f542fbff86ac28ca77'
 or to_regclass('phase2_review.plot_draft') is null or to_regclass('phase2_review.prior_plot_candidates') is null or to_regclass('gis_private.capstone_planning_lot') is null then return null; end if;
 execute $q$ select jsonb_build_object('lotId',l.lot_id,'lotCode',l.lot_code,'revision',l.revision,'proposedCode',d.proposed_code,'lotType',d.lot_type,'distanceM',c.export_distance_m)
 from phase2_review.plot_draft d join phase2_review.prior_plot_candidates c on c.cad_candidate=d.cad_candidate
 join public.lot l on l.lot_id=c.old_lot_id and l.deleted_at is null
 where d.cad_candidate=$1 and d.review_availability='temporarily_unavailable' and l.status='HOLD'
 and d.proposed_code ~ '^(BPG|MPG)-[A-Z]-[0-9]+-[0-9]+$' and d.lot_type in ('Standard','Premium','Special premium')
 and c.export_distance_m>=0 and c.export_distance_m<0.2 and l.location_geom is not null
 and (select count(*) from phase2_review.prior_plot_candidates x where x.old_lot_id=l.lot_id)=1
 and (select count(*) from phase2_review.plot_draft x where x.cad_candidate=d.cad_candidate)=1
 and not exists(select 1 from public.burial_record b where b.lot_id=l.lot_id)
 and not exists(select 1 from gis_private.capstone_planning_lot p where p.lot_id=l.lot_id or (p.cad_candidate_id=$1 and p.plan_sha256=$2))
 and not exists(select 1 from public.lot other where other.area_id=l.area_id and other.lot_code=d.proposed_code and other.lot_id<>l.lot_id)
 $q$ into result using p_candidate,p_plan_sha256;
 return result;
end $$;

create or replace function public.staff_confirm_proposed_plot(p_candidate text,p_plan_sha256 text,p_lot_id bigint,p_old_code text,p_revision integer,p_proposed_code text,p_reason text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare proposed jsonb; plot public.lot%rowtype; receipt jsonb; category text;
begin
 if not public.is_active_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_request_id is null or p_lot_id is null or p_revision is null or p_old_code is null or p_proposed_code is null or length(btrim(coalesce(p_reason,''))) not between 10 and 500 then raise exception 'Enter a review note of 10 to 500 characters' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('local-plot-review:' || coalesce(p_candidate,''),0));
 select * into plot from public.lot where lot_id=p_lot_id and deleted_at is null for update;
 proposed := public.staff_proposed_plot_review(p_candidate,p_plan_sha256);
 if proposed is null or (proposed->>'lotId')::bigint<>p_lot_id or proposed->>'lotCode'<>p_old_code or (proposed->>'revision')::integer<>p_revision or proposed->>'proposedCode'<>p_proposed_code then raise exception 'Plot match changed; reopen the plot' using errcode='40001'; end if;
 category := case proposed->>'lotType' when 'Standard' then 'standard' when 'Premium' then 'premium' when 'Special premium' then 'special_premium' end;
 receipt := public.staff_save_record('lot',p_lot_id::text,p_revision,jsonb_build_object('lot_code',p_proposed_code,'area_id',plot.area_id,'location_geom',to_jsonb(plot)->'location_geom'),p_request_id,'save');
 update public.lot set lot_type=category,hold_kind='unavailable' where lot_id=p_lot_id;
 execute 'insert into gis_private.capstone_planning_lot(lot_id,plan_sha256,cad_candidate_id,review_reference) values($1,$2,$3,$4)' using p_lot_id,p_plan_sha256,p_candidate,btrim(p_reason);
 execute 'update phase2_review.plot_draft set review_availability=null, review_status=coalesce(review_status,'''') || '' | Local staff match review: '' || $2 where cad_candidate=$1' using p_candidate,btrim(p_reason);
 return receipt;
end $$;
revoke all on function public.staff_proposed_plot_review(text,text) from public,anon,authenticated,service_role;
grant execute on function public.staff_proposed_plot_review(text,text) to authenticated;
revoke all on function public.staff_confirm_proposed_plot(text,text,bigint,text,integer,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.staff_confirm_proposed_plot(text,text,bigint,text,integer,text,text,uuid) to authenticated;
commit;
