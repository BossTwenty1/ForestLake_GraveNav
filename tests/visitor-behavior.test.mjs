import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function load(file, dependencies = {}) {
  const source = readFileSync(
    new URL("../" + file, import.meta.url),
    "utf8",
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const loadedModule = { exports: {} };

  new Function("require", "module", "exports", output)(
    (name) => {
      if (!(name in dependencies)) {
        throw Error("Unexpected dependency " + name);
      }
      return dependencies[name];
    },
    loadedModule,
    loadedModule.exports,
  );

  return loadedModule.exports;
}

const geo = load("src/lib/navigation-geo.ts");
const publicNavigation = load("src/lib/public-navigation.ts", {
  "@/lib/supabase/types": {},
});

test(
  "public navigation requires a present and explicitly verified coordinate",
  () => {
    const location = { longitude: 123.7, latitude: 13.1 };

    assert.equal(
      publicNavigation.canNavigateToPublicRecord({
        location,
        locationVerified: true,
        coordinateStatus: "verified",
      }),
      true,
    );
    assert.equal(
      publicNavigation.canNavigateToPublicRecord({
        location,
        locationVerified: false,
        coordinateStatus: "verified",
      }),
      false,
    );
    assert.equal(
      publicNavigation.canNavigateToPublicRecord({
        location,
        locationVerified: true,
        coordinateStatus: "pending",
      }),
      false,
    );
    assert.equal(
      publicNavigation.canNavigateToPublicRecord({
        location: null,
        locationVerified: true,
        coordinateStatus: "verified",
      }),
      false,
    );
  },
);

test(
  "live location emits updates, propagates denial, and stops even when watch id is zero",
  () => {
    let success;
    let fail;
    let cleared;
    const positions = [];
    const errors = [];
    const stop = geo.subscribeToLocation(
      {
        watchPosition(onSuccess, onError, options) {
          success = onSuccess;
          fail = onError;
          assert.equal(options.enableHighAccuracy, true);
          return 0;
        },
        clearWatch(id) {
          cleared = id;
        },
      },
      (position) => positions.push(position),
      (error) => errors.push(error),
    );
    const reading = {
      coords: { longitude: 123, latitude: 13, accuracy: 4 },
      timestamp: Date.now(),
    };

    success(reading);
    success({
      ...reading,
      coords: { ...reading.coords, latitude: 13.001 },
    });
    fail({ code: 1 });

    assert.equal(positions.length, 2);
    assert.equal(errors[0].code, 1);

    stop();
    success(reading);
    fail({ code: 2 });

    assert.equal(cleared, 0);
    assert.equal(positions.length, 2);
    assert.equal(errors.length, 1);
  },
);

test(
  "arrival language is gated by fresh, sufficiently accurate nearby readings",
  () => {
    const now = Date.now();
    const destination = { longitude: 123, latitude: 13 };
    const position = { ...destination, accuracy: 4, timestamp: now };

    assert.equal(geo.nearPlot(position, destination, now), true);
    assert.equal(
      geo.nearPlot({ ...position, accuracy: 80 }, destination, now),
      false,
    );
    assert.equal(
      geo.nearPlot(
        { ...position, timestamp: now - 31000 },
        destination,
        now,
      ),
      false,
    );
    assert.equal(
      geo.nearPlot(
        { ...position, latitude: 13.01 },
        destination,
        now,
      ),
      false,
    );
    assert.equal(
      geo.usablePosition({ ...position, longitude: NaN }, now),
      false,
    );
  },
);

const mapModule = load("src/lib/phase1-map-data.ts", {
  "@/lib/map-layout": {
    schematicImageWidth: 100,
    schematicImageHeight: 100,
  },
  "@/lib/supabase/config": {},
});
const routing = load("src/lib/phase1-routing.ts", {
  "@/lib/phase1-map-data": mapModule,
});

test(
  "route recalculates from new positions and ends on the path, with recorded landmarks only",
  () => {
    const map = {
      geographicBounds: {
        minLongitude: 0,
        minLatitude: 0,
        maxLongitude: 1,
        maxLatitude: 1,
      },
      nodes: [
        {
          properties: {
            id: "a",
            name: "Main entrance",
            node_type: "entrance",
          },
          schematicPosition: [0, 0],
        },
        {
          properties: {
            id: "b",
            name: "Recorded landmark",
            node_type: "landmark",
          },
          schematicPosition: [0, 40],
        },
        {
          properties: {
            id: "c",
            name: "Path end",
            node_type: "junction",
          },
          schematicPosition: [0, 80],
        },
      ],
      edges: {
        features: [
          {
            properties: {
              from_node_id: "a",
              to_node_id: "b",
              distance_m: 40,
            },
            geometry: { coordinates: [[0, 0], [40, 0]] },
          },
          {
            properties: {
              from_node_id: "b",
              to_node_id: "c",
              distance_m: 40,
            },
            geometry: { coordinates: [[40, 0], [80, 0]] },
          },
        ],
      },
    };
    const destination = { longitude: 0.9, latitude: 0.1 };
    const first = routing.findShortestPhaseOneRoute(map, destination);
    const walked = routing.findShortestPhaseOneRoute(map, destination, {
      longitude: 0.4,
      latitude: 0,
    });

    assert.equal(first.distanceM, 80);
    assert.equal(walked.distanceM, 40);
    assert.deepEqual(first.coordinates.at(-1), [0, 80]);
    assert.ok(
      first.instructions.some((instruction) =>
        instruction.includes("Recorded landmark"),
      ),
    );

    map.edges.features[1].properties.is_restricted = true;
    const restricted = routing.findShortestPhaseOneRoute(
      map,
      destination,
    );

    assert.deepEqual(restricted.coordinates.at(-1), [0, 40]);
    assert.equal(
      routing.findShortestPhaseOneRoute(map, destination, {
        longitude: 5,
        latitude: 5,
      }),
      null,
    );
  },
);

function publicModule(response) {
  const query = {
    select() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return Promise.resolve(response);
    },
    eq() {
      return this;
    },
    maybeSingle() {
      return Promise.resolve(response);
    },
  };

  return load("src/lib/supabase/public-data.ts", {
    "./config": {
      getPublicSupabase: () => ({
        from: () => query,
        rpc: async () => response,
      }),
      localSupabaseConfig: { environment: "hosted" },
    },
    "@/lib/mock-data": {},
    "@/lib/map-layout": { phaseOneGardenNames: [] },
  });
}

