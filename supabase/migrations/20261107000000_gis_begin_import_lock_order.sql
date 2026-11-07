-- Keep begin-import and finalization from locking pilot area and release in opposite orders.
create or replace function public.staff_begin_mapping_import(
  p_release_id uuid,p_expected_revision integer,p_request_id uuid,
  p_package_digest text,p_manifest_bytes_base64 text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, extensions, pg_temp as $$
declare actor uuid := auth.uid(); manifest_bytes bytea; manifest jsonb; release_row public.mapping_release;
  prior jsonb; result jsonb; import_uuid uuid; entry jsonb; manifest_hash text;
  initial_site_id bigint; initial_area_id bigint;
begin
  perform gis_private.assert_admin();
  if p_release_id is null or p_expected_revision is null or p_expected_revision<1 or p_request_id is null or
     p_package_digest !~ '^[0-9a-f]{64}$' or
     octet_length(coalesce(p_manifest_bytes_base64,''))+octet_length(coalesce(p_package_digest,''))+512>131072 then
    raise exception 'Invalid bounded import begin envelope';
  end if;
  manifest_bytes := gis_private.decode_strict_base64(p_manifest_bytes_base64,65536);
  manifest_hash := encode(sha256(manifest_bytes),'hex');
  manifest := gis_private.strict_json(manifest_bytes);
  prior := gis_private.claim_request(p_request_id,'staff_begin_mapping_import',jsonb_build_object(
    'releaseId',p_release_id::text,'expectedRevision',p_expected_revision,'packageDigest',p_package_digest,
    'manifestSha256',manifest_hash,'manifestBytes',octet_length(manifest_bytes)));
  if prior is not null then return prior; end if;
  -- Match the area-first lock order used by validation and finalization.
  select site_id,pilot_area_id into initial_site_id,initial_area_id
    from public.mapping_release where release_id=p_release_id;
  if not found then raise exception 'Release not found'; end if;
  if initial_area_id is not null then
    perform 1 from public.area where area_id=initial_area_id and site_id=initial_site_id for no key update;
    if not found then raise exception 'Pilot area/site mismatch'; end if;
  end if;
  select * into release_row from public.mapping_release where release_id=p_release_id for update;
  if not found then raise exception 'Release not found'; end if;
  if (release_row.site_id,release_row.pilot_area_id) is distinct from (initial_site_id,initial_area_id) then
    raise exception 'Release scope changed' using errcode='40001';
  end if;
  if release_row.revision<>p_expected_revision then raise exception 'Stale release revision' using errcode='40001'; end if;
  if release_row.status not in ('draft','staged','validated') then raise exception 'Release cannot begin an import in its current state'; end if;
  perform gis_private.assert_pilot_scope(p_release_id);
  perform gis_private.assert_import_manifest(manifest,manifest_bytes,p_package_digest,
    release_row.site_id,release_row.pilot_area_id,release_row.release_code);

  insert into public.mapping_import(request_id,actor_account_id,release_id,site_id,area_id,
    base_revision,target_revision,package_digest,manifest_sha256)
  values(p_request_id,actor,p_release_id,release_row.site_id,release_row.pilot_area_id,
    p_expected_revision,p_expected_revision+1,p_package_digest,manifest_hash)
  returning import_id into import_uuid;

  insert into public.mapping_import_file(import_id,file_name,declared_sha256,declared_bytes,
    declared_feature_count,declared_chunk_count,layer_version)
  values(import_uuid,'manifest.json',manifest_hash,octet_length(manifest_bytes),1,1,null);
  for entry in select value from jsonb_array_elements(manifest->'files') loop
    insert into public.mapping_import_file(import_id,file_name,declared_sha256,declared_bytes,
      declared_feature_count,declared_chunk_count,layer_version)
    values(import_uuid,entry->>'name',entry->>'sha256',(entry->>'bytes')::integer,
      (entry->>'feature_count')::integer,
      case when (entry->>'bytes')::integer=0 then 0 else (((entry->>'bytes')::integer-1)/65536)+1 end,
      entry->>'layer_version');
  end loop;
  insert into public.mapping_import_chunk(import_id,file_name,chunk_index,chunk_bytes,byte_count,chunk_sha256,received_by)
  values(import_uuid,'manifest.json',0,manifest_bytes,octet_length(manifest_bytes),manifest_hash,actor);

  result := jsonb_build_object(
    'schemaVersion',1,'id',import_uuid::text,'importId',import_uuid::text,'releaseId',p_release_id::text,
    'revision',1,'state','receiving','requestId',p_request_id::text,'rootRequestId',p_request_id::text,
    'packageDigest',p_package_digest,'baseRevision',p_expected_revision,'targetRevision',p_expected_revision+1,
    'currentReleaseRevision',release_row.revision,'fileCount',15,'receivedChunkCount',1,
    'receivedBytes',octet_length(manifest_bytes),'missingChunkCount',(
      select sum(declared_chunk_count)::integer from public.mapping_import_file where import_id=import_uuid)-1);
  perform gis_private.audit_event('mapping_import',import_uuid::text,'insert',null,result);
  perform gis_private.finish_request(p_request_id,result);
  return result;
end $$;
