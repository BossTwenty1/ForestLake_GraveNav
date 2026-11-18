// Explicit local browser acceptance only. No hosted credentials or product fixture fallback.
// Run with GRAVENAV_PLAYWRIGHT_MODULE pointing to an already installed Playwright module.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.GRAVENAV_PLAYWRIGHT_MODULE || "playwright");
const user = {
  id: "10000000-0000-4000-8000-000000000001",
  aud: "authenticated", role: "authenticated", email: "burial-test@example.invalid",
};
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const token = encode({ alg: "HS256", typ: "JWT" }) + "." +
  encode({ sub: user.id, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 }) +
  ".test-only-signature";
const session = {
  access_token: token, refresh_token: "isolated-test-refresh", token_type: "bearer",
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user,
};

let role = "ADMIN", active = true, failReads = false, rejectSave = false, noPlots = false;
const writes = [], receipts = new Map();
const records = Array.from({ length: 21 }, (_, index) => ({
  burial_id: index + 1, deceased_id: index + 1, lot_id: 101 + index, revision: 1,
  interment_date: "2020-01-02", record_status: "pending", interment_status: "PERMANENT",
  remains_type: "ASH", reference_no: "TEST-REF-" + (index + 1),
  interment_order_number: "TEST-ORDER-" + (index + 1), interment_confirmed: index === 0,
  service_provider: "Test provider", record_source: "Test source", quality_notes: "Private test notes",
  updated_at: "2026-11-17T00:00:00Z",
}));
const people = records.map((record) => ({
  deceased_id: record.deceased_id, display_name: "Test Person " + record.burial_id,
  birth_date: "1900-01-01", death_date: "2020-01-01", public_display: false,
}));
const lots = records.map((record) => ({
  lot_id: record.lot_id, lot_code: "TEST-LOT-" + record.lot_id, area_id: 1,
  location_geom: null, px_loc_x: null, px_loc_y: null,
  coordinate_status: "pending", coordinate_verified: false,
}));
lots.push({ ...lots[0], lot_id: 501, lot_code: "TEST-NEW-PLOT" });
function projected(record) {
  const person = people.find((p) => p.deceased_id === record.deceased_id);
  return {
    ...record, burialId: record.burial_id, deceasedId: record.deceased_id, lotId: record.lot_id,
    name: person.display_name, plot: lots.find((l) => l.lot_id === record.lot_id).lot_code,
    section: "Test Garden", recordStatus: record.record_status, birthDate: person.birth_date,
    deathDate: person.death_date, publicDisplay: person.public_display,
    intermentDate: record.interment_date, intermentStatus: record.interment_status,
    remainsType: record.remains_type, referenceNo: record.reference_no,
    intermentOrderNumber: record.interment_order_number, intermentConfirmed: record.interment_confirmed,
    serviceProvider: record.service_provider, recordSource: record.record_source,
    qualityNotes: record.quality_notes, updatedAt: record.updated_at,
    location: null, pixelLocation: null, coordinateStatus: "pending", coordinateVerified: false,
  };
}
function publicRows() {
  return records.filter((record) => record.record_status === "active"
    && people.find((person) => person.deceased_id === record.deceased_id)?.public_display)
    .map((record) => {
      const person = people.find((p) => p.deceased_id === record.deceased_id);
      return {
        burial_id: record.burial_id, display_name: person.display_name,
        birth_date: person.birth_date, death_date: person.death_date,
        interment_date: record.interment_date, record_status: "active",
        lot_code: lots.find((lot) => lot.lot_id === record.lot_id).lot_code,
        area_name: "Test Garden", block_number: null,
        location_geom: null, location_verified: false, coordinate_status: "pending",
        px_loc_x: null, px_loc_y: null, synthetic_plot_reference: "TEST SYNTHETIC REFERENCE",
      };
    });
}
const fixture = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  const endpoint = url.pathname.split("/").at(-1);
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
  let data, status = 200, total;
  if (endpoint === "user") data = user;
  else if (endpoint === "get_my_account") data = [{
    account_id: user.id, username: "Test Clerk", role_name: role,
    account_status: active ? "ACTIVE" : "PENDING", is_active: active,
  }];
  else if (failReads) { data = { message: "Isolated read failure" }; status = 503; }
  else if (endpoint === "public_burial_records") {
    data = publicRows();
    if (url.searchParams.has("burial_id")) data = data.filter((row) =>
      String(row.burial_id) === url.searchParams.get("burial_id").slice(3));
  } else if (endpoint === "search_public_burials") {
    data = { items: publicRows().filter((row) =>
      row.display_name.toLowerCase().includes((body.p_query || "").toLowerCase())), total: publicRows().length };
  } else if (endpoint === "public_shared_plot_burials") data = [];
  else if (endpoint === "public_burial_gis") data = null;
  else if (endpoint === "staff_burial_records") {
    let filtered = records.map(projected).filter((r) => !body.p_query ||
      r.name.toLowerCase().includes(body.p_query.toLowerCase()));
    if (body.p_status !== "all") filtered = filtered.filter((r) => r.recordStatus === body.p_status);
    const page = body.p_page || 1, size = body.p_page_size || 20;
    data = { items: filtered.slice((page - 1) * size, page * size),
      total: filtered.length, totalAll: records.length, sections: ["Test Garden"] };
  } else if (endpoint === "staff_dashboard_counts") data = {
    active: 0, pending: records.length, archived: 0, plots: lots.length,
    unverified: lots.length, missingCoordinates: lots.length, pendingCoordinates: 0,
  };
  else if (endpoint === "staff_interment_plot_options") data = noPlots ? [] : [{
    lotId: 501, lotCode: "TEST-NEW-PLOT", section: "Test Garden", status: "AVAILABLE",
    graveType: "regular", confirmedCount: 1, remaining: 5,
  }];
  else if (endpoint === "staff_sample_plot_references") data = body.p_lot_ids.map((id) => ({
    lotId: String(id), reference: "TEST SYNTHETIC REFERENCE",
  }));
  else if (["burial_record", "deceased", "lot", "area"].includes(endpoint)) {
    data = endpoint === "burial_record" ? records : endpoint === "deceased" ? people :
      endpoint === "lot" ? lots : [{ area_id: 1, area_name: "Test Garden" }];
    for (const key of ["burial_id", "deceased_id", "lot_id", "area_id"]) {
      const filter = url.searchParams.get(key);
      if (filter?.startsWith("eq.")) data = data.filter((row) => String(row[key]) === filter.slice(3));
      if (filter?.startsWith("in.")) {
        const ids = filter.slice(4, -1).split(",");
        data = data.filter((row) => ids.includes(String(row[key])));
      }
    }
    total = data.length;
    if (endpoint === "burial_record" && url.searchParams.get("select")?.includes("deceased(")) {
      data = data.map((record) => ({
        ...record, deceased: people.find((person) => person.deceased_id === record.deceased_id),
        lot: { ...lots.find((lot) => lot.lot_id === record.lot_id),
          area: { area_name: "Test Garden" }, block: null },
      }));
    }
  } else if (endpoint === "staff_save_record") {
    writes.push(body);
    assert.equal(body.p_entity, "burial_record");
    let row = records.find((r) => String(r.burial_id) === body.p_id);
    if (receipts.has(body.p_request_id)) data = receipts.get(body.p_request_id);
    else if (rejectSave || !active) { data = { message: "Isolated save rejected" }; status = 409; }
    else if (row && row.revision !== body.p_revision) {
      data = { message: "Record changed; reload before saving" }; status = 409;
    } else {
      if (!row) {
        row = { burial_id: records.length + 1, deceased_id: people.length + 1, revision: 0 };
        records.push(row);
        people.push({ deceased_id: row.deceased_id });
      }
      const person = people.find((p) => p.deceased_id === row.deceased_id);
      Object.assign(person, {
        display_name: body.p_values.display_name, birth_date: body.p_values.birth_date,
        death_date: body.p_values.death_date, public_display: body.p_values.public_display,
      });
      Object.assign(row, body.p_values, {
        revision: row.revision + 1, updated_at: "2026-11-17T01:00:00Z",
      });
      data = { id: String(row.burial_id), revision: row.revision };
      receipts.set(body.p_request_id, data);
    }
  } else { data = { message: "Unexpected fixture endpoint: " + endpoint }; status = 503; }
  response.writeHead(status, {
    "Content-Type": "application/json", "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*", "Access-Control-Expose-Headers": "Content-Range",
    ...(total === undefined ? {} : { "Content-Range": "0-" + Math.max(0, total - 1) + "/" + total }),
  });
  response.end(JSON.stringify(data));
});
await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
const api = "http://127.0.0.1:" + fixture.address().port;
const origin = "http://127.0.0.1:3229";
const root = fileURLToPath(new URL("../", import.meta.url));
const app = spawn(process.execPath, [
  "node_modules/next/dist/bin/next", "dev",
  ...(process.env.GRAVENAV_QA_WEBPACK === "1" ? ["--webpack"] : []),
  "--hostname", "127.0.0.1", "--port", "3229",
], {
  cwd: root,
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: api,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "isolated-test-key", NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
app.stdout.on("data", (data) => { logs = (logs + data).slice(-8000); });
app.stderr.on("data", (data) => { logs = (logs + data).slice(-8000); });
let browser;
try {
  for (let attempt = 0; attempt < 90; attempt++) {
    if (app.exitCode !== null) throw Error("Test app exited: " + logs);
    try { if ((await fetch(origin + "/admin/login")).ok) break; } catch {}
    if (attempt === 89) throw Error("Test app did not start: " + logs);
    await delay(1000);
  }
  browser = await chromium.launch({
    headless: true, ...(process.env.GRAVENAV_CHROME_PATH
      ? { executablePath: process.env.GRAVENAV_CHROME_PATH } : {}),
  });

  for (const { mobile, theme } of [false, true].flatMap((mobile) =>
    ["light", "dark"].map((theme) => ({ mobile, theme })))) {
    role = mobile ? "MANAGER" : "ADMIN";
    records[0].record_status = "pending";
    records[0].revision++;
    people[0].public_display = false;
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 },
      isMobile: mobile, hasTouch: mobile,
    });
    await context.addInitScript((theme) => localStorage.setItem("gravenav-theme", theme), theme);
    await context.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(
      new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    await context.addCookies([{
      name: "sb-127-auth-token", value: "base64-" + encode(session), url: origin,
    }]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const capture = async (surface) => {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (process.env.GRAVENAV_QA_DIR) await page.screenshot({
        path: process.env.GRAVENAV_QA_DIR + "/" + surface + (mobile ? "-mobile.png" : "-desktop.png"),
        fullPage: true,
      });
    };
    await page.goto(origin + "/admin/burial-records");
    const views = page.getByRole("link", { name: "View", exact: true });
    await views.first().waitFor();
    await capture("directory");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.waitForURL(/page=2/);
    await views.first().waitFor();
    const search = page.locator(".admin-burial-search input");
    await search.fill("Test Person 1");
    await page.waitForURL(/query=Test/);
    await page.waitForTimeout(500);
    await views.first().click();
    await page.getByRole("heading", { name: "Test Person 1", exact: true }).waitFor();
    const blockedPublish = page.getByRole("button", { name: "Publish Record", exact: true });
    await blockedPublish.waitFor();
    assert.equal(await blockedPublish.isDisabled(), true);
    assert.equal(records[0].record_status, "pending");
    await page.getByRole("link", { name: "Preview as Visitor", exact: true }).click();
    await page.waitForURL(/\/admin\/burial-records\/1\/preview$/);
    await page.getByRole("heading", { name: "Test Person 1", exact: true }).waitFor();
    assert.ok((await page.locator("body").innerText()).includes("Visitor preview — not published."));
    assert.ok(!(await page.locator("body").innerText()).includes("Private test notes"));
    const previewResponse = await page.request.get(origin + "/admin/burial-records/1/preview");
    assert.equal(previewResponse.status(), 200);
    assert.ok((previewResponse.headers()["cache-control"] || "").includes("no-store"));
    assert.ok(!(await previewResponse.text()).includes("Private test notes"));
    assert.equal(await page.getByRole("link", { name: "View gravesite on map" }).count(), 0);
    await capture("visitor-preview");
    await page.getByRole("link", { name: "Back to record", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/admin/burial-records/1");
    // An established active record is the fixture for publishing; the UI never activates it.
    records[0].record_status = "active";
    records[0].revision++;
    await page.reload();
    const publish = page.getByRole("button", { name: "Publish Record", exact: true });
    await publish.waitFor();
    await page.waitForFunction(() => ![...document.querySelectorAll("button")]
      .find((button) => button.textContent === "Publish Record")?.disabled);
    await publish.click();
    rejectSave = true;
    await page.getByRole("dialog").getByRole("button", { name: "Publish Record", exact: true }).click();
    await page.getByText("Isolated save rejected", { exact: true }).waitFor();
    rejectSave = false;
    await publish.click();
    await page.getByRole("dialog").getByRole("button", { name: "Publish Record", exact: true }).click();
    await page.getByText("Published — visible to visitors", { exact: true }).waitFor();
    assert.equal(records[0].record_status, "active");
    const visitor = await context.newPage();
    await visitor.goto(origin + "/gravesite?id=1");
    await visitor.getByRole("heading", { name: "Test Person 1", exact: true }).waitFor();
    await visitor.goto(origin + "/results?query=Test%20Person%201");
    await visitor.getByRole("heading", { name: "Test Person 1", exact: true }).waitFor();
    await page.getByRole("button", { name: "Hide Record", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Hide Record", exact: true }).click();
    await page.getByText("Not visible to visitors", { exact: true }).waitFor();
    await visitor.goto(origin + "/gravesite?id=1&preview=true");
    assert.ok(visitor.url().includes("/record-not-found"));
    const apiResponse = await visitor.request.get(origin + "/api/map/phase2?id=1");
    assert.ok(!(await apiResponse.text()).includes("Test Person 1"));
    await visitor.close();
    const stalePublish = page.getByRole("button", { name: "Publish Record", exact: true });
    await stalePublish.waitFor();
    await stalePublish.click();
    records[0].revision++;
    await page.getByRole("dialog").getByRole("button", { name: "Publish Record", exact: true }).click();
    await page.getByText("Record changed; reload before saving", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Reload status", exact: true }).click();
    await page.getByText("Not visible to visitors", { exact: true }).waitFor();
    console.log((mobile ? "Mobile" : "Desktop") + ": publish/hide, preview privacy, eligibility and conflicts passed");
    await page.goto(origin + "/admin/burial-records?record=1&query=Test%20Person%201");
    await page.getByText("TEST SYNTHETIC REFERENCE", { exact: true }).waitFor();
    await capture("detail");
    await page.getByRole("link", { name: "Edit record", exact: true }).click();
    assert.equal(await page.getByLabel("Existing cemetery plot *", { exact: true }).isDisabled(), true);
    assert.equal(await page.getByLabel("Verified interment order", { exact: true }).inputValue(), "TEST-ORDER-1");
    await page.getByLabel("Quality notes (staff only)", { exact: true }).fill("Preserved test notes");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByText("Record saved", { exact: true }).waitFor();
    await page.getByText("Internal Record Details", { exact: true }).click();
    assert.equal(records[0].interment_confirmed, true);
    assert.equal(records[0].interment_order_number, "TEST-ORDER-1");
    await page.getByRole("link", { name: "Back to Deceased & Interments", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/admin/burial-records"
      && Boolean(url.searchParams.get("query")));
    assert.ok(new URL(page.url()).searchParams.get("query")?.includes("Test"));
    await page.getByRole("button", { name: "Add Deceased / Interment Record", exact: true }).first().click();
    await page.getByLabel("Full / display name *", { exact: true }).fill("Browser " + (mobile ? "Mobile" : "Desktop"));
    await page.getByLabel("Existing cemetery plot *", { exact: true }).selectOption("501");
    await page.getByLabel("Birth date", { exact: true }).fill("2021-01-01");
    await page.getByLabel("Death date", { exact: true }).fill("2020-01-01");
    await page.getByRole("button", { name: "Save record", exact: true }).click();
    await page.getByText("Birth date cannot be later than death date.", { exact: true }).waitFor();
    await page.getByLabel("Birth date", { exact: true }).fill("1900-01-01");
    await page.getByLabel("Interment date", { exact: true }).fill("2020-01-02");
    await page.getByLabel("Record reference", { exact: true }).fill("BROWSER-REF");
    await capture("form");
    rejectSave = true;
    await page.getByRole("button", { name: "Save record", exact: true }).click();
    await page.getByText("Isolated save rejected", { exact: true }).waitFor();
    rejectSave = false;
    await page.getByRole("button", { name: "Save record", exact: true }).click();
    await page.getByText("Record saved", { exact: true }).waitFor();
    await page.getByText("Internal Record Details", { exact: true }).click();
    await page.getByText("BROWSER-REF", { exact: true }).waitFor();
    assert.ok(/\/burial-records\/\d+$/.test(new URL(page.url()).pathname));
    await page.getByRole("link", { name: "Edit record", exact: true }).click();
    await page.getByLabel("Service provider", { exact: true }).fill("Updated provider");
    const last = records.at(-1);
    last.revision++;
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByText("Record changed; reload before saving", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Service provider", { exact: true }).inputValue(), "Updated provider");
    await page.goto(origin + "/admin/burial-records?record=1");
    await page.getByRole("heading", { name: "Test Person 1", exact: true }).waitFor();
    await page.goto(origin + "/admin/burial-records?add=1");
    await page.getByRole("heading", { name: "Add Deceased / Interment Record", exact: true }).waitFor();
    noPlots = true;
    await page.reload();
    await page.getByText("No eligible plots available", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Save record", exact: true }).isDisabled(), true);
    noPlots = false;
    await page.goto(origin + "/admin/burial-records/999");
    await page.getByText("Record not found", { exact: true }).waitFor();
    failReads = true;
    await page.goto(origin + "/admin/burial-records/1");
    await page.getByText("Isolated read failure", { exact: true }).waitFor();
    failReads = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByRole("heading", { name: "Test Person 1", exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await context.close();
    console.log((mobile ? "Mobile MANAGER" : "Desktop ADMIN") +
      ": directory, create/detail/edit, confirmation locks, validation, stale save, retries and legacy links passed");
  }
  const anonymous = await browser.newContext();
  const page = await anonymous.newPage();
  for (const path of ["/new", "/1", "/1/edit", "/1/preview"]) {
    await page.goto(origin + "/admin/burial-records" + path);
    assert.ok(page.url().includes("/admin/login"));
  }
  await anonymous.close();
  active = false;
  const inactive = await browser.newContext();
  await inactive.addCookies([{
    name: "sb-127-auth-token", value: "base64-" + encode(session), url: origin,
  }]);
  const inactivePage = await inactive.newPage();
  for (const path of ["/new", "/1", "/1/edit", "/1/preview"]) {
    await inactivePage.goto(origin + "/admin/burial-records" + path);
    assert.ok(inactivePage.url().includes("/admin/unauthorized"));
  }
  await inactive.close();
  assert.ok(writes.every((write) => write.p_entity === "burial_record"));
  console.log("Anonymous/inactive route guards passed; fixture writes target burial_record only.");
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  await browser?.close();
  app.kill();
  fixture.closeAllConnections();
  await new Promise((resolve) => fixture.close(resolve));
}
