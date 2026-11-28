-- A court without a recorded boundary may keep provisional CAD-derived
-- mausoleum coordinates. Verification still requires an actual boundary.
begin;
create or replace function public.validate_lot_coordinate_in_area()
returns trigger language plpgsql set search_path = public, extensions, pg_temp as $$
declare selected_area_boundary extensions.geography; selected_area_code text;
begin
  if new.location_geom is null then return new; end if;
  select a.boundary_geom, a.area_code into selected_area_boundary, selected_area_code
    from public.area a where a.area_id = new.area_id;
  if selected_area_boundary is null then
    if selected_area_code = 'MPC' and new.grave_type = 'mausoleum'
       and new.lot_code ~ '^MPC-C-[1-9][0-9]*-12$'
       and new.coordinate_status = 'pending' and not new.coordinate_verified then
      return new;
    end if;
    raise exception using errcode = 'check_violation',
      message = 'The selected garden has no boundary, so this plot coordinate cannot be validated.';
  end if;
  if not extensions.st_covers(selected_area_boundary, new.location_geom) then
    raise exception using errcode = 'check_violation',
      message = 'The plot coordinate is outside the selected garden boundary.';
  end if;
  return new;
end;
$$;
commit;