test("database errors are distinct from a successful empty search", async () => {
  await assert.rejects(
    publicModule({
      data: null,
      error: { message: "private database details" },
    }).searchPublicBurials({ query: "Maria" }),
    /temporarily unavailable/,
  );

  const result = await publicModule({
    data: { items: [], total: 0 },
    error: null,
  }).searchPublicBurials();

  assert.equal(result.total, 0);
  assert.deepEqual(result.items, []);

  await assert.rejects(
    publicModule({
      data: null,
      error: {},
    }).getPublicBurialRecord("1"),
    /temporarily unavailable/,
  );
});

test("garden choices skip repeated burial rows and keep later public names", async () => {
  const rows = ["", "   ", ...Array(160).fill("Butterfly Palm Garden"),
    ...Array(120).fill("Majestic Palm Court C"), "Majestic Palm Garden", null];
  const requestedCursors = [];
  let failureAt;
  const reader = load("src/lib/supabase/public-data.ts", {
    "./config": { getPublicSupabase: () => ({
      from(view) {
        assert.equal(view, "public_burial_records");
        let after;
        let limit;
        return {
          select(column) { assert.equal(column, "area_name"); return this; },
          not(column, operator, value) {
            assert.deepEqual([column, operator, value], ["area_name", "is", null]);
            return this;
          },
          order(column) { assert.equal(column, "area_name"); return this; },
          limit(size) { limit = size; return this; },
          gt(column, value) { assert.equal(column, "area_name"); after = value; return this; },
          then(resolve) {
            requestedCursors.push(after);
            const data = rows.filter(name => name !== null && (after === undefined || name > after))
              .slice(0, Math.min(limit, 50)).map(area_name => ({ area_name }));
            resolve(after !== undefined && after === failureAt
              ? { data: null, error: { message: "test-only connection failure" } }
              : { data, error: null });
          },
        };
      },
    }) },
  });
  assert.deepEqual(await reader.getPublicGardenNames(), [
    "Butterfly Palm Garden", "Majestic Palm Court C", "Majestic Palm Garden",
  ]);
  assert.deepEqual(requestedCursors, [
    undefined, "Butterfly Palm Garden", "Majestic Palm Court C", "Majestic Palm Garden",
  ]);
  failureAt = "Butterfly Palm Garden";
  await assert.rejects(reader.getPublicGardenNames(), /temporarily unavailable/);
});

