import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { loadPhaseTwoGeography, phaseTwoScope } from "../src/lib/phase2-geographic.ts";

// Explicitly synthetic coordinates and identifiers, confined to this unit-test file.
const release = "10000000-0000-4000-8000-000000000001";
const polygon = { type: "Polygon", coordinates: [[[123,13],[123.001,13],[123.001,13.001],[123,13]]] };
const point = { type: "Point", coordinates: [123,13] };
const feature = (id, geometry, properties) => ({ type: "Feature", id, geometry, properties });
const scope = { siteId: "1", areaId: "2" };
function fixture() {
  const data = { boundaries: [feature("b",polygon,{kind:"area",areaId:"2"})],
    plots: [feature("p",polygon,{lotId:"3",areaId:"2",lotCode:"TEST-ONLY"})],
    access_points: [feature("a",point,{lotId:"3",areaId:"2",nodeId:"4"})],
    nodes: [feature("n",point,{nodeId:"4"})], edges:[], walkways:[], landmarks:[] };
  const association = { burialId:"5", lotId:"3", lotCode:"TEST-ONLY", areaId:"2", releaseId:release,
    geometryReady:true,routingReady:true,reason:null,plotGeometry:polygon,accessPoint:point };
  const record = { id:"5",plot:"TEST-ONLY",locationVerified:true,coordinateStatus:"verified" };
  const calls=[];
  const reader = {
    async layer(args) {
      calls.push(args);
      const rows=data[args.layer];
      return {schemaVersion:1,releaseId:release,scopeRevision:1,layer:args.layer,page:args.page,pageSize:200,
        total:rows.length,totalPages:Math.ceil(rows.length/200),features:rows.slice((args.page-1)*200,args.page*200)};
    },
    async burial() { return association; },
  };
  return {data,association,record,reader,calls};
}
test("Phase 2 needs explicit positive site and area identities", async()=>{
  assert.equal(phaseTwoScope(),null);
  assert.equal(phaseTwoScope("1","bad"),null);
  const f=fixture();
  assert.equal((await loadPhaseTwoGeography(f.reader,null)).state,"scope_unavailable");
  assert.equal(f.calls.length,0);
});
test("No publication returns no geometry and no Phase 1 fallback",async()=>{
  const f=fixture();
  f.reader.layer=async args=>({releaseId:null,scopeRevision:0,layer:args.layer,page:1,pageSize:200,total:0,totalPages:0,features:[]});
  assert.equal((await loadPhaseTwoGeography(f.reader,scope)).state,"no_published_release");
});
test("A verified public record resolves only its exact approved operational lot",async()=>{
  const f=fixture();
  const result=await loadPhaseTwoGeography(f.reader,scope,f.record);
  assert.equal(result.state,"ready");
  assert.equal(result.data.target.id,"p");
  assert.equal(result.data.accessPoint.id,"a");
  assert(f.calls.slice(1).every(args=>args.expectedReleaseId===release));
});
for(const [label,change] of [
  ["private or removed burial",f=>{f.reader.burial=async()=>null;}],
  ["wrong burial ID",f=>{f.association.burialId="99";}],
  ["wrong area",f=>{f.association.areaId="1";}],
  ["wrong lot",f=>{f.association.lotId="99";}],
  ["wrong official code",f=>{f.association.lotCode="OTHER";}],
  ["unapproved geometry",f=>{f.association.geometryReady=false;}],
  ["mismatched geometry",f=>{f.association.plotGeometry=null;}],
  ["mixed release",f=>{f.association.releaseId="different";}],
  ["missing boundary",f=>{f.data.boundaries=[];}],
  ["Cartesian coordinates",f=>{f.data.plots[0].geometry={type:"Polygon",coordinates:[[[500,400],[501,400],[500,401],[500,400]]]};}],
  ["duplicate lot",f=>{f.data.plots.push({...f.data.plots[0],id:"second"});}],
]) test("Reject "+label,async()=>{
  const f=fixture();change(f);
  const result=await loadPhaseTwoGeography(f.reader,scope,f.record);
  assert.equal(result.state,"unavailable");
  assert.equal(result.data,null);
});
test("Pending or rejected coordinates do not become a verified target",async()=>{
  for(const coordinateStatus of ["pending","rejected"]) {
    const f=fixture();f.record.coordinateStatus=coordinateStatus;
    const result=await loadPhaseTwoGeography(f.reader,scope,f.record);
    assert.equal(result.data.target,null);
    assert.equal(result.data.accessPoint,null);
    assert.match(result.data.destinationMessage,/review is incomplete/);
  }
});
test("Missing or unreviewed access never produces an access endpoint",async()=>{
  for(const change of [f=>{f.data.access_points=[];},f=>{f.association.routingReady=false;},f=>{f.data.nodes=[];}]) {
    const f=fixture();change(f);
    const result=await loadPhaseTwoGeography(f.reader,scope,f.record);
    assert.equal(result.data.target.id,"p");
    assert.equal(result.data.accessPoint,null);
  }
});
test("Read failure and selector revision change discard the snapshot",async()=>{
  const f=fixture();const read=f.reader.layer;
  f.reader.layer=async args=>({...await read(args),scopeRevision:f.calls.length>1?2:1});
  assert.equal((await loadPhaseTwoGeography(f.reader,scope)).data,null);
  f.reader.layer=async()=>{throw Error("private details");};
  assert.doesNotMatch((await loadPhaseTwoGeography(f.reader,scope)).message,/private details/);
});
test("Pagination is complete and fenced to the same publication",async()=>{
  const f=fixture();
  f.data.plots=Array.from({length:201},(_,i)=>feature("p"+i,polygon,{lotId:String(i+1),areaId:"2",lotCode:"T"+i}));
  assert.equal((await loadPhaseTwoGeography(f.reader,scope)).data.layers.plots.length,201);
  assert(f.calls.some(call=>call.layer==="plots" && call.page===2 && call.expectedReleaseId===release));
  const read=f.reader.layer;f.reader.layer=async args=>({...await read(args),totalPages:3});
  assert.equal((await loadPhaseTwoGeography(f.reader,scope)).data,null);
});
test("Directions remain disabled and use no Phase 1 GPS thresholds",async()=>{
  const page=await readFile(new URL("../src/app/phase2-map/page.tsx",import.meta.url),"utf8");
  assert.match(page,/disabled>Phase 2 directions unavailable/);
  const adapter=await readFile(new URL("../src/lib/phase2-geographic.ts",import.meta.url),"utf8");
  assert.doesNotMatch(adapter,/phase1|nearPlot|nearestNode|mock-data|CRS.Simple/);
});
