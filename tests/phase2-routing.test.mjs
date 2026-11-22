import assert from "node:assert/strict";
import { test } from "node:test";
import { readNavigationPolicy, routePhaseTwo } from "../src/lib/phase2-routing.ts";
import { loadPhaseTwoGeography } from "../src/lib/phase2-geographic.ts";
import { fixture } from "./fixtures/phase2-navigation.cjs";

const now=Date.now();
const fix=(longitude=123,latitude=13,extra={})=>({longitude,latitude,accuracy:1,timestamp:now,...extra});
test("Phase 2 guidance requires a field-reviewed policy tied to the exact publication",()=>{
 const f=fixture();
 assert.equal(readNavigationPolicy(undefined,f.data),null);
 for(const changed of [{releaseId:"different"},{scopeRevision:2},{maxAccuracyM:0},{maxOffRouteM:NaN},{arrivalDistanceM:-1},{maxFixAgeMs:30001},{reviewReference:""}]) {
  assert.equal(readNavigationPolicy(JSON.stringify({...f.policy,...changed}),f.data),null);
 }
 const policy=readNavigationPolicy(JSON.stringify(f.policy),f.data);
 assert.equal(policy.maxAccuracyM,5);
 assert.equal("reviewReference" in policy,false,"Private evidence reference stays server-side");
 f.data.navigationPolicy=null;
 assert.equal(routePhaseTwo(f.data,fix(),now).state,"policy_unavailable");
});

test("Remaining distance follows exact reviewed edge geometry and decreases with movement",()=>{
 const {data}=fixture();
 const start=routePhaseTwo(data,fix(),now);
 const middle=routePhaseTwo(data,fix(123.0005),now);
 assert.equal(start.state,"ready");assert.equal(middle.state,"ready");
 assert.ok(Math.abs(start.distanceM-108.4)<0.01);
 assert.ok(Math.abs(middle.distanceM-54.2)<0.01);
 assert.deepEqual(start.coordinates,[[123,13],[123.0005,13],[123.001,13]]);
 assert.deepEqual(start.coordinates.at(-1),data.accessPoint.geometry.coordinates);
 assert.notDeepEqual(start.coordinates.at(-1),[123.001,13.00005],"Never draw a final connector through the grave");
});
test("Edge snapping starts on the path, with no GPS-to-path connector",()=>{
 const {data}=fixture();
 const result=routePhaseTwo(data,fix(123.00025,13.000005),now);
 assert.equal(result.state,"ready");
 assert.equal(result.coordinates[0][1],13);
 assert.ok(result.distanceM>80&&result.distanceM<82);
});
test("One-way routes never use a forbidden reverse traversal",()=>{
 const {data}=fixture();
 const edge=data.layers.edges[1];
 edge.properties.direction="reverse";edge.properties.forwardCostM=null;
 assert.equal(routePhaseTwo(data,fix(123.0005),now).state,"unreachable");
 edge.properties.direction="forward";edge.properties.forwardCostM=54.2;edge.properties.reverseCostM=null;
 assert.equal(routePhaseTwo(data,fix(123.0005),now).state,"ready");
});
test("GPS quality, freshness, bounds and grave interiors gate guidance",()=>{
 const {data}=fixture();
 for(const [reading,state] of [[null,"location_unavailable"],[fix(123,13,{timestamp:now-6000}),"stale"],
  [fix(123,13,{accuracy:20}),"inaccurate"],[fix(124,14),"outside"],
  [fix(123.0004,13.0002),"off_route"],[fix(123.001,13.00005),"off_route"],
  [fix(NaN,13),"location_unavailable"],[fix(123,13,{timestamp:now+2000}),"stale"]]) {
  const result=routePhaseTwo(data,reading,now);assert.equal(result.state,state);assert.deepEqual(result.coordinates,[]);
 }
});
test("Arrival requires a reachable access endpoint and accuracy inside the reviewed arrival radius",()=>{
 const {data}=fixture();
 assert.equal(routePhaseTwo(data,fix(123.001),now).state,"arrived");
 data.navigationPolicy.arrivalDistanceM=0.5;
 assert.equal(routePhaseTwo(data,fix(123.001),now).state,"ready");
 data.layers.edges=[];
 assert.equal(routePhaseTwo(data,fix(123.001),now).state,"no_network");
});
test("Missing, malformed and unreviewed route data never authorizes a fallback",()=>{
 for(const change of [
  d=>{d.target=null;},d=>{d.accessPoint=null;},d=>{d.layers.nodes=[];},d=>{d.layers.edges=[];},
  d=>{d.layers.edges[0].properties.walkingAllowed=false;},
  d=>{d.layers.edges[0].properties.isRestricted=true;},
  d=>{d.layers.edges[0].geometry.coordinates[0]=[123.00001,13];},
  d=>{d.layers.edges[0].properties.forwardCostM=null;},
  d=>{d.accessPoint.properties.nodeId="unrelated";},
  d=>{d.accessPoint.properties.lotId="unrelated";},
  d=>{d.navigationPolicy.releaseId="old";},
 ]) {const {data}=fixture();change(data);const result=routePhaseTwo(data,fix(),now);assert.deepEqual(result.coordinates,[]);assert.equal(result.distanceM,null);}
});
test("A polygon hole is outside permitted mapping coverage",()=>{
 const {data}=fixture();
 data.layers.boundaries[0].geometry.coordinates.push([[122.9999,12.9999],[123.0001,12.9999],[123.0001,13.0001],[122.9999,13.0001],[122.9999,12.9999]]);
 assert.equal(routePhaseTwo(data,fix(),now).state,"outside");
});
test("Two public deceased records resolve to one physical polygon and access endpoint",async()=>{
 const {data,record}=fixture();
 const reader={layer:async args=>({schemaVersion:1,releaseId:data.releaseId,scopeRevision:1,layer:args.layer,page:args.page,pageSize:200,
  total:data.layers[args.layer].length,totalPages:Math.ceil(data.layers[args.layer].length/200),features:data.layers[args.layer]}),
  burial:async id=>({burialId:id,lotId:"3",areaId:"2",lotCode:record.plot,releaseId:data.releaseId,geometryReady:true,routingReady:true,
   plotGeometry:data.target.geometry,accessPoint:data.accessPoint.geometry})};
 const first=await loadPhaseTwoGeography(reader,{siteId:"1",areaId:"2"},record);
 const second=await loadPhaseTwoGeography(reader,{siteId:"1",areaId:"2"},{...record,id:"6"});
 assert.deepEqual(first.data.target,second.data.target);
 assert.deepEqual(first.data.accessPoint,second.data.accessPoint);
});

test("An approved access point on the outer mapping boundary remains eligible",()=>{
 const {data}=fixture();
 data.layers.boundaries[0].geometry.coordinates=[[[122.999,12.999],[123.001,12.999],[123.001,13.002],[122.999,13.002],[122.999,12.999]]];
 assert.equal(routePhaseTwo(data,fix(123.001),now).state,"arrived");
});

test("Multi-release navigation policy array selects only the unique matching release and revision", () => {
 const { data, policy } = fixture();
 const otherPolicy = { ...policy, releaseId: "10000000-0000-4000-8000-000000000002", scopeRevision: 2 };
 const selected = readNavigationPolicy(JSON.stringify([otherPolicy, policy]), data);
 assert.equal(selected?.releaseId, data.releaseId);
 assert.equal(selected?.scopeRevision, data.scopeRevision);
 assert.equal(readNavigationPolicy(JSON.stringify([policy, policy]), data), null);
 assert.equal(readNavigationPolicy(JSON.stringify([otherPolicy]), data), null);
});
