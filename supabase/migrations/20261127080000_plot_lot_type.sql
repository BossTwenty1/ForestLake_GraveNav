-- Commercial lot classification is separate from burial capacity (grave_type).
begin;
alter table public.lot add column if not exists lot_type text;
alter table public.lot add constraint lot_lot_type_check
  check (lot_type is null or lot_type in ('standard','premium','special_premium','mausoleum'));
commit;
