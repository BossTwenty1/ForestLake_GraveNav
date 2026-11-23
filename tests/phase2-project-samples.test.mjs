import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as parkDetails from '../src/lib/park-details.ts';
import {sha256} from '../scripts/phase2-staging/prepare.mjs';
import {prepareSamples,REQUIRED_MIGRATIONS} from '../scripts/phase2-staging/prepare-project-samples.mjs';

function fixture(){
 const rows=Array.from({length:4470},(_,i)=>({source_row_key:sha256('PARSER-ONLY-'+i),garden:'Fictional garden',lawn:'A',block_literal:i<4119?'1':null,lot_literal:String(i+1),commercial_class:'STD',pdf_page:2,pdf_locator:'TEST ONLY',cad_candidate_id:i<4451?'lawn:'+i:null,cad_instance_path:i<4451?'TEST/'+i:null,database_lot_id:null,official_link_approved:'NO',occupancy:'UNKNOWN',overlap_fids_literal:null}));
 const source={sources:{workbook_sha256:sha256('SOURCE')},format:'gravenav-phase2-source-register-v1',rows,cad_candidates:Array.from({length:4494},(_,i)=>['lawn:'+i,'lawn','TEST/'+i])};
 const dataset={format:'gravenav-phase2-project-samples-v1',workbook_sha256:sha256('SAMPLE'),plots:rows.map(r=>({source_key:r.source_row_key,display_reference:'TEST '+r.lot_literal,garden:r.garden,lawn:r.lawn,block:r.block_literal,lot:r.lot_literal,commercial_class:r.commercial_class,pdf_page:r.pdf_page,cad_candidate_id:r.cad_candidate_id,review_flags:[],availability:'UNKNOWN',hosted_lot_id:null})),people:Array.from({length:100},(_,i)=>({sample_id:'DEMO-PER-'+(i+1),name:'Fictional Person '+i,birth_date:'1940-01-01',death_date:'2020-01-01',classification:'SYNTHETIC'})),interments:Array.from({length:100},(_,i)=>({sample_id:i===0?'DEMO-INT-0001':'DEMO-INT-'+(i+1),person_id:'DEMO-PER-'+(i+1),source_key:rows[i%90].source_row_key,interment_date:'2020-01-02',classification:'SYNTHETIC'})),owners:Array.from({length:45},(_,i)=>({sample_id:'DEMO-OWN-'+(i+1),name:'Fictional Owner'+i,source_key:rows[i].source_row_key,classification:'SYNTHETIC'}))};
 const snapshot={model:'gravenav-site-area-lot-bigint-v1',origin:{kind:'hosted-read-only-snapshot',project_ref:'ddoowghocqyfoxaikifb'},site:[{site_id:'1'}],area:[{area_id:'5',site_id:'1'}],sector:[{sector_id:'2',area_id:'5'}],block:[{block_id:'3',sector_id:'2',block_number:1}],lot:[{lot_id:'9007199254740998',area_id:'5',block_id:'3',lot_code:'TEST-EXISTING-CODE',revision:2,deleted:false}]};
 const preflight={project_ref:'ddoowghocqyfoxaikifb',transaction_read_only:'on',migrations:REQUIRED_MIGRATIONS,lots:[{...snapshot.lot[0],status:'HOLD',owner_attached:false,burial_associations:0}],existing_sample_records:0};
 const bindings={format:'gravenav-phase2-reviewed-bindings-v1',source_workbook_sha256:source.sources.workbook_sha256,target_project_ref:'ddoowghocqyfoxaikifb',target_read_approval_reference:'TEST READ',site:{site_id:'1',review_reference:'TEST SITE'},scopes:[{garden:'Fictional garden',lawn:'A',area_id:'5',sector_id:'2',review_reference:'TEST SCOPE'}],lot_bindings:[{source_row_key:rows[0].source_row_key,approved_lot_code:'TEST-EXISTING-CODE',expected_lot_id:'9007199254740998',review_reference:'TEST AUTHORITATIVE IDENTITY',hold_release_review_reference:'TEST EXPLICIT RELEASE'}],project_sample_policy:{actor_account_id:'10000000-0000-4000-8000-000000000001',remains_type:'ASH',interment_status:'PERMANENT',defaults_review_reference:'TEST FICTIONAL DEFAULTS'}};
 return {source,dataset,snapshot,preflight,bindings};
}
function run(f){const sd=sha256(JSON.stringify(f.snapshot)),pd=sha256(JSON.stringify(f.preflight));f.bindings.target_snapshot_sha256=sd;f.bindings.relationship_preflight_sha256=pd;return prepareSamples(f.dataset,f.source,f.snapshot,f.preflight,f.bindings,{snapshotDigest:sd,preflightDigest:pd});}

