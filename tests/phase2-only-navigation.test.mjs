import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

function load(file, dependencies) {
  const source = readFileSync(new URL("../" + file, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loadedModule = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    assert.ok(name in dependencies, "Unexpected dependency " + name);
    return dependencies[name];
  }, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
function redirect(location) { throw Object.assign(new Error("redirect"), { location }); }
const redirected = (action, location) => assert.rejects(action, (error) => error.location === location);
const request = (params = {}) => ({ searchParams: Promise.resolve(params) });

test("Map entry renders the integrated GraveNav section without redirecting to the static viewer", async () => {
  const { default: page } = load("src/app/map/page.tsx", {
    "react/jsx-runtime": jsx,
    "next/navigation": { redirect },
    "@/components/visitor/visitor-shell": { VisitorShell: ({ children }) => jsx.jsx("main", { children }) },
    "@/components/visitor/map-explorer": { MapExplorer: ({ query, destination, view }) => jsx.jsx("section", { "data-native-map": query, "data-burial": destination?.id, "data-view": view }) },
    "@/lib/supabase/public-data": { getPublicGardenNames: async () => [], searchPublicBurials: async () => ({ items: [], total: 0, pageSize: 20 }) },
    "@/lib/supabase/phase2-data": { getPhaseTwoDestination: async id => ({ record: { id }, geography: {state:"unavailable",data:null} }) },
  });
  for (const params of [{}, { phase: "1" }, { plot: "OLD-PLOT" }, { query: "lawn:1" }]) {
    const html = renderToStaticMarkup(await page(request(params)));
    assert.match(html, /<main><section data-native-map=/);
    assert.doesNotMatch(html, /iframe|phase2-viewer/);
  }
  assert.match(renderToStaticMarkup(await page(request({ id: "17" }))), /data-burial="17" data-view="geographic"/);
});

test("Navigation cannot fall back to the retired network", async () => {
  let scope = "phase2";
  const { default: page } = load("src/app/navigation/page.tsx", {
    "@/lib/supabase/phase2-data": { getBurialMapScope: async () => scope },
    "next/navigation": { redirect },
    "@/lib/supabase/public-data": {
      getPublicBurialRecord: async (id) => id === "17" ? { id } : null,
      getPublicBurialRecordByPlot: async () => null,
    },
  });
  await redirected(() => page(request({ id: "17" })), "/map?id=17");
  scope = "unavailable";
  await redirected(() => page(request({ id: "17" })), "/map?id=17");
  await redirected(() => page(request({ plot: "SHARED" })), "/results?query=SHARED");
  await redirected(() => page(request({ id: "18" })), "/record-not-found?query=18");
});

test("Missing scope, foreign areas and read failures never authorize an old map", async () => {
  const saved = [process.env.GRAVENAV_PHASE2_SITE_ID, process.env.GRAVENAV_PHASE2_AREA_ID];
  let association = { burialId: "17", areaId: "2" };
  let fail = false;
  const { getBurialMapScope } = load("src/lib/supabase/phase2-data.ts", {
    "./config": { getPublicSupabase: () => ({}) },
    "./public-data": {}, "@/lib/phase2-routing": {},
    "./gis-data": { getPublicBurialGis: async () => { if (fail) throw Error("offline"); return association; } },
    "@/lib/phase2-geographic": { phaseTwoScope: (siteId, areaId) => siteId && areaId ? { siteId, areaId } : null },
  });
  try {
    delete process.env.GRAVENAV_PHASE2_SITE_ID;
    delete process.env.GRAVENAV_PHASE2_AREA_ID;
    assert.equal(await getBurialMapScope("17"), "unavailable");
    process.env.GRAVENAV_PHASE2_SITE_ID = "1";
    process.env.GRAVENAV_PHASE2_AREA_ID = "2";
    assert.equal(await getBurialMapScope("17"), "phase2");
    association = { burialId: "17", areaId: "3" };
    assert.equal(await getBurialMapScope("17"), "unavailable");
    association = { burialId: "18", areaId: "2" };
    assert.equal(await getBurialMapScope("17"), "unavailable");
    fail = true;
    assert.equal(await getBurialMapScope("17"), "unavailable");
  } finally {
    for (const [key, value] of [["GRAVENAV_PHASE2_SITE_ID", saved[0]], ["GRAVENAV_PHASE2_AREA_ID", saved[1]]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("Profiles offer only the approved Phase 2 association", () => {
  const { GravesiteLocationCard } = load("src/components/visitor/gravesite-location-card.tsx", {
    "react/jsx-runtime": jsx, "next/link": { __esModule: true, default: "a" },
    "@/components/ui/icons": { Icon: () => null },
  });
  const record = { id: "17", section: "Synthetic area", row: "", plot: "SHARED", coordinateStatus: "verified" };
  const unassociated = renderToStaticMarkup(jsx.jsx(GravesiteLocationCard, { record, mapScope: "unavailable" }));
  assert.match(unassociated, /href="\/map\?id=17"/);
  assert.doesNotMatch(unassociated, /href="\/navigation/);
  assert.match(unassociated, /no approved Phase 2 plot association/);
  const mapped = renderToStaticMarkup(jsx.jsx(GravesiteLocationCard, { record, mapScope: "phase2" }));
  assert.match(mapped, /href="\/map\?id=17"/);
  assert.doesNotMatch(mapped, /href="\/navigation|href="\/phase2-map/);
});

test("Administrator map uses the same landscape and handles a missing local package", () => {
  const { AdminCemeteryMap } = load("src/components/admin/admin-cemetery-map.tsx", {
    "react/jsx-runtime": jsx,
    "@/components/ui/alert": { Alert: ({ children }) => jsx.jsx("p", { children }) },
    "@/components/ui/empty-state": { EmptyState: ({ title }) => jsx.jsx("p", { children: title }) },
    "@/components/visitor/map-explorer": { MapExplorer: () => jsx.jsx("section", { "data-native-map": true }) },
  });
  const installed = renderToStaticMarkup(jsx.jsx(AdminCemeteryMap, { hasPlanningMap: true }));
  assert.match(installed, /data-native-map="true"/);
  assert.doesNotMatch(installed, /Phase 1|Supabase map tables/);
  const missing = renderToStaticMarkup(jsx.jsx(AdminCemeteryMap, { hasPlanningMap: false }));
  assert.match(missing, /Phase 2 landscape unavailable/);
  assert.doesNotMatch(missing, /iframe/);
});
