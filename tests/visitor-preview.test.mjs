import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import * as parkDetails from "../src/lib/park-details.ts";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, dependencies = {}) {
  const source = readFileSync(file, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const loadedModule = { exports: {} };
  new Function("require", "module", "exports", output)((name) => {
    if (name === "server-only") return {};
    if (name in dependencies) return dependencies[name];
    if (name === "react/jsx-runtime") return require(name);
    throw Error("Unexpected dependency " + name);
  }, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const synthetic = load("src/lib/synthetic-plots.ts");
const presentation = load("src/lib/visitor-presentation.ts", { "./synthetic-plots": synthetic });
const publicData = load("src/lib/supabase/public-data.ts", { "./config": {} });
const navigation = load("src/lib/public-navigation.ts");
const internal = "P2S-" + "a".repeat(64);
const source = {
  burial_id: 5, lot_id: 42, interment_date: "2020-01-02", record_status: "pending",
  deceased: { display_name: "Tomas Kuwento", birth_date: null, death_date: "2020-01-01" },
  lot: { lot_code: internal, deleted_at: null, area: { area_name: "Butterfly Palm Garden" }, block: null },
};
const record = publicData.toPublicRecord({
  burial_id: 5, display_name: source.deceased.display_name, birth_date: null,
  death_date: "2020-01-01", interment_date: "2020-01-02", record_status: "pending",
  lot_code: internal, area_name: "Butterfly Palm Garden", block_number: null,
  synthetic_plot_reference: "BPG-A · Block 1 · Lot 9", location_geom: null,
  px_loc_x: null, px_loc_y: null, location_verified: false, coordinate_status: "pending",
});

test("visitor references hide internal identifiers and preserve missing details", () => {
  assert.deepEqual(presentation.visitorPlotDetails(record), {
    garden: "Butterfly Palm Garden", block: "1", lot: "9", reference: "BPG-A · Block 1 · Lot 9",
  });
  const missing = presentation.visitorPlotDetails({ ...record, syntheticPlotReference: null });
  assert.equal(missing.lot, "Not recorded");
  assert.equal(missing.block, "Not recorded");
  assert.doesNotMatch(JSON.stringify(missing), /P2S-|[a-f0-9]{64}/);
  for (const unsafe of [internal, "source_row_key: " + "a".repeat(64)]) {
    assert.equal(presentation.visitorPlotDetails({ ...record, syntheticPlotReference: unsafe }).lot,
      "Not recorded");
  }
});

test("public profile and map return links preserve local results only", () => {
  const href = "/results?query=Tomas+%26+Family&section=Butterfly+Palm+Garden&year=2000-present&sort=newest&page=3";
  assert.equal(presentation.safeResultsReturnTo(href), href);
  for (const unsafe of ["/search", "//elsewhere.invalid/results", "https://elsewhere.invalid/results",
    "/results/../admin", [href]]) {
    assert.equal(presentation.safeResultsReturnTo(unsafe), "/results");
  }
});

test("return navigation stays inside the protected preview and preserves query/page", () => {
  const href = presentation.previewSearchHref("Tomas & Family", 2);
  assert.equal(presentation.safePreviewReturnTo(href), href);
  for (const unsafe of ["https://elsewhere.invalid/", "//elsewhere.invalid/",
    "/results?preview=true", "/admin/burial-records/preview/../5", "http://[invalid"]) {
    assert.equal(presentation.safePreviewReturnTo(unsafe), presentation.visitorPreviewPath);
  }
});

test("staff search and profiles use an allowlist; denied users never read hidden records", async () => {
  let allowed = true;
  const calls = [];
  const client = {
    from(table) {
      calls.push(table);
      const chain = new Proxy({}, { get: (_, method) => method === "then"
        ? (resolve) => resolve({ data: table === "burial_record" ? source : null, error: null })
        : () => chain });
      return chain;
    },
    async rpc(name, args) {
      calls.push(name);
      if (name === "staff_sample_plot_references") return {
        data: [{ lotId: "42", reference: record.syntheticPlotReference }], error: null,
      };
      assert.equal(name, "staff_burial_records");
      assert.equal(args.p_query, "Tomas");
      assert.equal(args.p_page, 2);
      assert.equal(args.p_page_size, 20);
      return { data: { total: 100, items: [{ burialId: 5, lotId: 42, name: "Tomas Kuwento",
        plot: internal, section: "Butterfly Palm Garden", recordStatus: "pending",
        birthDate: null, deathDate: "2020-01-01", intermentDate: "2020-01-02",
        qualityNotes: "PRIVATE_NOTE", owner: "PRIVATE_OWNER", source_row_key: "PRIVATE_SOURCE",
        location: { latitude: 99, longitude: 99 }, coordinateVerified: true }] }, error: null };
    },
  };
  const reader = load("src/lib/supabase/staff-visitor-preview.ts", {
    "@/lib/auth": { requireStaff: async () => {
      if (!allowed) throw Error("Denied"); calls.push("auth");
    } },
    "./server": { getServerSupabase: async () => client },
    "./public-data": publicData,
    "@/lib/visitor-presentation": presentation,
  });
  const search = await reader.searchStaffVisitorPreviews("Tomas", 2);
  const profile = await reader.getStaffVisitorPreview("5");
  assert.equal(calls[0], "auth");
  assert.deepEqual(search.items[0], profile.record);
  assert.equal(search.total, 100);
  assert.equal(profile.visible, false);
  assert.equal(profile.record.plot, "9");
  assert.equal(profile.record.gravesiteReference, record.syntheticPlotReference);
  assert.equal(profile.record.location, null);
  assert.equal(navigation.canNavigateToPublicRecord(profile.record), false);
  assert.doesNotMatch(JSON.stringify(search), /PRIVATE_|P2S-|qualityNotes|source_row_key|owner/);
  allowed = false;
  calls.length = 0;
  await assert.rejects(reader.searchStaffVisitorPreviews("Tomas", 1), /Denied/);
  await assert.rejects(reader.getStaffVisitorPreview("5"), /Denied/);
  assert.deepEqual(calls, []);
});

test("existing staff guard denies anonymous, inactive and unauthorized accounts", async () => {
  let user = null, row = null;
  const client = { auth: { getUser: async () => ({ data: { user } }) },
    rpc: async (name) => ({ data: name === "get_my_account" ? [row] : false, error: null }) };
  const auth = load("src/lib/auth.ts", {
    "next/navigation": { redirect: (path) => { throw Error(path); } },
    "./supabase/server": { getServerSupabase: async () => client },
  });
  await assert.rejects(auth.requireStaff(), /login/);
  user = { id: "isolated-unit-user" };
  const active = { account_id: user.id, username: "Unit staff", role_name: "ADMIN",
    account_status: "ACTIVE", is_active: true };
  for (const patch of [{ role_name: "VISITOR" }, { is_active: false },
    { account_status: "SUSPENDED" }]) {
    row = { ...active, ...patch };
    await assert.rejects(auth.requireStaff(), /unauthorized/);
  }
  row = active;
  assert.equal((await auth.requireStaff()).role, "ADMIN");
});

test("reused cards and memorials contain natural labels and only protected preview links", async () => {
  const Icon = load("src/components/ui/icons.tsx").Icon;
  const Link = ({ href, children, className }) => React.createElement("a", { href, className }, children);
  const location = load("src/components/visitor/gravesite-location-card.tsx", {
    "@/lib/park-details": parkDetails,
    "next/link": Link, "@/components/ui/icons": { Icon },
    "@/lib/visitor-presentation": presentation,
  });
  const Card = load("src/components/visitor/public-search-result-card.tsx", {
    "@/lib/park-details": parkDetails,
    "next/link": Link, "@/components/ui/icons": { Icon },
    "@/lib/public-navigation": navigation, "@/lib/visitor-presentation": presentation,
  }).PublicSearchResultCard;
  const Profile = load("src/components/visitor/memorial-profile.tsx", {
    "next/link": Link, "./gravesite-location-card": location,
    "@/components/ui/icons": { Icon }, "@/lib/visitor-presentation": presentation,
  }).MemorialProfile;
  const long = { ...record, name: "Tomas " + "Longname".repeat(25) };
  const html = renderToStaticMarkup(React.createElement(Card,
    { record: long, preview: true, returnTo: presentation.previewSearchHref("Tomas", 2) }));
  assert.match(html, /\/admin\/burial-records\/5\/preview\?/);
  assert.match(html, /returnTo=/);
  assert.doesNotMatch(html, /P2S-|Synthetic|Fictional|Sample|Demo|Internal lot/);
  const profile = renderToStaticMarkup(React.createElement(Profile, {
    record: long, mapScope: "unavailable", shared: { state: "ready", items: [] },
    returnTo: presentation.previewSearchHref("Tomas", 2), preview: true,
  }));
  assert.match(profile, /Deceased Information/);
  assert.match(profile, /Gravesite Details/);
  assert.match(profile, /Interment Date/);
  assert.doesNotMatch(profile, /P2S-|Synthetic|Fictional|Sample|Demo|Interred|cemetery-approved/);
  assert.doesNotMatch(profile, /href="\/(map|navigation|gravesite|results)/);
  assert.doesNotMatch(profile, /role="img"/); // The memorial heading must remain in the accessibility tree.
  const returnTo = presentation.previewSearchHref("Tomas & Family", 2);
  const detailPage = load("src/app/admin/burial-records/[id]/preview/page.tsx", {
    "next/link": Link,
    "@/components/admin/admin-shell": { AdminShell: ({ children }) => children },
    "@/components/ui/alert": { Alert: ({ children }) => children },
    "@/components/visitor/memorial-profile": { MemorialProfile: Profile },
    "@/lib/supabase/staff-visitor-preview": {
      getStaffVisitorPreview: async (id) => { assert.equal(id, "5"); return { record, visible: false }; },
    },
    "@/lib/visitor-presentation": presentation,
  }).default;
  const detail = renderToStaticMarkup(await detailPage({ params: Promise.resolve({ id: "5" }),
    searchParams: Promise.resolve({ returnTo }) }));
  assert.ok(detail.includes('href="' + returnTo.replaceAll("&", "&amp;") + '"'));
  assert.equal((detail.match(/Visitor preview — not published\./g) || []).length, 1);
  assert.doesNotMatch(detail, /href="\/(map|navigation|gravesite|results)/);
});
