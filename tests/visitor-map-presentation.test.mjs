import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import * as parkDetails from "../src/lib/park-details.ts";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

function load(file, dependencies) {
  const compiled = ts.transpileModule(readFileSync(new URL("../" + file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "exports", compiled)(name => {
    assert.ok(name in dependencies, "Unexpected dependency " + name);
    return dependencies[name];
  }, loaded.exports);
  return loaded.exports;
}
const planning = load("src/lib/phase2-planning.ts", { "./phase2-cad-details": {}, "./phase2-plot-coordinates": {} });
const presentation = load("src/lib/visitor-presentation.ts", {
  "./synthetic-plots": load("src/lib/synthetic-plots.ts", {}),
});
const candidate = { id: "lawn:1", properties: { instance_path: "TEST/1" }, review: { overlapReviewFids: [2] } };
const bundle = { data: { layers: { lawn: [candidate], estates: [] } }, coordinates: { entries: { "lawn:1": {} } }, details: { labels: [] },
  places: { landmarks: [{ id: "TEST", name: "NEW MPH (CAD name)", cadXY: [1, 2] }, { id: "TEST2", name: "Standard Gazebo", cadXY: [3, 4] }] } };
function render(props = {}, selected = null) {
  let state = 0;
  const { MapExplorer } = load("src/components/visitor/map-explorer.tsx", {
    "@/lib/park-details": parkDetails,
    "@/lib/visitor-presentation": presentation,
    "react/jsx-runtime": jsx,
    react: { useState: initial => [state++ === 0 ? bundle : state === 6 ? selected : initial, () => {}],
      useRef: initial => ({ current: initial }), useEffect: () => {}, useCallback: fn => fn, useMemo: fn => fn() },
    "next/dynamic": { __esModule: true, default: () => p => jsx.jsx("div", { "data-review-mode": p.reviewMode, "data-paths": p.visible.paths }) },
    "next/link": { __esModule: true, default: ({ prefetch, children, ...props }) => { void prefetch; return jsx.jsx("a", { ...props, children }); } }, "@/components/ui/icons": { Icon: () => null },
    "./map-explorer.module.css": { __esModule: true, default: { experience: "visitor-map", searchPanel: "search-panel" } },
    "@/lib/phase2-layout-routing": {
      buildLayoutWalkwayGraph: () => ({ nodes: [], adj: [] }),
      layoutStartPoints: () => [],
      PARK_ENTRANCE_MAPS_URL: "https://www.google.com/maps",
      routeOnParkLayout: () => null,
    },
    "@/lib/phase2-planning": planning, "./phase2-geographic-map": { PhaseTwoGeographicMap: ({ burialId, memorial }) => jsx.jsx("div", { "data-geographic": true, "data-burial": burialId, "data-profile": memorial?.profileHref, "data-park": memorial?.parkHref }) },
    "./plot-coordinate-details": { PlotCoordinateDetails: () => jsx.jsx("div", { "data-coordinate-details": true, children: "CAD coordinate reference" }) },
  });
  return renderToStaticMarkup(jsx.jsx(MapExplorer, props));
}

test("Visitor map keeps paths visible and presents park language without staff drafting controls", () => {
  for (const selected of [null, candidate]) {
    const html = render({}, selected);
    assert.match(html, /data-review-mode="false" data-paths="true"/);
    assert.match(html, /Gardens &amp; amenities/);
    assert.match(html, /Multipurpose hall/);
    assert.match(html, /Gazebo/);
    assert.doesNotMatch(html.replace(/<[^>]+>/g, " "), /CAD|candidate|planning reference|unverified|concept|Illustrative|Map layers|Plot coordinates|overlap review|TEST\/1|lawn:1/i);
    assert.doesNotMatch(html, /data-coordinate-details/);
  }
});

test("Staff tools retain exact source references, coordinate disclosure and map-layer controls", () => {
  const html = render({ staffTools: true }, candidate);
  assert.match(html, /data-review-mode="true"/);
  assert.match(html, /Find a CAD candidate/);
  assert.match(html, /Map layers/);
  assert.match(html, /TEST\/1/);
  assert.match(html, /data-coordinate-details="true"/);
});

test("Missing geographic publication has useful visitor copy and does not create a destination", () => {
  const geography = { data: null, message: "Internal publication scope missing" };
  const html = render({ view: "geographic", requestedId: "17", geography });
  assert.match(render({ view: "geographic", geography }), /Gravesite map unavailable/);
  assert.match(html, /Gravesite location unavailable/);
  assert.match(html, /ask cemetery staff/);
  assert.match(html, /Back to park map/);
  assert.doesNotMatch(html, /Internal publication|data-geographic|CAD|data-coordinate-details/);
});

test("Mobile search expands for results and selected memorials retain their identity in navigation and park fallback", () => {
  assert.match(render(), /class="search-panel"><summary/);
  assert.match(render({ query: "Test only" }), /class="search-panel" open=""/);
  const memorial = { id: "17", name: "Test memorial", plotLabel: "Test plot", section: "Test garden", plot: "T-1" };
  const geography = { data: { releaseId: "test-release", scopeRevision: 1, target: {}, accessPoint: {}, navigationPolicy: {} } };
  const available = render({ view: "geographic", destination: memorial, geography, requestedId: "17",
    query: "Test", section: "Test garden", page: 2, total: 69, gardenListUnavailable: true,
    returnTo: "/results?query=Test" });
  assert.match(available, /data-geographic="true" data-burial="17"/);
  assert.match(available, /data-profile="\/gravesite\?id=17&amp;returnTo=%2Fresults%3Fquery%3DTest"/);
  assert.match(available, /view=planning&amp;id=17&amp;returnTo=%2Fresults%3Fquery%3DTest/);
  const unavailable = render({ view: "geographic", destination: memorial, geography: { data: null }, requestedId: "17" });
  assert.doesNotMatch(unavailable, /data-geographic|>Get Directions</);
  assert.match(unavailable, /Gravesite location unavailable/);
  assert.match(unavailable, /Test memorial/);
  assert.match(unavailable, /data-review-mode="false" data-paths="true"/);
  const results = "/results?query=Test&page=3";
  const planning = render({ view: "planning", destination: memorial, geography, requestedId: "17", returnTo: results });
  assert.doesNotMatch(planning, />Get Directions<|The highlighted plot/);
  assert.match(planning, /returnTo=%2Fresults%3Fquery%3DTest%26page%3D3/);
});

const manifestUrl = new URL("../public/phase2-planning/cad-details/manifest.json", import.meta.url);
test("Wayfinding labels cover parking and six compact lights follow the existing walkway centreline", { skip: !existsSync(manifestUrl) }, () => {
  const manifest = JSON.parse(readFileSync(manifestUrl));
  const parking = manifest.labels.filter(label => label.name === "Parking");
  const instances = parking.flatMap(label => label.sourcePaths);
  assert.equal(instances.length, 81);
  assert.equal(new Set(instances).size, 81);
  assert.ok(manifest.labels.some(label => label.name === "Walkway"));
  assert.equal(manifest.streetLights.length, 6);
  const landscape = JSON.parse(readFileSync(new URL("../public/phase2-viewer/landscape/manifest.json", import.meta.url)));
  const ends = landscape.pathways.find(path => path.id === "broad-pathwalk").provisionalEnds.map(pair => pair[0].map((n, i) => (n + pair[1][i]) / 2));
  const [a, b] = ends;
  for (const light of manifest.streetLights) {
    const [x, y] = light.displayCadXY;
    const cross = (x - a[0]) * (b[1] - a[1]) - (y - a[1]) * (b[0] - a[0]);
    assert.ok(Math.abs(cross) < 1e-7);
    assert.ok(light.centrelineOffsetUnits < 5);
  }
  const site = readFileSync(new URL(manifest.layers.site.image, manifestUrl), "utf8");
  assert.equal((site.match(/data-kind="street-light"/g) || []).length, 6);
});

test("park directory groups exact source anchors and keeps unreviewed geographic paths out", () => {
  const { planningPlaces, publishedPlaces } = load("src/lib/park-explorer-features.ts", { "./phase2-planning": planning });
  const places = planningPlaces({
    places: { landmarks: [{ kind: "garden", name: "Palm Garden", cadXY: [12, 34] }, { kind: "garden", name: "Palm Garden", cadXY: [56, 78] }] },
    details: { labels: [{ kind: "section", name: "A", cadXY: [80, 90] }, { kind: "edge", name: "Creek", cadXY: [11, 22] }] },
  });
  assert.deepEqual(places.map(({ name, points }) => ({ name, points })), [
    { name: "Palm Garden", points: [[12, 34], [56, 78]] }, { name: "Section A", points: [[80, 90]] },
  ]);
  const boundary = { id: "verified-area", properties: { kind: "area" } };
  const path = { id: "accepted", properties: { walkingAllowed: true } };
  const landmark = { id: "named", properties: { label: "Park office" } };
  const published = publishedPlaces({ layers: { boundaries: [boundary], walkways: [path, { id: "restricted", properties: { walkingAllowed: false } }], landmarks: [landmark] }});
  assert.deepEqual(published.map(({ geographic }) => geographic.id), ["verified-area", "named", "accepted"]);
});
