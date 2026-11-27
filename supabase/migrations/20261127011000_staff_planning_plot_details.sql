-- Staff-only details for the existing CAD-to-lot mapping. This does not create
-- assignments or change any plot, coordinate, burial, or availability.
begin;

create or replace function public.staff_planning_plot_details(p_candidate text, p_plan_sha256 text)
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, pg_temp
as $$
declare result jsonb; draft jsonb;
begin
  if not public.is_active_admin_or_manager() then
    raise exception 'An active staff account is required' using errcode = '42501';
  end if;
  if p_candidate !~ '^(lawn|estates):[1-9][0-9]*$' or length(p_candidate) > 24
      or p_plan_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid planning reference' using errcode = '22023';
  end if;
  if to_regclass('gis_private.capstone_planning_lot') is not null then
    execute $query$
    select jsonb_build_object(
      'lotId', l.lot_id,
      'lotCode', case when l.lot_code ~ '^P2S-[0-9a-f]{64}$' then null else l.lot_code end,
      'status', l.status,
      'holdKind', l.hold_kind,
      'revision', l.revision,
      'coordinateStatus', l.coordinate_status,
      'burialCount', (select count(*) from public.burial_record b where b.lot_id=l.lot_id),
      'burials', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', b.burial_id, 'name', d.display_name, 'birthDate', d.birth_date,
          'deathDate', d.death_date, 'portraitId', (
            select photo.photo_id from public.photo photo
            where photo.burial_id=b.burial_id and photo.photo_kind='portrait'
              and photo.approval_status in ('approved','pending')
            order by (photo.approval_status='approved') desc, photo.photo_id desc limit 1
          )
        ) order by b.burial_id)
        from public.burial_record b join public.deceased d on d.deceased_id=b.deceased_id
        where b.lot_id=l.lot_id and b.deleted_at is null
      ), '[]'::jsonb),
      'graveType', l.grave_type,
      'lotType', to_jsonb(l)->>'lot_type',
      'ownerName', (select concat_ws(' ', owner.first_name, owner.middle_name, owner.last_name, owner.suffix)
        from public.lot_owner owner where owner.lot_owner_id=l.lot_owner_id and owner.deleted_at is null),
      'latitude', case when l.location_geom is null then null else extensions.st_y(l.location_geom::extensions.geometry) end,
      'longitude', case when l.location_geom is null then null else extensions.st_x(l.location_geom::extensions.geometry) end
    )
    from gis_private.capstone_planning_lot p
    join public.lot l on l.lot_id=p.lot_id and l.deleted_at is null
    where p.cad_candidate_id=$1 and p.plan_sha256=$2
    $query$ into result using p_candidate, p_plan_sha256;
  end if;
  -- Optional local-only review data. It is never a confirmed assignment.
  if p_plan_sha256 = '02a4dba490872f9be8cf56280ccf432d31796431c1f808f542fbff86ac28ca77'
      and to_regclass('phase2_review.plot_draft') is not null then
    execute $draft$
      select jsonb_build_object(
        'draftCode', case when d.garden='Majestic Palm Court' and d.sector='C' and d.row_number ~ '^[1-9][0-9]*$'
          then 'MPC-C-' || d.row_number || '-12' else nullif(d.proposed_code, '') end,
        'draftType', case when d.garden='Majestic Palm Court' then 'Mausoleum (12 spaces)' else d.lot_type end,
        'draftMausoleum', d.garden='Majestic Palm Court', 'draftReview', d.review_status)
      from phase2_review.plot_draft d where d.cad_candidate=$1
    $draft$ into draft using p_candidate;
  end if;
  if draft is not null then
    result := coalesce(result, jsonb_build_object('lotId', null, 'lotCode', null,
      'status', null, 'burialCount', null, 'graveType', null,
      'latitude', null, 'longitude', null)) || draft;
    if result->>'lotId' is null and exists (select 1 from pg_attribute
      where attrelid=to_regclass('phase2_review.plot_draft') and attname='test_status' and not attisdropped) then
      execute $example$
        select jsonb_build_object('exampleStatus', d.test_status)
        from phase2_review.plot_draft d
        where d.cad_candidate=$1 and d.test_status in ('available','booked','hold','unavailable')
          and d.review_availability is null
      $example$ into draft using p_candidate;
      if draft is not null then result := result || draft; end if;
    end if;
    if result->>'draftMausoleum'='true' and to_regclass('phase2_review.prior_plot_candidates') is not null then
      -- The code describes the whole mausoleum; use the mean of its existing
      -- 12 space coordinates only if all 12 are present. Never update them.
      execute $mausoleum_coords$
        select jsonb_build_object(
          'latitude', case when count(l.location_geom)=12 then avg(extensions.st_y(l.location_geom::extensions.geometry)) else null end,
          'longitude', case when count(l.location_geom)=12 then avg(extensions.st_x(l.location_geom::extensions.geometry)) else null end,
          'coordinateFromDraft', true)
        from phase2_review.plot_draft selected
        join phase2_review.plot_draft member on member.garden=selected.garden and member.sector=selected.sector
          and member.row_number=selected.row_number
        left join phase2_review.prior_plot_candidates candidate on candidate.cad_candidate=member.cad_candidate
        left join public.lot l on l.lot_id=candidate.old_lot_id and l.deleted_at is null
        where selected.cad_candidate=$1 and selected.garden='Majestic Palm Court'
      $mausoleum_coords$ into draft using p_candidate;
      if draft is not null then result := result || draft; end if;
    elsif result->>'lotId' is null and to_regclass('phase2_review.prior_plot_candidates') is not null then
      execute $coords$
        select jsonb_build_object('latitude', extensions.st_y(l.location_geom::extensions.geometry),
          'longitude', extensions.st_x(l.location_geom::extensions.geometry), 'coordinateFromDraft', true)
        from phase2_review.prior_plot_candidates c
        join public.lot l on l.lot_id=c.old_lot_id and l.deleted_at is null
        where c.cad_candidate=$1 and l.location_geom is not null
      $coords$ into draft using p_candidate;
      if draft is not null then result := result || draft; end if;
    end if;
  end if;
  -- A single internal estate space is not yet an authoritative mausoleum
  -- record. Do not show its ownership, status or burials as block-wide facts.
  if p_candidate like 'estates:%' and result is not null then
    result := result || jsonb_build_object('lotId', null, 'status', null,
      'burialCount', null, 'burials', '[]'::jsonb);
  end if;
  return result;
