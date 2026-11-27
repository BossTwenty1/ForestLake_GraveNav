-- Add a distinct Court area and sector without moving existing plots.
begin;

do $$
declare
  target_site bigint;
  court_area bigint;
begin
  select min(site_id) into target_site from public.area where area_code = 'MPG';
  if (select count(*) from public.area where area_code = 'MPG') > 1 then
    raise exception 'Multiple Majestic Palm Garden areas need review';
  end if;
  -- A new empty database has no site data yet. Its seed process must create
  -- the Court after it creates Majestic Palm Garden.
  if target_site is null then return; end if;

  if exists (select 1 from public.area where site_id=target_site and
    (area_code='MPC' or lower(area_name)='majestic palm court') and
    (area_code <> 'MPC' or area_name <> 'Majestic Palm Court' or area_category <> 'court')) then
    raise exception 'An existing Majestic Palm Court area needs review';
  end if;

  insert into public.area (site_id, area_code, area_name, area_category)
  values (target_site, 'MPC', 'Majestic Palm Court', 'court')
  on conflict (site_id, area_code) do nothing;

  select area_id into court_area from public.area
    where site_id=target_site and area_code='MPC';

  if exists (select 1 from public.sector where area_id=court_area and sector_code='C'
    and sector_name is distinct from 'Majestic Palm Court C') then
    raise exception 'An existing Court C sector needs review';
  end if;
  insert into public.sector (area_id, sector_code, sector_name)
  values (court_area, 'C', 'Majestic Palm Court C')
  on conflict (area_id, sector_code) do nothing;
end $$;

commit;
