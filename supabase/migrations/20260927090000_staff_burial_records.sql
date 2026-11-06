begin;

-- Bounded staff read model for the canonical Burial Records workspace. Search,
-- filters, sorting, and pagination stay in PostgreSQL so the browser never has
-- to download the full protected registry to provide professional table UX.
create function public.staff_burial_records(
  p_query text default '',
  p_section text default 'all',
  p_status text default 'all',
  p_verification text default 'all',
  p_date_filter text default 'all',
  p_sort text default 'updated',
  p_direction text default 'desc',
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  q text := public.search_normalize(left(coalesce(p_query, ''), 160));
  section_filter text := left(coalesce(nullif(trim(p_section), ''), 'all'), 160);
  status_filter text := lower(coalesce(nullif(trim(p_status), ''), 'all'));
  verification_filter text := lower(coalesce(nullif(trim(p_verification), ''), 'all'));
  date_filter text := lower(coalesce(nullif(trim(p_date_filter), ''), 'all'));
  sort_key text := lower(coalesce(nullif(trim(p_sort), ''), 'updated'));
  sort_direction text := lower(coalesce(nullif(trim(p_direction), ''), 'desc'));
  page_number integer := greatest(1, least(coalesce(p_page, 1), 100000));
  page_size integer := greatest(10, least(coalesce(p_page_size, 20), 50));
  result jsonb;
begin
  if not public.is_active_admin_or_manager() then
    raise exception 'An active staff account is required' using errcode = '42501';
  end if;

  if status_filter not in ('all', 'active', 'pending', 'archived') then
    raise exception 'Invalid burial record status filter';
  end if;
  if verification_filter not in ('all', 'verified', 'pending', 'rejected') then
    raise exception 'Invalid coordinate verification filter';
  end if;
  if date_filter not in ('all', 'this-year', 'last-five-years', 'undated') then
    raise exception 'Invalid burial date filter';
  end if;
  if sort_key not in ('updated', 'name', 'plot', 'interment-date', 'status') then
    raise exception 'Invalid burial record sort';
  end if;
  if sort_direction not in ('asc', 'desc') then
    raise exception 'Invalid burial record sort direction';
  end if;

  with record_source as materialized (
    select
      br.revision,
      br.burial_id,
      br.deceased_id,
      br.lot_id,
      d.display_name,
      d.birth_date,
      d.death_date,
      d.public_display,
      br.interment_date,
      br.record_status,
      br.interment_status,
      br.remains_type,
      br.reference_no,
      br.service_provider,
      br.record_source,
      br.quality_notes,
      br.updated_at,
      l.lot_code,
      a.area_name,
      l.location_geom,
      l.px_loc_x,
      l.px_loc_y,
      l.coordinate_status,
      l.coordinate_verified
    from public.burial_record as br
    join public.deceased as d on d.deceased_id = br.deceased_id
    join public.lot as l on l.lot_id = br.lot_id
    left join public.area as a on a.area_id = l.area_id
    where br.deleted_at is null
      and l.deleted_at is null
  ),
  filtered as materialized (
    select source.*
    from record_source as source
    where (
        q = ''
        or not exists (
          select 1
          from regexp_split_to_table(q, ' +') as token
          where position(
            token in public.search_normalize(concat_ws(
              ' ',
              source.display_name,
              source.reference_no,
              source.burial_id::text,
              source.lot_code,
              source.area_name
            ))
          ) = 0
        )
      )
      and (section_filter = 'all' or source.area_name = section_filter)
      and (status_filter = 'all' or source.record_status = status_filter)
      and (
        verification_filter = 'all'
        or (
          verification_filter = 'verified'
          and source.coordinate_verified
          and source.coordinate_status = 'verified'
        )
        or (verification_filter = 'rejected' and source.coordinate_status = 'rejected')
        or (
          verification_filter = 'pending'
          and not (
            source.coordinate_verified
            and source.coordinate_status = 'verified'
          )
          and source.coordinate_status <> 'rejected'
        )
      )
      and (
        date_filter = 'all'
        or (date_filter = 'undated' and source.interment_date is null)
        or (
          date_filter = 'this-year'
          and extract(year from source.interment_date) = extract(year from current_date)
        )
        or (
          date_filter = 'last-five-years'
          and source.interment_date >= make_date(extract(year from current_date)::integer - 4, 1, 1)
        )
      )
  ),
  page_rows as (
    select filtered.*
    from filtered
    order by
      case when sort_key = 'name' and sort_direction = 'asc' then display_name end asc,
      case when sort_key = 'name' and sort_direction = 'desc' then display_name end desc,
      case when sort_key = 'plot' and sort_direction = 'asc' then lot_code end asc,
      case when sort_key = 'plot' and sort_direction = 'desc' then lot_code end desc,
      case when sort_key = 'interment-date' and sort_direction = 'asc' then interment_date end asc nulls last,
      case when sort_key = 'interment-date' and sort_direction = 'desc' then interment_date end desc nulls last,
      case when sort_key = 'status' and sort_direction = 'asc' then record_status end asc,
      case when sort_key = 'status' and sort_direction = 'desc' then record_status end desc,
      case when sort_key = 'updated' and sort_direction = 'asc' then updated_at end asc,
      case when sort_key = 'updated' and sort_direction = 'desc' then updated_at end desc,
      burial_id desc
    limit page_size
    offset (page_number - 1) * page_size
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'revision', page.revision,
        'burialId', page.burial_id,
        'name', page.display_name,
        'deceasedId', page.deceased_id,
        'lotId', page.lot_id,
        'plot', page.lot_code,
        'section', coalesce(page.area_name, 'Unassigned'),
        'recordStatus', page.record_status,
        'birthDate', page.birth_date,
        'deathDate', page.death_date,
        'publicDisplay', page.public_display,
        'intermentDate', page.interment_date,
        'intermentStatus', page.interment_status,
        'remainsType', page.remains_type,
        'referenceNo', page.reference_no,
        'serviceProvider', page.service_provider,
        'recordSource', page.record_source,
        'qualityNotes', page.quality_notes,
        'updatedAt', page.updated_at,
        'location', case
          when page.location_geom is null then null
          else jsonb_build_object(
            'longitude', extensions.st_x(page.location_geom::extensions.geometry),
            'latitude', extensions.st_y(page.location_geom::extensions.geometry)
          )
        end,
        'pixelLocation', case
          when page.px_loc_x is null or page.px_loc_y is null then null
          else jsonb_build_object('x', page.px_loc_x, 'y', page.px_loc_y)
        end,
        'coordinateStatus', page.coordinate_status,
        'coordinateVerified', page.coordinate_verified
      ) order by
        case when sort_key = 'name' and sort_direction = 'asc' then page.display_name end asc,
        case when sort_key = 'name' and sort_direction = 'desc' then page.display_name end desc,
        case when sort_key = 'plot' and sort_direction = 'asc' then page.lot_code end asc,
        case when sort_key = 'plot' and sort_direction = 'desc' then page.lot_code end desc,
        case when sort_key = 'interment-date' and sort_direction = 'asc' then page.interment_date end asc nulls last,
        case when sort_key = 'interment-date' and sort_direction = 'desc' then page.interment_date end desc nulls last,
        case when sort_key = 'status' and sort_direction = 'asc' then page.record_status end asc,
        case when sort_key = 'status' and sort_direction = 'desc' then page.record_status end desc,
        case when sort_key = 'updated' and sort_direction = 'asc' then page.updated_at end asc,
        case when sort_key = 'updated' and sort_direction = 'desc' then page.updated_at end desc,
        page.burial_id desc
      )
      from page_rows as page
    ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'totalAll', (select count(*) from record_source),
    'sections', coalesce((
      select jsonb_agg(section.area_name order by section.area_name)
      from (
        select distinct area_name
        from record_source
        where area_name is not null
      ) as section
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.staff_burial_records(text, text, text, text, text, text, text, integer, integer) from public;
grant execute on function public.staff_burial_records(text, text, text, text, text, text, text, integer, integer) to authenticated;

comment on function public.staff_burial_records(text, text, text, text, text, text, text, integer, integer) is
  'Authorized, bounded Burial Records read model with server-side search, filters, sorting, and pagination.';

commit;
