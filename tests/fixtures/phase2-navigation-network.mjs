// Test-only transport isolation for actual Next.js browser acceptance. Never imported by the app.
import {readFileSync} from "node:fs";
import {fixture,policy} from "./phase2-navigation.cjs";
if(process.env.GRAVENAV_TEST_NETWORK_ISOLATION!=="1") throw Error("Test transport requires explicit isolation");
const state=()=>{try{return JSON.parse(readFileSync(process.env.GRAVENAV_TEST_FIXTURE_STATE,"utf8"));}catch{return {};}};
const original=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);
 if(!url.pathname.startsWith("/rest/v1/")){
  if(["127.0.0.1","localhost"].includes(url.hostname))return original(input,init);
  return new Response("isolated",{status:503});
 }
 const current=state(), f=fixture();
 process.env.GRAVENAV_PHASE2_NAVIGATION_POLICY=current.policyMissing?"":JSON.stringify(policy);
 if(current.serviceDown)return Response.json({message:"isolated unavailable service"},{status:503});
 if(current.networkMissing)f.data.layers.edges=[];
 if(current.unverified)f.record.coordinateStatus="pending";
 const body=init?.body?JSON.parse(String(init.body)):input instanceof Request&&input.method!=="GET"?await input.clone().json():{};
 const id=String(body.p_burial_id||url.searchParams.get("burial_id")?.replace("eq.","")||"");
 const rows=["5","6"].map((burial_id,index)=>({
  burial_id:Number(burial_id),display_name:"Synthetic Navigation Person "+(index+1),birth_date:"1900-01-01",death_date:"2000-01-01",
  interment_date:"2026-01-01",record_status:"active",lot_code:f.record.plot,area_name:"Synthetic Section",sector_name:null,
  block_number:null,location_geom:{type:"Point",coordinates:[123.001,13.00005]},px_loc_x:null,px_loc_y:null,
  location_verified:!current.unverified,coordinate_status:current.unverified?"pending":"verified",match_type:"exact"
 }));
 const endpoint=url.pathname.split("/").at(-1);
 if(endpoint==="search_public_burials"){
  const term=(body.p_query||"").toLowerCase();
  const items=rows.filter(row=>!term||row.display_name.toLowerCase().includes(term)||row.lot_code.toLowerCase().includes(term));
  return Response.json({items,total:items.length});
 }
 if(endpoint==="public_burial_records"){
  if(url.searchParams.get("select")==="area_name"){
   const after=url.searchParams.getAll("area_name").find(value=>value.startsWith("gt."))?.slice(3);
   return Response.json(rows.filter(row=>after===undefined||row.area_name>after).map(({area_name})=>({area_name})));
  }
  return Response.json(id?rows.filter(row=>String(row.burial_id)===id):rows);
 }
 if(endpoint==="public_shared_plot_burials"){
  if(current.rosterFailure)return Response.json({message:"synthetic unavailable RPC"},{status:503});
  return Response.json(rows.filter(row=>String(row.burial_id)!==id).map(row=>({id:String(row.burial_id),name:row.display_name})));
 }
 if(endpoint==="public_burial_gis"){
  if(!["5","6"].includes(id)||current.unmapped)return Response.json(null);
  return Response.json({schemaVersion:1,burialId:id,lotId:"3",lotCode:f.record.plot,areaId:"2",
   releaseId:f.data.releaseId,geometryReady:true,routingReady:true,reason:null,plotGeometry:f.data.target.geometry,accessPoint:f.data.accessPoint.geometry});
 }
 if(endpoint==="public_mapping_layer"){
  const layer=body.p_layer, features=f.data.layers[layer]||[];
  return Response.json({schemaVersion:1,releaseId:f.data.releaseId,scopeRevision:current.publicationChanged?2:1,
   layer,page:body.p_page||1,pageSize:body.p_page_size||200,total:features.length,totalPages:Math.ceil(features.length/(body.p_page_size||200)),features});
 }
 return Response.json({message:"No test fixture for this operation"},{status:503});
};
