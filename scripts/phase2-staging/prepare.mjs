import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

export const sha256=value=>createHash('sha256').update(value).digest('hex');
const id=value=>typeof value==='string'&&/^[1-9][0-9]{0,18}$/.test(value)&&BigInt(value)<=9223372036854775807n;
const review=value=>typeof value==='string'&&value.trim().length>0;
const key=(garden,lawn)=>JSON.stringify([garden,lawn]);
export function validateSource(source){
 assert.equal(source.format,'gravenav-phase2-source-register-v1');assert.equal(source.rows.length,4470);assert.equal(source.cad_candidates.length,4494);
 assert.equal(new Set(source.rows.map(r=>r.source_row_key)).size,4470);
 const cad=new Map(source.cad_candidates.map(r=>[r[0],r[2]]));assert.equal(cad.size,4494);
 const mapped=new Set();
 for(const r of source.rows){
  assert.match(r.source_row_key,/^[0-9a-f]{64}$/);assert.ok(typeof r.garden==='string'&&typeof r.lawn==='string');
  assert.ok([2,3,4,5,6,7].includes(r.pdf_page));assert.ok(['STD','PRM','SPR','ESTATE'].includes(r.commercial_class));
  for(const field of ['block_literal','lot_literal'])assert.ok(r[field]===null||typeof r[field]==='string');
  assert.equal(r.database_lot_id,null);assert.equal(r.official_link_approved,'NO');assert.equal(r.occupancy,'UNKNOWN');
  if(r.cad_candidate_id){assert.equal(cad.get(r.cad_candidate_id),r.cad_instance_path);assert.ok(!mapped.has(r.cad_candidate_id));mapped.add(r.cad_candidate_id);}
  else assert.equal(r.cad_instance_path,null);
 }
 assert.equal(mapped.size,4451);return source;
}
export function buildPreview(source,bindings,snapshot=null,{snapshotDigest=null,allowFixture=false}={}){
 validateSource(source);assert.equal(bindings.format,'gravenav-phase2-reviewed-bindings-v1');
 assert.equal(bindings.source_workbook_sha256,source.sources.workbook_sha256);
 if(snapshot){
  assert.equal(snapshot.model,'gravenav-site-area-lot-bigint-v1','Refusing a different cemetery database model');
  // Hosted origin stays explicit; read approval permits a file-only preview, never promotion.
  const approvedHosted=snapshot.origin?.kind==='hosted-read-only-snapshot'
   &&snapshot.origin.project_ref==='ddoowghocqyfoxaikifb'
   &&bindings.target_project_ref===snapshot.origin.project_ref
   &&review(bindings.target_read_approval_reference);
  assert.ok(snapshot.origin?.kind==='local-read-only-snapshot'||approvedHosted||(allowFixture&&snapshot.origin?.kind==='disposable-test-fixture'),'Only local snapshots or explicitly approved GraveNav hosted snapshots are accepted');
  assert.equal(bindings.target_snapshot_sha256,snapshotDigest,'Reviewed bindings must identify the exact target snapshot');
  for(const [table,pk]of[['site','site_id'],['area','area_id'],['sector','sector_id'],['block','block_id'],['lot','lot_id']]){
   assert.ok(Array.isArray(snapshot[table]));for(const row of snapshot[table])assert.ok(id(row[pk]),`Invalid text bigint ${table}.${pk}`);
   assert.equal(new Set(snapshot[table].map(r=>r[pk])).size,snapshot[table].length);
  }
 }
 const scopes=new Map();for(const scope of bindings.scopes){const k=key(scope.garden,scope.lawn);assert.ok(!scopes.has(k),'Duplicate source scope binding');scopes.set(k,scope);}
 const aliases=new Map();for(const b of bindings.lot_bindings){assert.ok(!aliases.has(b.source_row_key),'Duplicate lot binding');aliases.set(b.source_row_key,b);}
 const sourceKeys=new Set(source.rows.map(r=>r.source_row_key));for(const k of aliases.keys())assert.ok(sourceKeys.has(k),'Binding references an unknown source row');
 const results=source.rows.map(r=>{
  const flags=[];if(!r.block_literal||!r.lot_literal)flags.push('SOURCE_NUMBERING_INCOMPLETE');
  if(!r.cad_candidate_id)flags.push('CAD_OUTLINE_UNRESOLVED');if(r.overlap_fids_literal)flags.push('CAD_OVERLAP_REVIEW');
  if(r.pdf_page===4)flags.push('SCOPE_CLASS_TOTAL_DISCREPANCY');
  const out={source_row_key:r.source_row_key,workbook_row:r.workbook_row,garden:r.garden,lawn:r.lawn,block_literal:r.block_literal,lot_literal:r.lot_literal,commercial_class:r.commercial_class,pdf_page:r.pdf_page,pdf_locator:r.pdf_locator,cad_candidate_id:r.cad_candidate_id,cad_instance_path:r.cad_instance_path,review_flags:flags,action:'REVIEW_TARGET_UNAVAILABLE',site_id:null,area_id:null,sector_id:null,block_id:null,existing_lot_id:null,existing_lot_revision:null,approved_lot_code:null,operational_write_allowed:false,occupancy:'UNKNOWN',availability:'UNKNOWN',grave_type:null,capacity:null,owner_id:null,gps:null};
  if(!snapshot)return out;
  const site=bindings.site,scope=scopes.get(key(r.garden,r.lawn)),b=aliases.get(r.source_row_key);
  out.action='REVIEW_SCOPE_BINDING';
  if(!review(site?.review_reference)||!id(site.site_id)||!snapshot.site.some(s=>s.site_id===site.site_id))return out;
  if(!scope||!review(scope.review_reference)||!id(scope.area_id))return out;
  const area=snapshot.area.find(a=>a.area_id===scope.area_id&&a.site_id===site.site_id);if(!area){out.action='CONFLICT_SCOPE';return out;}
  out.site_id=site.site_id;out.area_id=area.area_id;
  if(scope.sector_id!==null&&scope.sector_id!==undefined){
   const sector=snapshot.sector.find(s=>s.sector_id===scope.sector_id&&s.area_id===area.area_id);if(!sector){out.action='CONFLICT_SECTOR';return out;}out.sector_id=sector.sector_id;
   if(r.block_literal){const blocks=snapshot.block.filter(v=>v.sector_id===sector.sector_id&&BigInt(v.block_number)===BigInt(r.block_literal));if(blocks.length>1){out.action='CONFLICT_BLOCK';return out;}if(blocks.length===1)out.block_id=blocks[0].block_id;else flags.push('BLOCK_FK_UNRESOLVED');}
  }else if(r.block_literal)flags.push('BLOCK_FK_UNRESOLVED');
  out.action='REVIEW_APPROVED_LOT_CODE';
  if(!b||!review(b.review_reference)||!review(b.approved_lot_code))return out;
  if(b.expected_lot_id!=null)assert.ok(id(b.expected_lot_id),'Expected lot IDs must be decimal text bigints');
  out.approved_lot_code=b.approved_lot_code;
  const matches=snapshot.lot.filter(l=>l.area_id===area.area_id&&l.lot_code===b.approved_lot_code);
  if(matches.length>1){out.action='CONFLICT_MULTIPLE_EXISTING_LOTS';return out;}
  const lot=matches[0];
  if(lot){
   if(b.expected_lot_id!=null&&lot.lot_id!==b.expected_lot_id){out.action='CONFLICT_EXPECTED_LOT_ID';return out;}
   if(lot.deleted){out.action='CONFLICT_REMOVED_LOT';return out;}
   if(lot.block_id!=null){
    const block=snapshot.block.find(v=>v.block_id===lot.block_id),sector=block&&snapshot.sector.find(v=>v.sector_id===block.sector_id);
    if(!block||!sector||sector.area_id!==area.area_id||(scope.sector_id&&sector.sector_id!==scope.sector_id)||(r.block_literal&&BigInt(block.block_number)!==BigInt(r.block_literal))){out.action='CONFLICT_EXISTING_BLOCK';return out;}
   }
   out.existing_lot_id=lot.lot_id;out.existing_lot_revision=lot.revision??null;out.block_id=lot.block_id;out.action=Number.isSafeInteger(lot.revision)&&lot.revision>0?'MATCH_EXISTING_REVIEW':'REVIEW_EXISTING_REVISION';return out;
  }
  if(b.expected_lot_id!=null){out.action='CONFLICT_EXPECTED_LOT_MISSING';return out;}
  if(!r.block_literal||!r.lot_literal){out.action='REVIEW_SOURCE_NUMBERING';return out;}
  out.action='PROPOSE_CREATE_HELD';flags.push('TARGET_UNKNOWN_AVAILABILITY_NOT_VERIFIED','OPERATIONAL_PROMOTION_NOT_AUTHORIZED');return out;
 });
 const used=new Map();for(const r of results)if(r.existing_lot_id){const prior=used.get(r.existing_lot_id);if(prior){for(const v of[prior,r]){v.action='CONFLICT_REUSED_LOT_ID';v.existing_lot_id=null;v.existing_lot_revision=null;}}else used.set(r.existing_lot_id,r);}
 const count={};for(const r of results)count[r.action]=(count[r.action]??0)+1;
 const complete=source.rows.filter(r=>r.block_literal!==null&&r.lot_literal!==null).length;
 return{format:'gravenav-phase2-local-import-preview-v1',sources:source.sources,target_evidence:snapshot?{kind:snapshot.origin.kind,snapshot_sha256:snapshotDigest,...(snapshot.origin.kind==='hosted-read-only-snapshot'?{project_ref:snapshot.origin.project_ref}:{})}:{kind:'NO_COMPATIBLE_TARGET_SNAPSHOT'},counts:{source_rows:4470,cad_candidates_preserved:4494,source_complete_identities:complete,source_incomplete_identities:4470-complete,conditional_create_candidates_from_source:complete,ready_operational_creates:0,verified_existing_matches:results.filter(r=>r.action==='MATCH_EXISTING_REVIEW').length,target_match_evaluation_performed:snapshot!==null,actions:count},rows:results};
}
const literal=value=>{const marker='$phase2_payload_677bafa5$';assert.ok(!value.includes(marker));return marker+value+marker;};
export function makeStageSql(source,preview){
 const raw=JSON.stringify(source.rows),cad=JSON.stringify(source.cad_candidates),proposed=JSON.stringify(preview.rows);
 const load=`insert into pg_temp.phase2_source_row(source_row_key,workbook_row,garden,lawn,block_literal,lot_literal,commercial_class,pdf_page,pdf_locator,cad_candidate_id,cad_instance_path,source_payload)
 select r->>'source_row_key',(r->>'workbook_row')::int,r->>'garden',r->>'lawn',r->>'block_literal',r->>'lot_literal',r->>'commercial_class',(r->>'pdf_page')::int,r->>'pdf_locator',r->>'cad_candidate_id',r->>'cad_instance_path',r from jsonb_array_elements(${literal(raw)}::jsonb) r on conflict(source_row_key) do nothing;`;
 return `\\set ON_ERROR_STOP on
begin;
do $$ begin if current_database() not like 'gravenav_phase2_stage_%' then raise exception 'This dry run requires a disposable gravenav_phase2_stage_ database'; end if; end $$;
create temporary table phase2_cad_candidate(candidate_id text primary key,instance_path text not null,source_payload jsonb not null) on commit drop;
create temporary table phase2_source_row(source_row_key text primary key,workbook_row int not null unique,garden text not null,lawn text not null,block_literal text,lot_literal text,commercial_class text not null check(commercial_class in ('STD','PRM','SPR','ESTATE')),pdf_page int not null,pdf_locator text not null,cad_candidate_id text references phase2_cad_candidate(candidate_id),cad_instance_path text,source_payload jsonb not null,check((cad_candidate_id is null)=(cad_instance_path is null))) on commit drop;
-- PostgreSQL temporary FKs can reference only temporary tables. These session-only
-- ID registries are copied from the real physical tables; no IDs are generated.
${['site','area','sector','block','lot'].map(t=>`create temporary table phase2_target_${t}(${t}_id bigint primary key) on commit drop;insert into phase2_target_${t} select ${t}_id from public.${t};`).join('\n')}
create temporary table phase2_import_preview(source_row_key text primary key references phase2_source_row(source_row_key),action text not null,site_id bigint references phase2_target_site(site_id),area_id bigint references phase2_target_area(area_id),sector_id bigint references phase2_target_sector(sector_id),block_id bigint references phase2_target_block(block_id),existing_lot_id bigint references phase2_target_lot(lot_id),payload jsonb not null,check(payload->>'operational_write_allowed'='false')) on commit drop;
insert into phase2_cad_candidate select r->>0,r->>2,r from jsonb_array_elements(${literal(cad)}::jsonb) r;
${load}
-- Exact retries retain one source row. A changed payload with the same key fails below.
${load}
insert into phase2_import_preview select r->>'source_row_key',r->>'action',(r->>'site_id')::bigint,(r->>'area_id')::bigint,(r->>'sector_id')::bigint,(r->>'block_id')::bigint,(r->>'existing_lot_id')::bigint,r from jsonb_array_elements(${literal(proposed)}::jsonb) r;
do $$ begin
 if (select count(*) from phase2_source_row)<>4470 or (select count(*) from phase2_cad_candidate)<>4494 or (select count(*) from phase2_import_preview)<>4470 then raise exception 'Source counts changed';end if;
 if (select count(distinct cad_candidate_id) from phase2_source_row)<>4451 then raise exception 'CAD correspondence counts changed';end if;
 if exists(select 1 from phase2_source_row s join phase2_cad_candidate c on c.candidate_id=s.cad_candidate_id where s.cad_instance_path<>c.instance_path) then raise exception 'CAD instance path mismatch';end if;
 if exists(select 1 from phase2_source_row s join jsonb_array_elements(${literal(raw)}::jsonb) r on r->>'source_row_key'=s.source_row_key where s.source_payload<>r) then raise exception 'A repeated source key has changed payload';end if;
 if (select count(*) from phase2_source_row where block_literal is null or lot_literal is null)<>351 then raise exception 'Source numbering was filled';end if;
 if exists(select 1 from phase2_source_row where source_payload->>'occupancy'<>'UNKNOWN' or source_payload->>'official_link_approved'<>'NO') then raise exception 'Unapproved operational claim';end if;
 if exists(select 1 from phase2_import_preview p join public.area a on a.area_id=p.area_id where p.site_id is distinct from a.site_id) then raise exception 'Area belongs to a different site';end if;
 if exists(select 1 from phase2_import_preview p join public.lot l on l.lot_id=p.existing_lot_id where l.area_id is distinct from p.area_id or l.deleted_at is not null) then raise exception 'Existing lot scope changed';end if;
end $$;
select jsonb_build_object('dry_run','TEMP_STAGING_PASSED','source_rows',(select count(*) from phase2_source_row),'cad_candidates',(select count(*) from phase2_cad_candidate),'preview_rows',(select count(*) from phase2_import_preview),'operational_lots_written',0,'personal_records_written',0,'existing_operational_lots',(select count(*) from public.lot),'regular_capacity',public.grave_interment_limit('regular',null));
rollback;
`;
}
function csv(rows){const cols=Object.keys(rows[0]);const cell=v=>v===null||v===undefined?'':'"'+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll('"','""')+'"';return cols.map(cell).join(',')+'\n'+rows.map(r=>cols.map(c=>cell(r[c])).join(',')).join('\n')+'\n';}
export async function prepare({sourcePath,bindingsPath,out,repo,snapshotPath=null}){
 const source=JSON.parse((await readFile(sourcePath,'utf8')).replace(/^\uFEFF/,'')),bindings=JSON.parse((await readFile(bindingsPath,'utf8')).replace(/^\uFEFF/,''));
 for(const [pathField,hashField]of[['workbook','workbook_sha256'],['crosswalk_report','crosswalk_report_sha256']])assert.equal(sha256(await readFile(source.sources[pathField])),source.sources[hashField],`Authoritative ${pathField} changed`);
 let snapshot=null,digest=null;if(snapshotPath){const bytes=await readFile(snapshotPath);digest=sha256(bytes);snapshot=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));}
 const preview=buildPreview(source,bindings,snapshot,{snapshotDigest:digest});await mkdir(out,{recursive:true});
 await writeFile(resolve(out,'import-preview.json'),JSON.stringify(preview,null,2));await writeFile(resolve(out,'import-preview.csv'),csv(preview.rows));
 const linked=new Set(source.rows.map(r=>r.cad_candidate_id).filter(Boolean)),cadOnly=source.cad_candidates.filter(r=>!linked.has(r[0]));assert.equal(cadOnly.length,43);
 await writeFile(resolve(out,'cad-candidate-preservation.json'),JSON.stringify({count:4494,cad_only_count:43,headers:source.cad_index_headers,rows:source.cad_candidates},null,2));
 await writeFile(resolve(out,'cad-only-review.csv'),csv(cadOnly.map(r=>({cad_candidate_id:r[0],source_layer:r[1],full_instance_path:r[2],action:'CAD_ONLY_REVIEW',existing_overlap_fids:r[10],native_shape_mismatch:r[11],source_note:r[12],database_lot_id:null}))));
 await writeFile(resolve(out,'temporary-staging-dry-run.sql'),makeStageSql(source,preview));
 const scopes=[...new Set(source.rows.map(r=>key(r.garden,r.lawn)))].map(v=>{const[garden,lawn]=JSON.parse(v);return{garden,lawn,site_id:null,area_id:null,sector_id:null,action:'REVIEW_EXISTING_SCOPE_IDS'};});
 const blocks=[...new Set(source.rows.filter(r=>r.block_literal).map(r=>JSON.stringify([r.garden,r.lawn,r.block_literal])))].map(v=>{const[garden,lawn,block_literal]=JSON.parse(v);return{garden,lawn,block_literal,block_id:null,action:'MATCH_OR_PROPOSE_ONLY_AFTER_SCOPE_REVIEW'};});assert.equal(blocks.length,552);
 await writeFile(resolve(out,'scope-and-block-plan.json'),JSON.stringify({scopes,blocks},null,2));
 const migrationsDir=resolve(repo,'supabase/migrations'),files=(await readdir(migrationsDir)).filter(f=>f.endsWith('.sql')).sort();
 const migrations=[];for(const name of files){const bytes=await readFile(resolve(migrationsDir,name));migrations.push({name,sha256:sha256(bytes),sql:bytes.toString('utf8')});}
 const bootstrap=`\\set ON_ERROR_STOP on\ndo $$ begin if current_database() not like 'gravenav_phase2_stage_%' then raise exception 'Disposable staging database required'; end if; end $$;\ncreate schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;\n`+migrations.map(m=>`\n-- RELEASE CANDIDATE MIGRATION ${m.name}\n${m.sql}`).join('\n');
 await writeFile(resolve(out,'bootstrap-disposable-rc-schema.sql'),bootstrap);
 await writeFile(resolve(out,'staging-manifest.json'),JSON.stringify({created:'2026-11-16',mode:'LOCAL_PREVIEW_ONLY',sources:source.sources,counts:preview.counts,target_evidence:preview.target_evidence,migrations:migrations.map(m=>({name:m.name,sha256:m.sha256})),cad_geometry_modified:false,hosted_connection:false,gis_limits_changed:false},null,2));
 return preview;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args={};for(let i=2;i<process.argv.length;i+=2){assert.ok(['--source','--bindings','--out','--repo','--snapshot'].includes(process.argv[i]),'Unknown argument');assert.ok(process.argv[i+1]);args[process.argv[i]]=process.argv[i+1];}
 for(const k of['--source','--bindings','--out'])assert.ok(args[k],`Missing ${k}`);
 const result=await prepare({sourcePath:args['--source'],bindingsPath:args['--bindings'],out:args['--out'],repo:args['--repo']??resolve(dirname(fileURLToPath(import.meta.url)),'../..'),snapshotPath:args['--snapshot']});console.log(JSON.stringify(result.counts));
}
