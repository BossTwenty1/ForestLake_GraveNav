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
  aud: "authenticated", role: "authenticated", email: "owner-test@example.invalid",
};
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const token = encode({ alg: "HS256", typ: "JWT" }) + "." +
  encode({ sub: user.id, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 }) +
  ".test-only-signature";
const session = {
  access_token: token, refresh_token: "isolated-test-refresh", token_type: "bearer",
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user,
};
let role = "ADMIN", active = true, failReads = false, rejectSave = false;
const owners = Array.from({ length: 21 }, (_, index) => ({
  lot_owner_id: index + 1, revision: 1, first_name: "Test", middle_name: null,
  last_name: "Owner " + String(index + 1).padStart(2, "0"), suffix: null, aliases: null,
  address: "Isolated test address", representative_name: null, representative_contact: null,
  representative_relation: null,
}));
const writes = [], receipts = new Map();
const fixture = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  const endpoint = url.pathname.split("/").at(-1);
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
  let data, status = 200, total;
  if (endpoint === "user") data = user;
  else if (endpoint === "get_my_account") {
    data = [{ account_id: user.id, username: "Test Clerk", role_name: role,
      account_status: active ? "ACTIVE" : "PENDING", is_active: active }];
  } else if (failReads) { data = { message: "Isolated read failure" }; status = 503; }
  else if (endpoint === "lot_owner") {
    let rows = owners;
    if (url.searchParams.has("lot_owner_id")) {
      rows = rows.filter((row) => String(row.lot_owner_id) === url.searchParams.get("lot_owner_id").slice(3));
    }
    const term = url.searchParams.get("or")?.match(/ilike\.\*([^*]*)\*/)?.[1]?.toLowerCase();
    if (term) rows = rows.filter((row) =>
      [row.first_name, row.last_name, row.aliases].some((value) => value?.toLowerCase().includes(term)));
    total = rows.length;
    const offset = Number(url.searchParams.get("offset") || 0);
    const limit = Number(url.searchParams.get("limit") || 20);
    data = rows.slice(offset, offset + limit);
    if (request.headers.accept?.includes("vnd.pgrst.object")) data = data[0] || null;
  } else if (endpoint === "lot") {
    data = url.searchParams.get("lot_owner_id") === "eq.1"
      ? [{ lot_id: 11, lot_code: "TEST-INTERNAL", status: "UNKNOWN", area: { area_name: "Test Garden" } }]
      : [];
    total = data.length;
  } else if (endpoint === "burial_record") {
    data = url.searchParams.get("lot.lot_owner_id") === "eq.1"
      ? [{ burial_id: 8, interment_date: "2020-01-01", record_status: "pending",
        deceased: { display_name: "Test Interment" }, lot: { lot_code: "TEST-INTERNAL" } }] : [];
    total = data.length;
  } else if (endpoint === "staff_save_record") {
    writes.push(body);
    assert.equal(body.p_entity, "lot_owner");
    if (receipts.has(body.p_request_id)) data = receipts.get(body.p_request_id);
    else if (rejectSave || !active || body.p_operation !== "save") {
      data = { message: "Isolated save rejected" }; status = 409;
    } else {
      let row = owners.find((owner) => String(owner.lot_owner_id) === body.p_id);
      if (row && row.revision !== body.p_revision) {
        data = { message: "Record changed; reload before saving" }; status = 409;
      } else {
        if (!row) {
          row = { lot_owner_id: owners.length + 1, revision: 0 };
          owners.push(row);
        }
        Object.assign(row, body.p_values, { revision: row.revision + 1 });
        data = { id: String(row.lot_owner_id), revision: row.revision };
        receipts.set(body.p_request_id, data);
      }
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
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 },
      isMobile: mobile, hasTouch: mobile,
    });
    await context.addInitScript((theme) => localStorage.setItem("gravenav-theme", theme), theme);
    await context.route("**/*", (route) => {
      const hostname = new URL(route.request().url()).hostname;
      return ["127.0.0.1", "localhost"].includes(hostname) ? route.continue() : route.abort();
    });
    await context.addCookies([{
      name: "sb-127-auth-token", value: "base64-" + encode(session), url: origin,
    }]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin + "/admin/owner-data");
    await page.getByRole("heading", { name: "Plot Owners", exact: true }).waitFor();
    await page.getByRole("link", { name: "View", exact: true }).first().waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.GRAVENAV_QA_DIR) await page.screenshot({
      path: process.env.GRAVENAV_QA_DIR + (mobile ? "/directory-mobile.png" : "/directory-desktop.png"),
      fullPage: true,
    });
    await page.getByRole("link", { name: "Next", exact: true }).click();
    await page.getByText("Page 2", { exact: true }).waitFor();
    await page.getByLabel("Search plot owners", { exact: true }).fill("Owner 01");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("link", { name: "View", exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: "View", exact: true }).count(), 1);
    await page.getByRole("link", { name: "View", exact: true }).click();
    await page.getByText("Internal Lot Code: TEST-INTERNAL", { exact: true }).first().waitFor();
    await page.getByRole("link", { name: /Test Interment/ }).waitFor();
    assert.equal(await page.getByRole("button", { name: /Link|Assign/ }).count(), 0);
    await page.goto(origin + "/admin/owner-data/new");
    await page.getByLabel("First name *", { exact: true }).fill("Browser");
    await page.getByLabel("Last name *", { exact: true }).fill(mobile ? "Mobile" : "Desktop");
    await page.getByLabel("Address *", { exact: true }).fill("Isolated browser test address");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.GRAVENAV_QA_DIR) await page.screenshot({
      path: process.env.GRAVENAV_QA_DIR + (mobile ? "/form-mobile.png" : "/form-desktop.png"),
      fullPage: true,
    });
    rejectSave = true;
    await page.getByRole("button", { name: "Save Plot Owner", exact: true }).click();
    await page.getByText("Isolated save rejected").waitFor();
    assert.equal(await page.getByLabel("First name *", { exact: true }).inputValue(), "Browser");
    rejectSave = false;
    await page.getByRole("button", { name: "Save Plot Owner", exact: true }).click();
    await page.waitForURL(/\/admin\/owner-data\/\d+$/);
    await page.getByText("No associated plots yet.", { exact: true }).waitFor();
    await page.getByText("No related interments.", { exact: true }).waitFor();
    await page.getByRole("link", { name: "Edit Plot Owner", exact: true }).click();
    await page.getByLabel("Aliases", { exact: true }).fill("Updated alias");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.waitForURL(/\/admin\/owner-data\/\d+$/);
    await page.getByText("Updated alias", { exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.GRAVENAV_QA_DIR) await page.screenshot({
      path: process.env.GRAVENAV_QA_DIR + (mobile ? "/owner-mobile.png" : "/owner-desktop.png"),
      fullPage: true,
    });
    await page.goto(origin + "/admin/owner-data/999");
    await page.getByText("Plot owner not found", { exact: true }).waitFor();
    failReads = true;
    await page.goto(origin + "/admin/owner-data");
    await page.getByText("Isolated read failure", { exact: true }).waitFor();
    failReads = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByRole("link", { name: "View", exact: true }).first().waitFor();
    assert.deepEqual(errors, []);
    console.log((mobile ? "Mobile MANAGER" : "Desktop ADMIN") + ": search, pagination, relationships, registration, redirect, edit, failure/retry and layout passed");
    await context.close();
  }
  const anonymous = await browser.newContext();
  const page = await anonymous.newPage();
  await page.goto(origin + "/admin/owner-data/new");
  assert.ok(page.url().includes("/admin/login"));
  await anonymous.close();
  active = false;
  const inactive = await browser.newContext();
  await inactive.addCookies([{
    name: "sb-127-auth-token", value: "base64-" + encode(session), url: origin,
  }]);
  const inactivePage = await inactive.newPage();
  await inactivePage.goto(origin + "/admin/owner-data/1/edit");
  assert.ok(inactivePage.url().includes("/admin/unauthorized"));
  await inactive.close();
  assert.ok(writes.every((write) => write.p_entity === "lot_owner"));
  console.log("Anonymous/inactive route guards passed; all fixture writes targeted lot_owner only.");
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  await browser?.close();
  app.kill();
  fixture.closeAllConnections();
  await new Promise((resolve) => fixture.close(resolve));
}