test("public burial dates use interment dates, never death dates", async () => {
  const row = {
    burial_id: 1,
    display_name: "Test",
    death_date: "2020-01-01",
    birth_date: null,
    lot_code: "A",
    interment_date: "2020-01-05",
  };
  const record = await publicModule({
    data: row,
    error: null,
  }).getPublicBurialRecord("1");

  assert.equal(
    record.burialDate.includes("05") ||
      record.burialDate.includes("5,"),
    true,
  );

  const missing = await publicModule({
    data: { ...row, interment_date: null },
    error: null,
  }).getPublicBurialRecord("1");

  assert.equal(missing.burialDate, "Not recorded");
});

test(
  "public navigation eligibility preserves the real coordinate review state",
  async () => {
    const point = {
      type: "Point",
      coordinates: [123.7, 13.1],
    };
    const verified = await publicModule({
      data: {
        burial_id: 1,
        display_name: "Test",
        lot_code: "A",
        location_geom: point,
        location_verified: true,
        coordinate_status: "verified",
      },
      error: null,
    }).getPublicBurialRecord("1");
    const rejected = await publicModule({
      data: {
        burial_id: 1,
        display_name: "Test",
        lot_code: "A",
        location_geom: point,
        location_verified: false,
        coordinate_status: "rejected",
      },
      error: null,
    }).getPublicBurialRecord("1");
    const missing = await publicModule({
      data: {
        burial_id: 1,
        display_name: "Test",
        lot_code: "A",
        location_geom: null,
        location_verified: true,
        coordinate_status: "verified",
      },
      error: null,
    }).getPublicBurialRecord("1");

    assert.equal(verified.coordinateStatus, "verified");
    assert.equal(verified.locationVerified, true);
    assert.equal(rejected.coordinateStatus, "rejected");
    assert.equal(rejected.locationVerified, false);
    assert.equal(missing.coordinateStatus, "missing");
    assert.equal(missing.locationVerified, false);
  },
);

test("Unconfigured public readers never substitute fictional records", async () => {
  const local = load("src/lib/supabase/public-data.ts", { "./config": {getPublicSupabase:()=>null} });
  await assert.rejects(local.getPublicBurialRecord("5"), /temporarily unavailable/);
  await assert.rejects(local.searchPublicBurials({query:"anything"}), /temporarily unavailable/);
  await assert.rejects(local.getPublicBurialRecordByPlot("anything"), /temporarily unavailable/);
  assert.deepEqual(await local.getPublicGardenNames(),[]);
  assert.equal(await publicModule({data:null,error:{}}).getPublicBurialRecord("not-an-id"),null);
});

test("Shared-grave roster distinguishes unavailable, malformed, empty and authorized results",async()=>{
  let response={data:null,error:{code:"PGRST202"}};
  const reader=load("src/lib/supabase/public-data.ts",{"./config":{getPublicSupabase:()=>({rpc:async()=>response})}});
  assert.deepEqual(await reader.getPublicSharedPlotBurials("5"),{state:"unavailable",items:[]});
  response={data:[],error:null};
  assert.deepEqual(await reader.getPublicSharedPlotBurials("5"),{state:"ready",items:[]});
  response={data:[{id:"6",name:"Synthetic eligible person"}],error:null};
  assert.deepEqual(await reader.getPublicSharedPlotBurials("5"),{state:"ready",items:response.data});
  response={data:[{id:"6",name:"Synthetic eligible person",restrictedNote:"test-only restricted detail"}],error:null};
  assert.deepEqual((await reader.getPublicSharedPlotBurials("5")).items,[{id:"6",name:"Synthetic eligible person"}]);
  response={data:[{id:"bad",name:"Synthetic malformed person"}],error:null};
  assert.equal((await reader.getPublicSharedPlotBurials("5")).state,"unavailable");
  assert.equal((await reader.getPublicSharedPlotBurials("unsafe")).state,"unavailable");
});

