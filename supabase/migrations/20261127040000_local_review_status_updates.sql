-- Update fictional local review statuses only. This never changes real lots.
begin;
create or replace function public.staff_update_review_status(p_candidate text, p_plan_sha256 text, p_expected text, p_status text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare chosen record; member record; n integer := 0; mapped boolean; group_key text;
begin
  if not public.is_active_admin_or_manager() then
    raise exception 'Active staff access is required' using errcode='42501';
  end if;
  if p_candidate is null or p_candidate !~ '^(lawn|estates):[1-9][0-9]*$' or length(p_candidate)>24
    or p_plan_sha256 is distinct from '02a4dba490872f9be8cf56280ccf432d31796431c1f808f542fbff86ac28ca77'
    or p_expected is null or p_status is null
    or p_expected not in ('available','booked','hold','unavailable')
    or p_status not in ('available','booked','hold','unavailable')
    or to_regclass('phase2_review.plot_draft') is null then
    raise exception 'Invalid local review request' using errcode='22023';
  end if;
  execute 'select garden, sector, row_number from phase2_review.plot_draft where cad_candidate=$1'
    into chosen using p_candidate;
  if chosen.garden is null then raise exception 'Review plot not found' using errcode='22023'; end if;
  group_key := case when chosen.garden='Majestic Palm Court' then chosen.garden || ':' || chosen.sector || ':' || chosen.row_number else p_candidate end;
  perform pg_advisory_xact_lock(hashtextextended('local-review:' || group_key, 0));
  for member in execute $q$
    select cad_candidate, test_status, review_availability from phase2_review.plot_draft
    where cad_candidate=$1 or ($2='Majestic Palm Court' and garden=$2 and sector=$3 and row_number=$4)
    order by cad_candidate for update
  $q$ using p_candidate, chosen.garden, chosen.sector, chosen.row_number loop
    n := n + 1;
    if member.cad_candidate is null or member.test_status is distinct from p_expected or member.review_availability is not null then
      raise exception 'Example status changed or plot needs review' using errcode='40001';
    end if;
    if to_regclass('gis_private.capstone_planning_lot') is not null then
      execute 'select exists(select 1 from gis_private.capstone_planning_lot where cad_candidate_id=$1 and plan_sha256=$2)'
        into mapped using member.cad_candidate, p_plan_sha256;
      if mapped then raise exception 'Real linked records cannot be changed here' using errcode='42501'; end if;
    end if;
  end loop;
  if n <> (case when chosen.garden='Majestic Palm Court' then 12 else 1 end) then
    raise exception 'Incomplete review group' using errcode='22023';
  end if;
  execute $q$ update phase2_review.plot_draft set test_status=$5
    where cad_candidate=$1 or ($2='Majestic Palm Court' and garden=$2 and sector=$3 and row_number=$4)
  $q$ using p_candidate, chosen.garden, chosen.sector, chosen.row_number, p_status;
  return jsonb_build_object('exampleStatus',p_status);
end;
$$;
revoke all on function public.staff_update_review_status(text,text,text,text) from public, anon, authenticated;
grant execute on function public.staff_update_review_status(text,text,text,text) to authenticated;
commit;
