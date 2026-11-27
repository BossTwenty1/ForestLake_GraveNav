-- Preserve existing HOLD records as unclassified until staff review them.
-- New map actions can distinguish a customer hold from temporary unavailability
-- without breaking older readers that understand HOLD.
begin;
alter table public.lot add column if not exists hold_kind text;
alter table public.lot add constraint lot_hold_kind_check
  check (hold_kind is null or (status='HOLD' and hold_kind in ('on_hold', 'unavailable')));

create or replace function public.clear_plot_hold_kind()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if new.status <> 'HOLD' then new.hold_kind := null; end if;
  return new;
end $$;
create trigger lot_clear_hold_kind before insert or update of status, hold_kind on public.lot
for each row execute function public.clear_plot_hold_kind();
revoke all on function public.clear_plot_hold_kind() from public, anon, authenticated;
commit;