test("walking steps follow the approved route geometry and disappear when guidance pauses", () => {
  const { walkingSteps } = load("src/lib/phase2-routing.ts", { "./navigation-geo.ts": geo });
  const coordinates = [[123, 13], [123.0005, 13], [123.0005, 12.9995]];
  const steps = walkingSteps({ state: "ready", coordinates, distanceM: 110 });
  assert.deepEqual(steps.map(step => step.instruction), [
    "Follow the highlighted path", "Turn right along the path", "Approach the gravesite and check the marker",
  ]);
  assert(steps[0].distanceM > 50 && steps[1].distanceM > 50);
  assert.deepEqual(walkingSteps({ state: "off_route", coordinates, distanceM: null }), []);
  assert.deepEqual(walkingSteps({ state: "arrived", coordinates, distanceM: 0 }), []);
});

test("entrance route preview computes shortest reviewed path without requiring live GPS", () => {
  const { routePhaseTwoFromEntrance } = load("src/lib/phase2-routing.ts", { "./navigation-geo.ts": geo });
  const data = {
    releaseId: "rel-1",
    scopeRevision: 1,
    target: { id: "plot-1", geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }, properties: { lotId: "10" } },
    accessPoint: { id: "ap-1", geometry: { type: "Point", coordinates: [123.001, 13] }, properties: { lotId: "10", nodeId: "n2" } },
    layers: {
      boundaries: [], plots: [], access_points: [], walkways: [], landmarks: [],
      nodes: [
        { id: "node-1", geometry: { type: "Point", coordinates: [123, 13] }, properties: { nodeId: "n1", nodeType: "main_entrance" } },
        { id: "node-2", geometry: { type: "Point", coordinates: [123.001, 13] }, properties: { nodeId: "n2", nodeType: "access" } },
      ],
      edges: [
        {
          id: "edge-1",
          geometry: { type: "LineString", coordinates: [[123, 13], [123.001, 13]] },
          properties: { fromNodeId: "n1", toNodeId: "n2", direction: "both", forwardCostM: 108, reverseCostM: 108, walkingAllowed: true, isRestricted: false },
        },
      ],
    },
  };
  const route = routePhaseTwoFromEntrance(data);
  assert.equal(route.state, "ready");
  assert.equal(route.distanceM, 108);
  assert.deepEqual(route.coordinates, [[123, 13], [123.001, 13]]);
});

test("park layout walkway router builds a single path from entrance landmark to target plot", () => {
  const planning = load("src/lib/phase2-planning.ts", { "./phase2-cad-details": {}, "./phase2-plot-coordinates": {} });
  const layoutRouter = load("src/lib/phase2-layout-routing.ts", {
    "./park-details": { PARK_NAME: "Forest Lake Memorial Park - Legazpi", PARK_ADDRESS: "Legazpi City" },
    "./phase2-planning": planning,
  });
  const bundle = {
    data: {
      layers: {
        roads: [{ id: "roads:1", shape: { kind: "line", positions: [[0, 0], [0, 20], [20, 20]] } }],
        paths: [{ id: "paths:1", shape: { kind: "line", positions: [[20, 20], [20, 40]] } }],
      },
    },
    places: { landmarks: [{ id: "185B", name: "Guard House", kind: "facility", cadXY: [0, 0] }] },
    details: { labels: [] },
  };
  const graph = layoutRouter.buildLayoutWalkwayGraph(bundle);
  const starts = layoutRouter.layoutStartPoints(bundle);
  assert.equal(starts[0].label, "Main Entrance (Guard House)");
  const route = layoutRouter.routeOnParkLayout(graph, starts[0], { id: "lawn:1", bounds: [21, 39, 23, 41] });
  assert.ok(route);
  assert.ok(route.path.length >= 2);
  assert.equal(route.approach.length, 2);
  assert.ok(route.steps.some(step => /Guard House/.test(step.instruction)));
  assert.ok(route.steps.at(-1).instruction.includes("check the grave marker"));
});

