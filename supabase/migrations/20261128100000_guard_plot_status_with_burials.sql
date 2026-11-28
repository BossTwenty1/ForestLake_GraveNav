-- A plot with burial records cannot have its availability changed through an
-- alternate editor or direct write. Its owner and other details remain editable.
begin;
create or replace function public.guard_plot_status_with_burials()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
begin
  if (new.status, new.hold_kind) is distinct from (old.status, old.hold_kind)
      and exists (select 1 from public.burial_record b where b.lot_id=old.lot_id) then
    raise exception 'This plot has burial records; its status cannot be changed' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_plot_status_with_burials() from public, anon, authenticated, service_role;
drop trigger if exists lot_guard_status_with_burials on public.lot;
create trigger lot_guard_status_with_burials before update of status, hold_kind on public.lot
  for each row execute function public.guard_plot_status_with_burials();
commit;