test('unbound plots produce a held plan and no executable record SQL',()=>{const f=fixture();f.bindings.lot_bindings=[];const r=run(f);assert.equal(r.plan.ready_for_exact_approval,false);assert.equal(r.sql,null);assert.equal(r.plan.pilot.existing_lot_id,null);assert.equal(r.plan.total_prepared.people,100);});
test('reviewed pilot preserves text bigint IDs and uses protected writers without creating plots',()=>{const f=fixture(),before=JSON.stringify(f.dataset),r=run(f);assert.equal(r.plan.ready_for_exact_approval,true);assert.equal(r.plan.execution_authorized,false);assert.equal(r.plan.pilot.existing_lot_id,'9007199254740998');assert.equal(JSON.stringify(f.dataset),before);assert.match(r.sql,/staff_save_record\('lot_owner'/);assert.match(r.sql,/staff_save_record\('lot',target.lot_id/);assert.match(r.sql,/staff_save_record\('burial_record'/);assert.doesNotMatch(r.sql,/insert into (?:public\.)?lot\b|disable trigger|session_replication_role|grant |create table|truncate/i);assert.match(r.sql,/source_row_key/);});
test('HOLD requires explicit release review, UNKNOWN and BOOKED cannot be bypassed',()=>{for(const status of ['UNKNOWN','BOOKED']){const f=fixture();f.preflight.lots[0].status=status;assert.equal(run(f).sql,null);}const f=fixture();f.bindings.lot_bindings[0].hold_release_review_reference=null;assert.equal(run(f).sql,null);});
test('attached owners, any burial reservation and missing safety fields block reassignment',()=>{for(const patch of [{owner_attached:true},{burial_associations:1},{deleted:true},{owner_attached:undefined}]){const f=fixture();Object.assign(f.preflight.lots[0],patch);assert.equal(run(f).sql,null);}});
test('stale target revisions and block conflicts remain held',()=>{const f=fixture();f.preflight.lots[0].revision=3;assert.equal(run(f).sql,null);const g=fixture();g.snapshot.block[0].block_number=2;assert.equal(run(g).sql,null);});
test('source review flags, missing actor/defaults and prior sample batches remain held',()=>{for(const mode of ['source','actor','defaults','existing']){const f=fixture();if(mode==='source')f.source.rows[0].overlap_fids_literal='TEST';if(mode==='actor')f.bindings.project_sample_policy.actor_account_id=null;if(mode==='defaults')f.bindings.project_sample_policy.defaults_review_reference=null;if(mode==='existing')f.preflight.existing_sample_records=1;assert.equal(run(f).sql,null);}});
test('missing hosted migrations are listed and generated SQL enforces all three before writing',()=>{const f=fixture();f.preflight.migrations=[];const r=run(f);assert.deepEqual(r.plan.missing_migrations,REQUIRED_MIGRATIONS);assert.match(r.sql,/Required RC migrations missing/);assert.ok(r.sql.indexOf('Required RC migrations missing')<r.sql.indexOf("staff_save_record('lot_owner'"));});
test('stable receipts support identical replay and reject a conflicting existing sample source',()=>{const f=fixture(),a=run(f),b=run(f);assert.equal(a.sql,b.sql);assert.match(a.sql,/prior.request is distinct from/);assert.match(a.sql,/return;/);assert.match(a.sql,/Sample source ID already exists/);assert.match(a.sql,/for update/);assert.match(a.sql,/commit;\s*$/);});
test('explicit snapshots and original source fields cannot be silently substituted',()=>{const f=fixture();f.dataset.plots[0].commercial_class='SPR';assert.throws(()=>run(f),/Changed plot source/);const g=fixture();g.preflight.project_ref='another-project';assert.throws(()=>run(g));});
test('new synthetic assignment requires its own approval and never claims historical or physical identity',()=>{
 const f=fixture();f.bindings.lot_bindings[0].binding_kind='NEW_SYNTHETIC_PROJECT_ASSIGNMENT';
 Object.assign(f.preflight.lots[0],{gis_plot_references:0,access_point_references:0,legacy_location_reference_present:false,legacy_pa_reference_present:false,coordinate_verified:true});
 const proposed=run(f);assert.equal(proposed.sql,null);assert.equal(proposed.plan.pilot.historical_cad_identity_verified,false);assert.ok(proposed.plan.review_reasons.includes('NEW_SYNTHETIC_ASSIGNMENT_REQUIRES_APPROVAL'));
 f.bindings.lot_bindings[0].synthetic_assignment_approval_reference='TEST explicit NEW project assignment';const approved=run(f);
 assert.equal(approved.plan.ready_for_exact_approval,true);assert.equal(approved.plan.pilot.forest_lake_physical_assignment_verified,false);assert.match(approved.sql,/NEW_SYNTHETIC_PROJECT_ASSIGNMENT/);assert.match(approved.sql,/Conflicting source-purpose reference/);assert.doesNotMatch(approved.sql,/'coordinate_verified'|'coordinate_status'|st_makepoint|st_setsrid/i);
});
test('synthetic assignment rejects existing or unchecked GIS and legacy references',()=>{
 for(const patch of [{gis_plot_references:1},{access_point_references:1},{legacy_pa_reference_present:true},{legacy_location_reference_present:true},{gis_plot_references:undefined}]){
  const f=fixture();Object.assign(f.bindings.lot_bindings[0],{binding_kind:'NEW_SYNTHETIC_PROJECT_ASSIGNMENT',synthetic_assignment_approval_reference:'TEST ONLY'});
  Object.assign(f.preflight.lots[0],{gis_plot_references:0,access_point_references:0,legacy_location_reference_present:false,legacy_pa_reference_present:false},patch);
  assert.equal(run(f).sql,null);
 }
});


test('prepared sample runs through existing local workflows without changing lot identity', async t => {
 const {createTestDatabase}=await import('./database-helper.mjs');
 const {seedGisFixtures,gisLogin,gisActors}=await import('./gis-fixtures.mjs');
 const {randomUUID}=await import('node:crypto');
 const {readFileSync}=await import('node:fs');
 const {default:ts}=await import('typescript');
 const React=await import('react');
 const jsx=await import('react/jsx-runtime');
 const {renderToStaticMarkup}=await import('react-dom/server');
 function load(file,dependencies={}){
  const compiled=ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const loadedModule={exports:{}};new Function('require','module','exports',compiled)(name=>{assert.ok(name in dependencies,'Unexpected dependency '+name);return dependencies[name];},loadedModule,loadedModule.exports);return loadedModule.exports;
 }
 const db=await createTestDatabase({throughMigration:'20261116010000_unknown_plot_availability.sql'});t.after(()=>db.close());
 await seedGisFixtures(db);
 await db.exec(`insert into public.area(area_id,site_id,area_code,area_name,area_category) values(5,1,'SAMPLE-A','Fictional garden','garden');
 insert into public.sector(sector_id,area_id,sector_code,sector_name) values(2,5,'A','Fictional A');
 insert into public.block(block_id,sector_id,block_number) values(3,2,1);
 create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key);`);
 for(const version of REQUIRED_MIGRATIONS)await db.query('insert into supabase_migrations.schema_migrations values($1)',[version]);
 await gisLogin(db);
 const result=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.result;
 const save=(entity,values,options={})=>result("select public.staff_save_record($1,$2,$3,$4::jsonb,$5,'save') result",[entity,options.id??null,options.revision??null,JSON.stringify(values),randomUUID()]);
 const lot=await save('lot',{area_id:5,block_id:3,lot_code:'TEST-EXISTING-CODE',status:'HOLD'});
 const f=fixture();
 Object.assign(f.snapshot.lot[0],{lot_id:lot.id,revision:lot.revision});
 Object.assign(f.preflight.lots[0],{lot_id:lot.id,revision:lot.revision,gis_plot_references:0,access_point_references:0,legacy_location_reference_present:false,legacy_pa_reference_present:false});
 Object.assign(f.bindings.lot_bindings[0],{expected_lot_id:lot.id,binding_kind:'NEW_SYNTHETIC_PROJECT_ASSIGNMENT',synthetic_assignment_approval_reference:'TEST ONLY local sample approval'});
 const actor=f.bindings.project_sample_policy.actor_account_id;
 await gisLogin(db,gisActors.admin,'postgres');
 await db.query('insert into auth.users values($1)',[actor]);
 await db.query("insert into public.account(account_id,role_id,username,is_active,account_status,approved_at) select $1,role_id,'fictional-sample-admin',true,'ACTIVE',now() from public.role where role_name='ADMIN'",[actor]);
 const prepared=run(f);assert.equal(prepared.plan.ready_for_exact_approval,true,JSON.stringify(prepared.plan.review_reasons));
 await gisLogin(db,actor,'postgres');
 const beforeMigration=(await db.query('select to_jsonb(l) row from public.lot l order by lot_id')).rows;
 await db.exec(readFileSync(new URL('../supabase/migrations/20261117010000_project_sample_plot_reference.sql',import.meta.url),'utf8'));
 assert.deepEqual((await db.query('select to_jsonb(l) row from public.lot l order by lot_id')).rows,beforeMigration);
 await db.exec(prepared.sql);await db.exec(prepared.sql);
 const stored=(await db.query("select * from public.burial_record where record_source=$1",[prepared.plan.sample_source])).rows;
 assert.equal(stored.length,1,'identical replay must not duplicate the sample');
 const burial=stored[0],id=String(burial.burial_id);
 const originalLot=(await db.query('select lot_id,lot_code,area_id,block_id,coordinate_verified from public.lot where lot_id=$1',[lot.id])).rows[0];
 assert.equal(String(originalLot.lot_id),lot.id);assert.equal(originalLot.lot_code,'TEST-EXISTING-CODE');assert.equal(originalLot.area_id,5);assert.equal(originalLot.block_id,3);assert.equal(originalLot.coordinate_verified,false);
 assert.equal(burial.interment_confirmed,false);

 await t.test('anonymous search and profile expose only the reference, retaining the internal code',async()=>{
  await gisLogin(db,null,'anon');
  for(const query of ['Fictional Person 0','TEST 1','TEST-EXISTING-CODE']){
   const page=await result('select public.search_public_burials($1) result',[query]);
   assert.equal(page.total,1);assert.equal(String(page.items[0].burial_id),id);assert.equal(page.items[0].synthetic_plot_reference,'TEST 1');assert.equal(page.items[0].lot_code,'TEST-EXISTING-CODE');
   assert.doesNotMatch(JSON.stringify(page),/quality_notes|record_source|source_row_key|cad_instance_path|owner_id|PROJECT_SAMPLE_FICTIONAL/);
  }
  const filtered=await result("select public.search_public_burials('TEST 1','Different garden') result");assert.equal(filtered.total,0);
  await assert.rejects(db.query('select quality_notes from public.burial_record'),/permission denied/);
 });
 await t.test('malformed, unrelated and moved provenance cannot become a public sample reference',async()=>{
  const notes=JSON.parse(burial.quality_notes);
  for(const [source,note,lotId] of [[null,notes,lot.id],['unrelated',notes,lot.id],[prepared.plan.sample_source,'{broken',lot.id],[prepared.plan.sample_source,{...notes,existing_lot_id:'999'},lot.id],[prepared.plan.sample_source,{...notes,display_reference:''},lot.id],[prepared.plan.sample_source,{...notes,display_reference:'x'.repeat(201)},lot.id],[prepared.plan.sample_source,{...notes,display_reference:123},lot.id]]){
   assert.equal(await result('select public.project_sample_plot_reference($1,$2,$3) result',[source,typeof note==='string'?note:JSON.stringify(note),lotId]),null);
  }
 });

 const client={
  async rpc(name,args={}){
   const calls={search_public_burials:['select public.search_public_burials($1,$2,$3,$4,$5,$6) result',[args.p_query,args.p_section,args.p_year,args.p_sort,args.p_page,args.p_page_size]],public_shared_plot_burials:['select public.public_shared_plot_burials($1) result',[args.p_burial_id]],staff_plot_management:['select public.staff_plot_management($1,$2,$3,$4,$5,$6,$7,$8) result',[args.p_query,args.p_area,args.p_state,args.p_verification,args.p_sort,args.p_direction,args.p_page,args.p_page_size]],staff_sample_plot_references:['select public.staff_sample_plot_references($1) result',[args.p_lot_ids]]};
   assert.ok(calls[name],'Unexpected RPC '+name);const [sql,params]=calls[name];return {data:await result(sql,params),error:null};
  },
  from(table){
   assert.equal(table,'public_burial_records');let filter=null,cap=1000,single=false;
   const chain={select:()=>chain,eq:(key,value)=>{assert.ok(['burial_id','lot_code'].includes(key));filter=[key,value];return chain;},limit:n=>{cap=n;return chain;},maybeSingle:()=>{single=true;return chain;},then(resolve,reject){return db.query('select * from public.public_burial_records'+(filter?' where '+filter[0]+'=$1':'')+' limit '+cap,filter?[filter[1]]:[]).then(({rows})=>{rows=rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value instanceof Date?value.toISOString().slice(0,10):value])));return resolve({data:single?rows[0]??null:rows,error:null});},reject);}};return chain;
  }
 };
 const readers=load('src/lib/supabase/public-data.ts',{'./config':{getPublicSupabase:()=>client}});
 const staff=load('src/lib/supabase/admin-data.ts',{'./config':{getBrowserSupabase:()=>client},'./mutation-receipts':{}});
 let record;
 await t.test('existing readers, profile and search components keep both identities separate',async()=>{
  await gisLogin(db,null,'anon');
  const searched=await readers.searchPublicBurials({query:'TEST 1'});record=await readers.getPublicBurialRecord(id);
  assert.deepEqual(searched.items[0],{...record,matchType:'exact'});assert.equal(record.syntheticPlotReference,'TEST 1');assert.equal(record.plot,'TEST-EXISTING-CODE');assert.equal(record.id,id);assert.equal(record.locationVerified,false);
  assert.equal((await readers.getPublicBurialRecordByPlot(record.plot)).id,id);
  const syntheticPlots=load('src/lib/synthetic-plots.ts');
  const presentation=load('src/lib/visitor-presentation.ts',{'./synthetic-plots':syntheticPlots});
  const ui={'@/lib/park-details':parkDetails,'react/jsx-runtime':jsx,'next/link':{__esModule:true,default:({href,children,...props})=>{delete props.prefetch;return jsx.jsx('a',{...props,href,children});}},'@/components/ui/icons':{Icon:()=>null},'@/lib/visitor-presentation':presentation};
  const {PublicSearchResultCard}=load('src/components/visitor/public-search-result-card.tsx',{...ui,'@/lib/public-navigation':{canNavigateToPublicRecord:()=>false}});
  const {GravesiteLocationCard}=load('src/components/visitor/gravesite-location-card.tsx',ui);
  const {MemorialProfile}=load('src/components/visitor/memorial-profile.tsx',{...ui,'./gravesite-location-card':{GravesiteLocationCard}});
  const resultCard=renderToStaticMarkup(React.createElement(PublicSearchResultCard,{record}));
  assert.match(resultCard,/Gravesite Reference<\/dt><dd>TEST 1<\/dd>/);
  assert.match(resultCard,new RegExp('/gravesite[?]id='+id));
  const profile=renderToStaticMarkup(React.createElement(MemorialProfile,{record,mapScope:'unavailable',shared:{state:'ready',items:[]},returnTo:'/results'}));
  assert.match(profile,/Gravesite Reference/);
  assert.match(profile,/TEST 1/);
  assert.match(profile,/Browse park map/);
  for(const html of [resultCard,profile]) assert.doesNotMatch(html,/Internal lot code|Synthetic plot reference|Get Directions/);
  const {MapExplorer}=load('src/components/visitor/map-explorer.tsx',{...ui,react:React,'next/dynamic':{__esModule:true,default:()=>()=>null},'@/lib/phase2-planning':{initialVisibility:{},layerDefinitions:[]},'./phase2-geographic-map':{PhaseTwoGeographicMap:()=>null},'./plot-coordinate-details':{PlotCoordinateDetails:()=>null},'./map-explorer.module.css':{__esModule:true,default:{}}});
  const html=renderToStaticMarkup(React.createElement(MapExplorer,{view:'geographic',destination:record,records:[record],requestedId:id}));
  assert.match(html,/Gravesite Reference: TEST 1/);
  assert.match(html,/Walking directions are unavailable/);
  assert.doesNotMatch(html,/Internal lot code|Synthetic plot reference|Get Directions/);
  const legacy={...record,syntheticPlotReference:null};
  const legacyCard=renderToStaticMarkup(React.createElement(PublicSearchResultCard,{record:legacy}));
  assert.match(legacyCard,/Lot TEST-EXISTING-CODE/);
  assert.doesNotMatch(legacyCard,/TEST 1|Internal lot code/);
 });
 await t.test('staff plot details use the bounded read projection under existing roles',async()=>{
  for(const actor of [gisActors.admin,gisActors.manager]){
   await gisLogin(db,actor);
   const page=await staff.getPlotManagementPage({query:'TEST-EXISTING-CODE',area:'all',state:'all',verification:'all',sort:'plot',direction:'asc',page:0,pageSize:20});
   assert.equal(page.items.length,1);assert.equal(page.items[0].syntheticPlotReference,'TEST 1');assert.equal(page.items[0].lotCode,'TEST-EXISTING-CODE');
   const syntheticPlots=load('src/lib/synthetic-plots.ts');
   const plotMap=load('src/lib/plot-map.ts',{'./synthetic-plots':syntheticPlots});
   const {PlotManagementList}=load('src/components/admin/plot-management-list.tsx',{'@/lib/plot-map':plotMap,'@/lib/synthetic-plots':syntheticPlots,'react/jsx-runtime':jsx,react:React,'react-dom':{createPortal:()=>null},'next/link':{__esModule:true,default:({children})=>jsx.jsx('a',{children})},'@/components/ui/icons':{Icon:()=>null},'@/components/ui/button':{Button:({children})=>jsx.jsx('button',{children})},'@/components/ui/empty-state':{EmptyState:()=>null},'@/components/ui/page-heading':{PageHeading:()=>null},'@/components/ui/skeleton':{Skeleton:()=>null}});
   const html=renderToStaticMarkup(React.createElement(PlotManagementList,{plots:page.items,total:page.total,summary:page.summary,areas:page.areas,queryState:{query:'',area:'all',state:'all',verification:'all',sort:'plot',direction:'asc',page:0,pageSize:20},loading:false,error:'',busy:false,canAdmin:actor===gisActors.admin}));
   assert.equal((html.match(/Synthetic plot reference: TEST 1/g)||[]).length,2,'desktop and mobile staff details retain the reference');
   assert.equal((html.match(/<strong>TEST-EXISTING-CODE<\/strong>/g)||[]).length,2,'desktop and mobile staff details retain the existing plot code');
  }
  const legacyStaff=load('src/lib/supabase/admin-data.ts',{'./config':{getBrowserSupabase:()=>({...client,rpc:(name,args)=>name==='staff_sample_plot_references'?Promise.resolve({data:null,error:{code:'PGRST202'}}):client.rpc(name,args)})},'./mutation-receipts':{}});
  const legacyPage=await legacyStaff.getPlotManagementPage({query:'TEST-EXISTING-CODE',area:'all',state:'all',verification:'all',sort:'plot',direction:'asc',page:0,pageSize:20});
  assert.equal(legacyPage.items.length,1);assert.equal(legacyPage.items[0].lotCode,'TEST-EXISTING-CODE');assert.equal(legacyPage.items[0].syntheticPlotReference,undefined);
  await gisLogin(db,gisActors.inactive);await assert.rejects(db.query('select public.staff_sample_plot_references($1)',[[lot.id]]),/active staff/);
  await gisLogin(db,null,'anon');await assert.rejects(db.query('select public.staff_sample_plot_references($1)',[[lot.id]]),/permission denied/);
 });
 await t.test('shared sample rows remain held by existing capacity rules',async()=>{
  await gisLogin(db);
  const second=f.dataset.interments.find(row=>row.source_key===f.dataset.interments[0].source_key&&row.sample_id!=='DEMO-INT-0001');assert.ok(second);
  const before=await result('select count(*)::int result from public.deceased');
  await assert.rejects(save('burial_record',{...prepared.plan.proposed_operations.burial_and_deceased_create.values,display_name:'Fictional Shared Sample',reference_no:second.sample_id,interment_order_number:second.sample_id}),/already has a burial record/);
  assert.equal(await result('select count(*)::int result from public.deceased'),before);
 });
 await t.test('eligibility guards still exclude private, pending, archived and removed records',async()=>{
  await gisLogin(db);
  for(const [index,patch]of [{public_display:false},{record_status:'pending'},{record_status:'archived'},{}].entries()){
   const other=await save('lot',{area_id:5,lot_code:'TEST-HIDDEN-'+index,status:'AVAILABLE'});
   const values={...prepared.plan.proposed_operations.burial_and_deceased_create.values,lot_id:other.id,display_name:'Fictional Hidden '+index,interment_order_number:'TEST-HIDDEN-'+index,reference_no:'TEST-HIDDEN-'+index,...patch};
   values.quality_notes=JSON.stringify({...JSON.parse(values.quality_notes),existing_lot_id:other.id});
   const created=await save('burial_record',values);
   if(index===3)await result("select public.staff_save_record('burial_record',$1,$2,'{}'::jsonb,$3,'delete') result",[created.id,created.revision,randomUUID()]);
  }
  await gisLogin(db,null,'anon');const page=await readers.searchPublicBurials({query:'TEST 1'});assert.equal(page.total,1);assert.equal(page.items[0].id,id);
 });
});