test("weighted A* shortest path avoids steep slope protection zones, takes flat shortcuts, and honors paved mode", () => {
  const planning = load("src/lib/phase2-planning.ts", { "./phase2-cad-details": {}, "./phase2-plot-coordinates": {} });
  const layoutRouter = load("src/lib/phase2-layout-routing.ts", {
    "./park-details": { PARK_NAME: "Forest Lake Memorial Park - Legazpi", PARK_ADDRESS: "Legazpi City" },
    "./phase2-planning": planning,
  });
  const boundary = {
    id: "boundary:1",
    shape: { kind: "polygon", positions: [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]] },
  };
  // Steep slope wall blocking the center (x=40..60, y=0..65), leaving flat ground above y=65.
  const slopeZone = {
    id: "context:slope1",
    properties: { effective_layer: "[SDP] Slope Protection" },
    shape: { kind: "polygon", positions: [[[40, 0], [60, 0], [60, 65], [40, 65], [40, 0]]] },
  };
  // Paved U-shaped road going all the way around y=90.
  const bundle = {
    data: {
      bounds: [0, 0, 100, 100],
      layers: {
        boundary: [boundary],
        roads: [
          { id: "roads:1", shape: { kind: "line", positions: [[10, 20], [10, 90], [90, 90], [90, 20]] } },
        ],
        paths: [],
        blocks: [],
        context: [slopeZone],
      },
    },
    places: { landmarks: [{ id: "185B", name: "Guard House", kind: "facility", cadXY: [10, 20] }] },
    details: { labels: [] },
  };

  const graph = layoutRouter.buildLayoutWalkwayGraph(bundle);
  const start = { id: "start", label: "Start", position: [10, 20] };
  const target = { id: "lawn:99", bounds: [86, 20, 90, 24] };

  const shortest = layoutRouter.routeOnParkLayout(graph, start, target, { mode: "shortest" });
  const paved = layoutRouter.routeOnParkLayout(graph, start, target, { mode: "paved" });
  assert.ok(shortest && paved);
  assert.equal(shortest.mode, "shortest");
  assert.equal(paved.mode, "paved");

  // Shortest mode should cut across the flat ground above y=65 instead of detouring all the way to y=90.
  assert.ok(shortest.distanceMeters < paved.distanceMeters, `expected shortest (${shortest.distanceMeters}m) < paved (${paved.distanceMeters}m)`);

  // Neither mode may enter the steep slope protection rectangle [40..60, 0..65].
  for (const route of [shortest, paved]) {
    for (const [x, y] of route.path) {
      assert.equal(x > 40 && x < 60 && y > 0 && y < 65, false, `Point [${x}, ${y}] entered steep slope zone`);
    }
  }

  // When already close on flat, obstacle-free ground (< 40m), shortest mode takes a direct local approach.
  const nearbyStart = { id: "live-gps", label: "Your current location", position: [74, 22] };
  const nearbyRoute = layoutRouter.routeOnParkLayout(graph, nearbyStart, target, { mode: "shortest" });
  assert.ok(nearbyRoute);
  assert.ok(nearbyRoute.distanceMeters <= 16, `expected direct nearby walk <= 16m, got ${nearbyRoute.distanceMeters}m`);
});

