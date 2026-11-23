import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildPreview,sha256} from './prepare.mjs';

export const SAMPLE_SOURCE='GRAVENAV_PHASE2_PROJECT_SAMPLE_V1';
export const REQUIRED_MIGRATIONS=['20261107000000','20261107010000','20261116010000'];
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const json=value=>q(JSON.stringify(value))+'::jsonb';
const ref=value=>typeof value==='string'&&value.trim().length>0;
const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value??'');
const requestId=value=>{const h=createHash('sha256').update(value).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
const unique=(rows,key)=>{const map=new Map(rows.map(r=>[r[key],r]));assert.equal(map.size,rows.length,`Duplicate ${key}`);return map;};

export function prepareSamples(dataset,source,snapshot,preflight,bindings,{snapshotDigest,preflightDigest,pilotId='DEMO-INT-0001'}={}){
 assert.equal(dataset.format,'gravenav-phase2-project-samples-v1');
 assert.match(dataset.workbook_sha256,/^[0-9a-f]{64}$/);
 assert.equal(dataset.plots.length,4470);assert.equal(dataset.people.length,100);assert.equal(dataset.interments.length,100);assert.equal(dataset.owners.length,45);
 const plots=unique(dataset.plots,'source_key'),people=unique(dataset.people,'sample_id');unique(dataset.interments,'sample_id');unique(dataset.owners,'sample_id');unique(dataset.owners,'source_key');
 const sourceRows=new Map(source.rows.map(r=>[r.source_row_key,r]));
 for(const p of plots.values()){
  const s=sourceRows.get(p.source_key);assert.ok(s,'Unknown plot Source Row Key');assert.equal(p.hosted_lot_id,null);assert.equal(p.availability,'UNKNOWN');
  for(const [a,b]of [['garden','garden'],['lawn','lawn'],['block','block_literal'],['lot','lot_literal'],['commercial_class','commercial_class'],['pdf_page','pdf_page'],['cad_candidate_id','cad_candidate_id']])assert.equal(p[a],s[b],`Changed plot source ${a}`);
 }
 for(const i of dataset.interments){const person=people.get(i.person_id);assert.ok(person&&plots.has(i.source_key),'Broken sample link');assert.ok(person.classification.startsWith('SYNTHETIC')&&i.classification==='SYNTHETIC');assert.ok(person.birth_date<=person.death_date&&person.death_date<=i.interment_date,'Invalid sample dates');}
 for(const o of dataset.owners)assert.ok(plots.has(o.source_key)&&o.classification.startsWith('SYNTHETIC'),'Invalid sample owner');
 assert.equal(preflight.project_ref,'ddoowghocqyfoxaikifb');assert.equal(preflight.transaction_read_only,'on');
 assert.equal(bindings.relationship_preflight_sha256,preflightDigest,'Review must pin the relationship snapshot');
 const preview=buildPreview(source,bindings,snapshot,{snapshotDigest});
 const interment=dataset.interments.find(r=>r.sample_id===pilotId);assert.ok(interment,'Unknown pilot');
 const plot=plots.get(interment.source_key),person=people.get(interment.person_id),owner=dataset.owners.find(o=>o.source_key===plot.source_key),s=sourceRows.get(plot.source_key);
 const row=preview.rows.find(r=>r.source_row_key===plot.source_key),policy=bindings.project_sample_policy??{},reasons=[];
 if(row.action!=='MATCH_EXISTING_REVIEW')reasons.push(row.action);
 if(!s.block_literal||!s.lot_literal||!s.cad_candidate_id||plot.review_flags.length||row.review_flags.length)reasons.push('SOURCE_PLOT_REQUIRES_REVIEW');
 const target=preflight.lots.find(l=>l.lot_id===row.existing_lot_id);
 const b=bindings.lot_bindings.find(r=>r.source_row_key===plot.source_key);
 const syntheticAssignment=b?.binding_kind==='NEW_SYNTHETIC_PROJECT_ASSIGNMENT';
 if(syntheticAssignment&&!ref(b.synthetic_assignment_approval_reference))reasons.push('NEW_SYNTHETIC_ASSIGNMENT_REQUIRES_APPROVAL');
 if(target){
  if(target.revision!==row.existing_lot_revision||target.lot_code!==row.approved_lot_code||target.area_id!==row.area_id||target.block_id!==row.block_id)reasons.push('TARGET_CHANGED');
  if(target.deleted!==false||target.owner_attached!==false||target.burial_associations!==0)reasons.push('EXISTING_ASSOCIATION_DO_NOT_REASSIGN');
  if(syntheticAssignment&&(target.gis_plot_references!==0||target.access_point_references!==0||target.legacy_location_reference_present!==false||target.legacy_pa_reference_present!==false))reasons.push('CONFLICTING_OR_UNCHECKED_SOURCE_PURPOSE');
  if(target.status==='HOLD'){if(!ref(b?.hold_release_review_reference))reasons.push('HOLD_RELEASE_REQUIRES_EXPLICIT_REVIEW');}
  else if(target.status!=='AVAILABLE')reasons.push('ADMISSION_NOT_AVAILABLE_NO_STATUS_BYPASS');
 }
 if(preflight.existing_sample_records!==0)reasons.push('EXISTING_SAMPLE_BATCH_REQUIRES_RECEIPT_REVIEW');
 if(!uuid(policy.actor_account_id))reasons.push('EXISTING_ADMIN_ACTOR_REQUIRED');
 if(!ref(policy.defaults_review_reference)||!['FRESH','ASH','BONE'].includes(policy.remains_type)||!['PERMANENT','TEMPORARY'].includes(policy.interment_status))reasons.push('SAMPLE_ONLY_REQUIRED_FIELDS_NEED_REVIEW');
 if(!owner||owner.name.trim().split(/\s+/).length!==2)reasons.push('PILOT_OWNER_NAME_REQUIRES_REVIEW');
 const missing=REQUIRED_MIGRATIONS.filter(v=>!preflight.migrations.includes(v));
 const identity={source_row_key:plot.source_key,display_reference:plot.display_reference,pdf_page:s.pdf_page,pdf_locator:s.pdf_locator,cad_candidate_id:s.cad_candidate_id,cad_instance_path:s.cad_instance_path,existing_lot_id:row.existing_lot_id,expected_revision:row.existing_lot_revision,area_id:row.area_id,block_id:row.block_id,...(syntheticAssignment?{binding_kind:'NEW_SYNTHETIC_PROJECT_ASSIGNMENT',historical_cad_identity_verified:false,forest_lake_physical_assignment_verified:false}:{})};
 const plan={format:'gravenav-phase2-project-sample-pilot-v1',project_ref:preflight.project_ref,sample_source:SAMPLE_SOURCE,workbook_sha256:dataset.workbook_sha256,target_snapshot_sha256:snapshotDigest,relationship_preflight_sha256:preflightDigest,total_prepared:{plots:4470,people:100,interments:100,owners:45,referenced_plots:new Set(dataset.interments.map(r=>r.source_key)).size},pilot:{interment_id:interment.sample_id,person_id:person.sample_id,owner_id:owner?.sample_id,...identity},missing_migrations:missing,review_reasons:[...new Set(reasons)],ready_for_exact_approval:reasons.length===0,execution_authorized:false,proposed_operations:null};
 if(reasons.length)return {plan,sql:null};
 const note=JSON.stringify({data_classification:'PROJECT_SAMPLE_FICTIONAL',person_id:person.sample_id,interment_id:interment.sample_id,...identity});
 const ownerName=owner.name.trim().split(/\s+/),ownerMarker=`${SAMPLE_SOURCE}:${owner.sample_id}:${plot.source_key}`;
 const ownerValues={first_name:ownerName[0],last_name:ownerName[1],aliases:ownerMarker,address:''};
 const burialValues={display_name:person.name,birth_date:person.birth_date,death_date:person.death_date,lot_id:target.lot_id,interment_date:interment.interment_date,record_status:'active',public_display:true,interment_status:policy.interment_status,remains_type:policy.remains_type,reference_no:interment.sample_id,interment_order_number:interment.sample_id,interment_confirmed:false,record_source:SAMPLE_SOURCE,quality_notes:note};
 const fingerprint=sha256(JSON.stringify({dataset:dataset.workbook_sha256,identity,policy,ownerValues,burialValues,hold_release:b.hold_release_review_reference??null}));
 const requests=Object.fromEntries(['owner','lot','burial'].map(k=>[k,requestId(fingerprint+':'+k)]));
 plan.proposed_operations={owner_create:{sample_id:owner.sample_id,values:ownerValues,request_id:requests.owner},lot_update:{id:target.lot_id,revision:target.revision,preserve_lot_code:target.lot_code,preserve_area_id:target.area_id,preserve_block_id:target.block_id,attach_new_owner:true,status_change:target.status==='HOLD'?'HOLD -> AVAILABLE':null,request_id:requests.lot},burial_and_deceased_create:{sample_id:interment.sample_id,values:burialValues,request_id:requests.burial},approval_fingerprint:fingerprint};
 const expectedRequest={entity:'burial_record',id:null,revision:null,values:burialValues,operation:'save'};
 const sql=`-- PROPOSED ONLY. Target ddoowghocqyfoxaikifb; use the reviewed project-pinned transport.
-- Exact approval, verified backup and the three migrations are prerequisites.
-- Existing active ADMIN actor; normal protected writer, no role/permission changes.
begin;
set local statement_timeout='30s';set local lock_timeout='5s';
select set_config('request.jwt.claim.sub',${q(policy.actor_account_id)},true);
do $sample$
declare target public.lot; saved_owner jsonb; prior public.staff_mutation; saved jsonb;
begin
 if not public.is_active_admin() then raise exception 'Existing active administrator required';end if;
 if (select count(*) from supabase_migrations.schema_migrations where version in (${REQUIRED_MIGRATIONS.map(q).join(',')}))<>3 then raise exception 'Required RC migrations missing';end if;
 perform pg_advisory_xact_lock(hashtextextended(${q(SAMPLE_SOURCE)},0));
 select * into prior from public.staff_mutation where actor_id=auth.uid() and request_id=${q(requests.burial)}::uuid;
 if found and prior.result is not null then
  if prior.request is distinct from ${json(expectedRequest)} then raise exception 'Receipt fingerprint conflict';end if;
  return;
 end if;
 if exists(select 1 from public.burial_record where record_source=${q(SAMPLE_SOURCE)} and reference_no=${q(interment.sample_id)}) or exists(select 1 from public.lot_owner where aliases=${q(ownerMarker)}) then raise exception 'Sample source ID already exists; inspect receipt, never duplicate';end if;
 select * into target from public.lot where lot_id=${target.lot_id} for update;
 if not found or target.revision<>${target.revision} or target.lot_code<>${q(target.lot_code)} or target.area_id<>${target.area_id} or target.block_id is distinct from ${target.block_id??'null'}::bigint or target.deleted_at is not null or target.lot_owner_id is not null or target.status<>${q(target.status)} or target.grave_type is not null then raise exception 'Target identity/revision/policy changed';end if;
 if exists(select 1 from public.burial_record where lot_id=target.lot_id) then raise exception 'Existing interment association; stop';end if;
 ${syntheticAssignment?"if nullif(btrim(target.legacy_location_code),'') is not null or nullif(btrim(target.legacy_pa_number),'') is not null or exists(select 1 from public.plot_geometry where lot_id=target.lot_id) or exists(select 1 from public.grave_access_point where lot_id=target.lot_id) then raise exception 'Conflicting source-purpose reference; stop';end if;":''}
 saved_owner:=public.staff_save_record('lot_owner',null,null,${json(ownerValues)},${q(requests.owner)}::uuid,'save');
 -- Preserve the locked scope/geometry: this writer treats omitted keys as coordinate changes.
 saved:=public.staff_save_record('lot',target.lot_id::text,target.revision,jsonb_build_object('lot_code',target.lot_code,'area_id',target.area_id,'location_geom',to_jsonb(target)->'location_geom','lot_owner_id',saved_owner->>'id'${target.status==='HOLD'?",'status','AVAILABLE'":''}),${q(requests.lot)}::uuid,'save');
 saved:=public.staff_save_record('burial_record',null,null,${json(burialValues)},${q(requests.burial)}::uuid,'save');
end $sample$;
select jsonb_build_object('source_row_key',${q(plot.source_key)},'existing_lot_id',${q(target.lot_id)},'approval_fingerprint',${q(fingerprint)},'receipts',(select jsonb_agg(jsonb_build_object('request_id',request_id,'result',result)) from public.staff_mutation where actor_id=auth.uid() and request_id in (${Object.values(requests).map(x=>q(x)+'::uuid').join(',')}))) as sample_import_receipt;
commit;
`;
 return {plan,sql};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const a={};for(let i=2;i<process.argv.length;i+=2){assert.ok(['--dataset','--source','--snapshot','--preflight','--bindings','--out'].includes(process.argv[i]));a[process.argv[i]]=process.argv[i+1];}
 for(const k of ['--dataset','--source','--snapshot','--preflight','--bindings','--out'])assert.ok(a[k],`Missing ${k}`);
 const load=async k=>{const bytes=await readFile(a[k]);return {data:JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')),digest:sha256(bytes)};};
 const [d,s,t,p,b]=await Promise.all(['--dataset','--source','--snapshot','--preflight','--bindings'].map(load));
 assert.equal(b.data.sample_dataset_sha256,d.digest,'Review must pin the exact personal-data package');
 assert.ok(ref(d.data.workbook_path),'Original workbook path required');
 assert.equal(sha256(await readFile(d.data.workbook_path)),d.data.workbook_sha256,'Prepared workbook changed');
 for(const [file,hash]of [['workbook','workbook_sha256'],['crosswalk_report','crosswalk_report_sha256']])assert.equal(sha256(await readFile(s.data.sources[file])),s.data.sources[hash],`Authoritative ${file} changed`);
 const result=prepareSamples(d.data,s.data,t.data,p.data,b.data,{snapshotDigest:t.digest,preflightDigest:p.digest});
 await mkdir(a['--out'],{recursive:true});
 const sqlPath=resolve(a['--out'],'PROPOSED_AFTER_APPROVAL_AND_MIGRATIONS.sql');
 try{await readFile(sqlPath);throw new Error('Existing SQL present; use a fresh review output directory');}catch(e){if(e.code!=='ENOENT')throw e;}
 await writeFile(resolve(a['--out'],'project-sample-pilot-plan.private.json'),JSON.stringify(result.plan,null,2));
 if(result.sql)await writeFile(sqlPath,result.sql,{flag:'wx'});
 console.log(JSON.stringify({prepared:result.plan.total_prepared,pilot:result.plan.pilot.interment_id,ready_for_exact_approval:result.plan.ready_for_exact_approval,review_reasons:result.plan.review_reasons,missing_migrations:result.plan.missing_migrations,hosted_writes:0}));
}
