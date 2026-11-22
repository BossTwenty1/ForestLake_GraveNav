// Synthetic data used only by automated tests. Never an application fallback.
const releaseId = "10000000-0000-4000-8000-000000000001";
const polygon = ring => ({ type: "Polygon", coordinates: [ring] });
const point = coordinates => ({ type: "Point", coordinates });
const line = coordinates => ({ type: "LineString", coordinates });
const feature = (id, geometry, properties) => ({ type: "Feature", id, geometry, properties: {sourceFeatureId:id,...properties} });
const policy = { releaseId, scopeRevision: 1, reviewReference: "test-only review",
  maxAccuracyM: 5, maxOffRouteM: 3, arrivalDistanceM: 8, maxFixAgeMs: 5000 };
function fixture() {
 const target = feature("test-plot", polygon([[123.00096,13.00002],[123.00104,13.00002],[123.00104,13.00008],[123.00096,13.00008],[123.00096,13.00002]]),
   {lotId:"3",areaId:"2",lotCode:"TEST-ONLY-SHARED"});
 const access = feature("test-access",point([123.001,13]),{lotId:"3",areaId:"2",nodeId:"12"});
 const data = { releaseId, scopeRevision:1, checkedAt:Date.now(), navigationPolicy:{...policy},
   target,accessPoint:access,destinationMessage:"Approved plot and reviewed walking access are available.",
   layers:{
    boundaries:[feature("test-boundary",polygon([[122.999,12.999],[123.002,12.999],[123.002,13.002],[122.999,13.002],[122.999,12.999]]),{kind:"area",areaId:"2"})],
    plots:[target],access_points:[access],
    nodes:[10,11,12].map((id,i)=>feature("test-node-"+id,point([123+i*0.0005,13]),{nodeId:String(id),name:"Test-only path node",nodeType:"junction"})),
    edges:[10,11].map((id,i)=>feature("test-edge-"+id,line([[123+i*0.0005,13],[123+(i+1)*0.0005,13]]),
      {edgeType:"path",edgeId:String(id),fromNodeId:String(id),toNodeId:String(id+1),direction:"both",forwardCostM:54.2,reverseCostM:54.2})),
    walkways:[feature("test-walkway",line([[123,13],[123.001,13]]),{areaId:"2",walkwayType:"path",walkingAllowed:true})],landmarks:[]
   }};
 const record = {id:"5",name:"Synthetic Navigation Person",plot:"TEST-ONLY-SHARED",plotLabel:"Plot TEST-ONLY-SHARED",
   section:"Synthetic Section",row:"Test row",dates:"1900 – 2000",coordinateStatus:"verified",locationVerified:true,
   location:{longitude:123.001,latitude:13.00005},status:"Active",burialDate:"Jan 1, 2026",tone:"result-media--lawn"};
 return {data,record,policy};
}
module.exports={fixture,policy,releaseId};