test('verified-coordinate pilot preserves every unapproved lot field', async t => {
 const {createTestDatabase}=await import('./database-helper.mjs');
 const {seedGisFixtures,gisLogin,gisActors}=await import('./gis-fixtures.mjs');
 const {randomUUID}=await import('node:crypto');
 const db=await createTestDatabase();t.after(()=>db.close());
 await seedGisFixtures(db);
 // Synthetic coordinates belong only to this isolated regression fixture.
 await db.exec(`insert into public.area(area_id,site_id,area_code,area_name,area_category,boundary_geom)
 values(5,1,'GUARD-TEST','Fictional guard garden','garden',extensions.st_geogfromtext('POLYGON((0 0,1 0,1 1,0 1,0 0))'));
 insert into public.sector(sector_id,area_id,sector_code,sector_name) values(2,5,'A','Fictional A');
 insert into public.block(block_id,sector_id,block_number) values(3,2,1);
 create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key);`);
 for(const v of REQUIRED_MIGRATIONS)await db.query('insert into supabase_migrations.schema_migrations values($1)',[v]);
 const f=fixture(),actor=f.bindings.project_sample_policy.actor_account_id;
 await db.query('insert into auth.users values($1)',[actor]);
 await db.query("insert into public.account(account_id,role_id,username,is_active,account_status,approved_at) select $1,role_id,'fictional-guard-admin',true,'ACTIVE',now() from public.role where role_name='ADMIN'",[actor]);
 await gisLogin(db,actor);
 const result=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.result;
 const save=(entity,values,{id=null,revision=null,operation='save',request=randomUUID()}={})=>result('select public.staff_save_record($1,$2,$3,$4::jsonb,$5,$6) result',[entity,id,revision,JSON.stringify(values),request,operation]);
 let lot=await save('lot',{area_id:5,block_id:3,lot_code:'TEST-EXISTING-CODE',status:'HOLD',location_geom:{type:'Point',coordinates:[0.5,0.5]}});
 lot=await save('lot',{status:'verified'},{...lot,operation:'review'});
 assert.equal(lot.revision,2);
 const lotRow=()=>result('select to_jsonb(l) result from public.lot l where lot_id=$1',[lot.id]);
 const before=await lotRow();assert.equal(before.coordinate_verified,true);assert.equal(before.coordinate_status,'verified');
 const permitted=['lot_owner_id','status','revision','updated_at'];
 const changed=(a,b)=>Object.keys(a).filter(key=>JSON.stringify(a[key])!==JSON.stringify(b[key])).sort();
 const guard=()=>`do $guard$ begin if (select to_jsonb(l)-array['lot_owner_id','status','revision','updated_at'] from public.lot l where lot_id=${lot.id}) is distinct from '${JSON.stringify(before).replaceAll("'","''")}'::jsonb-array['lot_owner_id','status','revision','updated_at'] then raise exception 'Unapproved target fields changed';end if;end $guard$;`;
 await db.exec('begin');
 const owner=await save('lot_owner',{first_name:'Fictional',last_name:'Owner',address:''});
 await db.exec('savepoint omitted_fields');
 await save('lot',{lot_code:before.lot_code,lot_owner_id:owner.id,status:'AVAILABLE'},lot);
 const broken=await lotRow();
 assert.deepEqual(changed(before,broken).filter(key=>!permitted.includes(key)),['coordinate_status','coordinate_verified']);
 assert.equal(broken.coordinate_status,'pending');assert.equal(broken.coordinate_verified,false);
 assert.equal(broken.revision,3);
 assert.deepEqual(changed(before,broken).filter(key=>permitted.includes(key)),permitted.toSorted());
 t.diagnostic('Original patch: coordinate_status verified -> pending; coordinate_verified true -> false. Revision, updated_at, status and lot_owner_id are the four approved/managed differences.');
 await assert.rejects(db.exec(guard()),/Unapproved target fields changed/);
 await db.exec('rollback');
 assert.deepEqual(await lotRow(),before,'the rejected update must roll back');
 Object.assign(f.snapshot.lot[0],{lot_id:lot.id,revision:lot.revision});
 Object.assign(f.preflight.lots[0],{lot_id:lot.id,revision:lot.revision,coordinate_verified:true,gis_plot_references:0,access_point_references:0,legacy_location_reference_present:false,legacy_pa_reference_present:false});
 Object.assign(f.bindings.lot_bindings[0],{expected_lot_id:lot.id,binding_kind:'NEW_SYNTHETIC_PROJECT_ASSIGNMENT',synthetic_assignment_approval_reference:'TEST ONLY'});
 const prepared=run(f);assert.equal(prepared.plan.ready_for_exact_approval,true);
 await gisLogin(db,actor,'postgres');
 const checked=prepared.sql.replace("\nselect jsonb_build_object('source_row_key'",'\n'+guard()+"\nselect jsonb_build_object('source_row_key'");
 await db.exec(checked);
 const after=await lotRow();assert.deepEqual(changed(before,after),permitted.toSorted());
 assert.equal(after.coordinate_verified,true);assert.equal(after.coordinate_status,'verified');
 assert.deepEqual(after.location_geom,before.location_geom);assert.equal(after.area_id,before.area_id);
 await db.exec(prepared.sql);
 assert.deepEqual(await lotRow(),after,'retry receipt must prevent a second lot update');
 await db.exec('begin');
 await save('lot',{lot_code:after.lot_code,area_id:after.area_id,location_geom:after.location_geom,width_m:1.25},{id:lot.id,revision:after.revision});
 await assert.rejects(db.exec(guard()),/Unapproved target fields changed/);
 await db.exec('rollback');
 assert.deepEqual(await lotRow(),after,'guard must still reject unrelated plot edits');
 await gisLogin(db,actor);
 await assert.rejects(save('lot',{lot_code:after.lot_code,status:'AVAILABLE'},{id:lot.id,revision:2}),/Another staff member/);
 assert.equal(await result('select count(*)::int result from public.burial_record where lot_id=$1',[lot.id]),1);
 assert.deepEqual((await result('select quality_notes::jsonb result from public.burial_record where lot_id=$1',[lot.id])).cad_candidate_id,prepared.plan.pilot.cad_candidate_id);
 await gisLogin(db,gisActors.manager);
 await assert.rejects(save('lot',{status:'verified'},{id:lot.id,revision:after.revision,operation:'review'}),/Only administrators/);
});
