// Isolated loopback fixture. Uses no hosted credentials or persistent browser profile.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";

const { chromium } = await import(process.env.GRAVENAV_PLAYWRIGHT_MODULE || "playwright");
const origin = "http://127.0.0.1:3239";
const user = { id: "10000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated" };
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const session = {
  access_token: encode({ alg: "HS256", typ: "JWT" }) + "." +
    encode({ sub: user.id, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 }) + ".fixture",
  expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "fixture", user,
};
const areas = [
  { area_id: 1, area_name: "Garden A" }, { area_id: 2, area_name: "Garden B" },
];
const lots = Array.from({ length: 4584 }, (_, index) => {
  const synthetic = index >= 4494;
  return {
    lot_id: index + 1, lot_code: synthetic ? "P2S-" + index.toString(16).padStart(64, "0") : "PHYSICAL-" + index,
    area_id: synthetic ? 2 : 1, status: synthetic ? "AVAILABLE" : "HOLD", deleted_at: null,
    coordinate_verified: false, coordinate_status: "pending", location_geom: null,
  };
});
const interments = Array.from({ length: 100 }, (_, index) => ({
  burial_id: index + 1, lot_id: 4495 + index % 90,
  record_status: "pending", interment_confirmed: false, interment_date: "2026-01-01",
  deceased: { display_name: index === 0 ? "=1+1" : "Sample " + index },
}));
interments.push({
  burial_id: 101, lot_id: 1, record_status: "active", interment_confirmed: true,
  interment_date: "2025-02-01", deceased: { display_name: "Confirmed fixture" },
});
const tables = { area: areas, lot: lots, burial_record: interments };
let role = "ADMIN", active = true, reads = 0, truncate = false;
const fixture = createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  const endpoint = url.pathname.split("/").at(-1);
  let data;
  let status = 200;
  const headers = { "Content-Type": "application/json" };
  if (endpoint === "user") data = user;
  else if (endpoint === "get_my_account") data = [{
    account_id: user.id, username: "Fixture Clerk", role_name: role,
    account_status: active ? "ACTIVE" : "PENDING", is_active: active,
  }];
  else if (Object.hasOwn(tables, endpoint) && request.method === "GET") {
    reads++;
    const rows = tables[endpoint];
    const offset = Number(url.searchParams.get("offset") || 0);
    const limit = Number(url.searchParams.get("limit") || 500);
    const end = truncate && endpoint === "lot" ? offset + 1 : offset + limit;
    data = rows.slice(offset, end);
    headers["Content-Range"] = `${offset}-${offset + data.length - 1}/${rows.length}`;
  } else if (endpoint === "is_active_admin" || endpoint === "is_active_manager") data = false;
  else { status = 404; data = { message: "Unexpected fixture route" }; }
  response.writeHead(status, headers);
  response.end(JSON.stringify(data));
});
await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
const app = spawn(process.execPath, [
  "node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3239",
], {
  env: {
    ...process.env, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:" + fixture.address().port,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "reports-test-only", NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    NEXT_TELEMETRY_DISABLED: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
for (const stream of [app.stdout, app.stderr]) {
  stream.on("data", (data) => { logs = (logs + data).slice(-5000); });
}
let browser;
try {
  for (let attempt = 0; ; attempt++) {
    if (app.exitCode !== null || attempt === 60) throw Error("Fixture app did not start: " + logs);
    try { if ((await fetch(origin + "/admin/login")).ok) break; } catch {}
    await delay(500);
  }
  browser = await chromium.launch({
    headless: true,
    ...(process.env.GRAVENAV_CHROME_PATH ? { executablePath: process.env.GRAVENAV_CHROME_PATH } : {}),
  });
  const cookie = { name: "sb-127-auth-token", value: "base64-" + encode(session), url: origin };
  const route = "/admin/reports";
  const unauthenticated = await fetch(origin + route + "/export", { redirect: "manual" });
  assert.match(unauthenticated.headers.get("location"), /\/admin\/login/);
  assert.equal(reads, 0);

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    for (const theme of ["light", "dark"]) {
      role = viewport.width === 390 ? "MANAGER" : "ADMIN";
      const context = await browser.newContext({ viewport, acceptDownloads: true });
      await context.route("**/*", (request) =>
        new URL(request.request().url()).hostname === "127.0.0.1" ? request.continue() : request.abort());
      await context.addCookies([cookie]);
      const page = await context.newPage();
      await page.addInitScript((mode) => {
        localStorage.setItem("gravenav-theme", mode);
        window.print = () => { document.documentElement.dataset.printInvoked = "true"; };
      }, theme);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const response = await page.goto(origin + route + "?year=2026");
      assert.equal(response.status(), 200);
      assert.match(response.headers()["cache-control"], /no-store/);
      await page.getByRole("heading", { name: "Reports & Analytics", exact: true }).waitFor();
      await page.waitForFunction((mode) => document.documentElement.dataset.theme === mode, theme);
      const metric = (label) => page.getByText(label, { exact: true }).first().locator("..").locator("dd").innerText();
      assert.equal(await metric("Physical lots"), "4,494");
      assert.equal(await metric("Pending records in period"), "100");
      assert.equal(await metric("Confirmed physical interments"), "0");
      assert.equal(await metric("Synthetic project plots"), "90");
      assert.equal(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth), true);
      assert.equal(await page.getByRole("heading", { name: "Coordinate verification", exact: true }).count(), 1);
      assert.match(await page.getByText("On hold", { exact: true }).locator("..").innerText(), /4,494/);

      await page.getByLabel("Garden or area").selectOption("2");
      await page.getByRole("button", { name: "Apply filters" }).press("Enter");
      await page.waitForURL("**/admin/reports?year=2026&area=2");
      assert.equal(await metric("Physical lots"), "0");
      await page.getByText("No current physical lots in this area.", { exact: true }).waitFor();
      const downloadReady = page.waitForEvent("download");
      await page.getByRole("link", { name: "Export 2026 CSV", exact: true }).click();
      const download = await downloadReady;
      const csv = await readFile(await download.path(), "utf8");
      assert.equal(download.suggestedFilename(), "gravenav-record-summary-2026.csv");
      assert.match(csv, /^burial_id,name,plot,section,status\r\n/);
      assert.ok(csv.includes("\"'=1+1\""));
      assert.doesNotMatch(csv, /Confirmed fixture/);
      assert.equal(csv.split("\r\n").length, 101);
      const badExport = await context.request.get(origin + route + "/export?year=2026&area=99");
      assert.equal(badExport.status(), 400);
      const exportResponse = await context.request.get(origin + route + "/export?year=all");
      assert.match(exportResponse.headers()["cache-control"], /private.*no-store/);
      assert.match(await exportResponse.text(), /Confirmed fixture/);

      await page.getByRole("button", { name: "Print report" }).click();
      assert.equal(await page.locator("html").getAttribute("data-print-invoked"), "true");
      await page.emulateMedia({ media: "print" });
      assert.equal(await page.locator(".admin-header").isVisible(), false);
      assert.equal(await page.locator(".admin-drawer").isVisible(), false);
      assert.equal(await page.getByRole("button", { name: "Apply filters" }).isVisible(), false);
      assert.equal(await page.getByRole("heading", { name: "Gardens and areas" }).isVisible(), true);
      assert.ok((await page.pdf({ format: "A4" })).length > 3000);
      await page.emulateMedia({ media: "screen" });

      await page.getByLabel("Interment year").selectOption("2025");
      await page.getByLabel("Garden or area").selectOption("1");
      await page.getByRole("button", { name: "Apply filters" }).click();
      await page.waitForURL("**/admin/reports?year=2025&area=1");
      assert.equal(await metric("Confirmed physical interments"), "1");
      assert.equal(await metric("Physical lots"), "4,494");
      assert.deepEqual(errors, []);
      console.log(`Reports passed at ${viewport.width}px in ${theme} as ${role}`);
      await context.close();
    }
  }

  const staff = await browser.newContext();
  await staff.addCookies([cookie]);
  active = false;
  const before = reads;
  for (const path of [route, route + "/export"]) {
    const denied = await staff.request.get(origin + path, { maxRedirects: 0 });
    assert.match(denied.headers()["location"], /\/admin\/unauthorized/);
  }
  active = true;
  role = "VISITOR";
  assert.match((await staff.request.get(origin + route + "/export", { maxRedirects: 0 }))
    .headers()["location"], /\/admin\/unauthorized/);
  assert.equal(reads, before);
  role = "ADMIN";
  truncate = true;
  const incomplete = await staff.request.get(origin + route + "/export");
  assert.equal(incomplete.status(), 503);
  const unavailable = await staff.request.get(origin + route);
  assert.match(await unavailable.text(), /Reports are temporarily unavailable/);
  console.log("Anonymous/inactive/visitor access blocked; incomplete reads fail closed.");
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  await browser?.close();
  app.kill();
  fixture.closeAllConnections();
  fixture.close();
}