test("thin 1.5m retaining wall between parallel road and upper terrace cannot be climbed across", () => {
  const planning = load("src/lib/phase2-planning.ts", { "./phase2-cad-details": {}, "./phase2-plot-coordinates": {} });
  const layoutRouter = load("src/lib/phase2-layout-routing.ts", {
    "./park-details": { PARK_NAME: "Forest Lake Memorial Park - Legazpi", PARK_ADDRESS: "Legazpi City" },
    "./phase2-planning": planning,
  });
  const boundary = {
    id: "boundary:1",
    shape: { kind: "polygon", positions: [[[0, 0], [40, 0], [40, 50], [0, 50], [0, 0]]] },
  };
  // Thin 1.5m retaining wall along x=10.5..12 from y=0..38; only open at y > 38.
  const retainingWall = {
    id: "context:wall1",
    properties: { effective_layer: "[SDP] Slope Protection" },
    shape: { kind: "polygon", positions: [[[10.5, 0], [12, 0], [12, 38], [10.5, 38], [10.5, 0]]] },
  };
  const bundle = {
    data: {
      bounds: [0, 0, 40, 50],
      layers: {
        boundary: [boundary],
        // Road on lower side (x=10) wrapping around the open north end (y=42) into upper terrace (x=13).
        roads: [
          { id: "roads:1", shape: { kind: "line", positions: [[10, 10], [10, 42], [13, 42]] } },
        ],
        paths: [
          { id: "paths:1", shape: { kind: "line", positions: [[13, 42], [13, 10]] } },
        ],
        blocks: [],
        context: [retainingWall],
      },
    },
    places: { landmarks: [] },
    details: { labels: [] },
  };
  const graph = layoutRouter.buildLayoutWalkwayGraph(bundle);
  const start = { id: "lower-road", label: "Lower Road", position: [10, 10] };
  const upperPlot = { id: "lawn:upper", bounds: [14, 9, 16, 11] };

  for (const mode of ["shortest", "paved"]) {
    const route = layoutRouter.routeOnParkLayout(graph, start, upperPlot, { mode });
    assert.ok(route, `route should exist in ${mode} mode`);
    // Must walk up around y >= 38 instead of climbing directly across the 1.5m wall at y=10!
    assert.ok(route.distanceMeters >= 55, `route in ${mode} mode climbed retaining wall (${route.distanceMeters}m)`);
    assert.ok(route.path.some(([, y]) => y >= 38), `route in ${mode} mode did not go around retaining wall end`);
  }
});

test("empty steep hillside embankment without lawn plots forces routes onto the graded road", () => {
  const planning = load("src/lib/phase2-planning.ts", { "./phase2-cad-details": {}, "./phase2-plot-coordinates": {} });
  const layoutRouter = load("src/lib/phase2-layout-routing.ts", {
    "./park-details": { PARK_NAME: "Forest Lake Memorial Park - Legazpi", PARK_ADDRESS: "Legazpi City" },
    "./phase2-planning": planning,
  });
  const boundary = {
    id: "boundary:1",
    shape: { kind: "polygon", positions: [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]] },
  };
  // Lawn plots only on lower terrace (y=10..24) and upper terrace (y=74..88).
  // Middle strip y=25..73 is an empty steep grassy hillside with NO lawn plots!
  const lawn = [
    { id: "lawn:low1", bounds: [10, 10, 50, 24] },
    { id: "lawn:high1", bounds: [10, 74, 50, 88] },
  ];
  const bundle = {
    data: {
      bounds: [0, 0, 100, 100],
      layers: {
        boundary: [boundary],
        lawn,
        // Graded S-bend road wraps around the east side (x=90).
        roads: [
          { id: "roads:1", shape: { kind: "line", positions: [[20, 20], [90, 20], [90, 80], [20, 80]] } },
        ],
        paths: [],
        blocks: [],
        context: [],
      },
    },
    places: { landmarks: [] },
    details: { labels: [] },
  };
  const graph = layoutRouter.buildLayoutWalkwayGraph(bundle);
  const start = { id: "low", label: "Lower Terrace", position: [20, 20] };
  const target = { id: "lawn:high1", bounds: [18, 78, 22, 82] };
  const route = layoutRouter.routeOnParkLayout(graph, start, target, { mode: "shortest" });
  assert.ok(route);
  // Must follow the graded east road (x >= 80) instead of climbing straight up x=20 across the steep empty hillside!
  assert.ok(route.path.some(([x]) => x >= 80), `route climbed steep hillside instead of taking east road: ${JSON.stringify(route.path)}`);
});