end;
$$;

revoke all on function public.staff_planning_plot_details(text, text) from public, anon, authenticated;
grant execute on function public.staff_planning_plot_details(text, text) to authenticated;

-- Only existing staff-reviewed links can provide operational status. Draft
-- alignments do not establish availability, and synthetic records cannot
-- establish a sale or reservation status.
create or replace function public.staff_planning_plot_statuses(p_plan_sha256 text)
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, pg_temp
as $$
declare result jsonb; lot_types jsonb := '{}'::jsonb; review_candidates text[] := '{}'; example_candidates text[] := '{}';
  examples_used boolean := false; category text; retained jsonb;
begin
  if not public.is_active_admin_or_manager() then
    raise exception 'An active staff account is required' using errcode = '42501';
  end if;
  if p_plan_sha256 is null or p_plan_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid planning reference' using errcode = '22023';
  end if;
  if to_regclass('gis_private.capstone_planning_lot') is null then
    result := jsonb_build_object('occupied', '[]'::jsonb, 'available', '[]'::jsonb,
      'booked', '[]'::jsonb, 'hold', '[]'::jsonb, 'unavailable', '[]'::jsonb);
  else
  execute $query$
    with mapped as (
      select p.cad_candidate_id,
        case
          when exists (select 1 from public.burial_record b where b.lot_id=l.lot_id
            and b.deleted_at is null and (b.record_status='active' or
              (b.record_status='pending' and l.lot_code !~ '^P2S-[0-9a-f]{64}$'))) then 'occupied'
          when exists (select 1 from public.burial_record b where b.lot_id=l.lot_id)
            or l.lot_code ~ '^P2S-[0-9a-f]{64}$' then 'unknown'
          when l.status='AVAILABLE' then 'available'
          when l.status='BOOKED' then 'booked'
          when l.status='HOLD' and l.hold_kind='on_hold' then 'hold'
          when l.status='HOLD' and l.hold_kind='unavailable' then 'unavailable'
          else 'unknown'
        end as state
      from gis_private.capstone_planning_lot p
      join public.lot l on l.lot_id=p.lot_id and l.deleted_at is null
      where p.plan_sha256=$1
    )
    select jsonb_build_object(
      'occupied', coalesce(jsonb_agg(cad_candidate_id order by cad_candidate_id) filter (where state='occupied'), '[]'::jsonb),
      'available', coalesce(jsonb_agg(cad_candidate_id order by cad_candidate_id) filter (where state='available'), '[]'::jsonb),
      'booked', coalesce(jsonb_agg(cad_candidate_id order by cad_candidate_id) filter (where state='booked'), '[]'::jsonb),
      'hold', coalesce(jsonb_agg(cad_candidate_id order by cad_candidate_id) filter (where state='hold'), '[]'::jsonb),
      'unavailable', coalesce(jsonb_agg(cad_candidate_id order by cad_candidate_id) filter (where state='unavailable'), '[]'::jsonb)
    ) from mapped
  $query$ into result using p_plan_sha256;
  execute $example_notice$
    select exists (select 1 from gis_private.capstone_planning_lot p
      join public.lot l on l.lot_id=p.lot_id
      where p.plan_sha256=$1 and l.deleted_at is null
        and l.grave_policy_reference='Local PDF and CAD match; example status')
  $example_notice$ into examples_used using p_plan_sha256;
  end if;
  if p_plan_sha256 = '02a4dba490872f9be8cf56280ccf432d31796431c1f808f542fbff86ac28ca77'
      and to_regclass('phase2_review.plot_draft') is not null then
    execute $types$
      select jsonb_build_object(
        'standard', coalesce(jsonb_agg(cad_candidate) filter (where lot_type='Standard' and cad_candidate is not null), '[]'::jsonb),
        'premium', coalesce(jsonb_agg(cad_candidate) filter (where lot_type='Premium' and cad_candidate is not null), '[]'::jsonb),
        'special_premium', coalesce(jsonb_agg(cad_candidate) filter (where lot_type='Special premium' and cad_candidate is not null), '[]'::jsonb),
        'mausoleum', coalesce(jsonb_agg(cad_candidate) filter (where lot_type='Mausoleum space' and cad_candidate is not null), '[]'::jsonb)
      ) from phase2_review.plot_draft
    $types$ into lot_types;
  end if;
  -- Local review holds do not modify actual plot records. They may not
  -- override an existing active burial on the same shape.
  if p_plan_sha256 = '02a4dba490872f9be8cf56280ccf432d31796431c1f808f542fbff86ac28ca77'
      and to_regclass('phase2_review.map_exceptions') is not null
      and exists (select 1 from pg_attribute where attrelid=to_regclass('phase2_review.map_exceptions')
        and attname='review_availability' and not attisdropped) then
    execute $holds$
      select coalesce(array_agg(distinct e.cad_candidate), '{}')
      from phase2_review.map_exceptions e
      where e.review_availability='temporarily_unavailable'
        and e.cad_candidate is not null and e.cad_candidate <> ''
        and not (($1->'occupied') ? e.cad_candidate)
    $holds$ into review_candidates using result;
    foreach category in array array['available', 'booked', 'hold'] loop
      select coalesce(jsonb_agg(item), '[]'::jsonb) into retained
        from jsonb_array_elements_text(result->category) as item
        where not (item=any(review_candidates));
      result := jsonb_set(result, array[category], retained);
    end loop;
    select coalesce(jsonb_agg(distinct item), '[]'::jsonb) into retained
      from (select jsonb_array_elements_text(result->'unavailable') as item
        union all select unnest(review_candidates)) combined;
    result := jsonb_set(result, '{unavailable}', retained);
  end if;
  -- These local review values are explicitly fictional examples. Real linked
  -- statuses, active burials and temporary review holds always take priority.
  if p_plan_sha256 = '02a4dba490872f9be8cf56280ccf432d31796431c1f808f542fbff86ac28ca77'
      and to_regclass('phase2_review.plot_draft') is not null
      and exists (select 1 from pg_attribute where attrelid=to_regclass('phase2_review.plot_draft')
        and attname='test_status' and not attisdropped) then
    foreach category in array array['available', 'booked', 'hold', 'unavailable'] loop
      execute $examples$
        select coalesce(array_agg(distinct d.cad_candidate), '{}')
        from phase2_review.plot_draft d where d.test_status=$1 and d.cad_candidate is not null
          and not (($2->'occupied') ? d.cad_candidate)
          and not (($2->'unavailable') ? d.cad_candidate)
          and not (($2->'available') ? d.cad_candidate)
          and not (($2->'booked') ? d.cad_candidate)
          and not (($2->'hold') ? d.cad_candidate)
      $examples$ into example_candidates using category, result;
      if cardinality(example_candidates)>0 then examples_used := true; end if;
      select coalesce(jsonb_agg(distinct item), '[]'::jsonb) into retained
        from (select jsonb_array_elements_text(result->category) as item
          union all select unnest(example_candidates)) combined;
      result := jsonb_set(result, array[category], retained);
    end loop;
  end if;
  return result || jsonb_build_object('types',lot_types, 'exampleMode',examples_used);
end;
$$;
revoke all on function public.staff_planning_plot_statuses(text) from public, anon, authenticated;
grant execute on function public.staff_planning_plot_statuses(text) to authenticated;
commit;
