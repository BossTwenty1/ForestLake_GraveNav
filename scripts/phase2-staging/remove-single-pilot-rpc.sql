-- REVIEW ONLY: run separately after verified commit; preserves records, receipts and audit history.
begin;
revoke all on function public.execute_phase2_single_pilot_3721() from public,anon,authenticated,service_role;
drop function public.execute_phase2_single_pilot_3721();
notify pgrst, 'reload schema';
commit;
