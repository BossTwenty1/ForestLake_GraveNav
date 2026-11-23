import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";
import { createTestDatabase } from "./database-helper.mjs";
import { gisLogin, seedGisFixtures } from "./gis-fixtures.mjs";

const nativeRequire = createRequire(import.meta.url);
function load(path, dependencies = {}, transform = (source) => source) {
  const output = ts.transpileModule(transform(readFileSync(path, "utf8")), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", output)((name) => {
    if (name === "server-only") return {};
    if (name in dependencies) return dependencies[name];
    if (name.startsWith("node:")) return nativeRequire(name);
    throw Error("Unexpected dependency " + name);
  }, loaded, loaded.exports);
  return loaded.exports;
}
// Exercise off-mode and active-control behavior independently of final enable/retire edits.
const core = load("src/lib/phase2-import.ts", {}, (source) => source
  .replace(/HOSTED_WRITES_ENABLED = (true|false)/, "HOSTED_WRITES_ENABLED = false")
  .replace(/IMPORT_CONTROL_RETIRED = (true|false)/, "IMPORT_CONTROL_RETIRED = false"));
const previewPath = "C:/Users/Nash/.codex/visualizations/2026/09/23/" +
  "01a0cedf-199e-7451-939a-f6477c900657/full-dataset-preparation-20261117/" +
  "full-dataset-import-preview.private.json";
const account = { account_id: core.PUGI_ID, username: "PUGI", role_name: "ADMIN",
  account_status: "ACTIVE", is_active: true };
const plan = core.validatePlan(JSON.parse(readFileSync(previewPath, "utf8")));
const clearance = () => ({ project: core.PROJECT, actorId: core.PUGI_ID,
  policy: core.POLICY, planHash: core.PLAN_HASH,
  inventorySqlHash: core.SQL_HASH, inventoryMigration: "20261117020000",
  inventorySqlApprovedAndApplied: true, importExecutionApproved: true,
  readOnlyPreflight: true, checkedAt: new Date().toISOString(),
  existingLotsHash: core.LOTS_HASH, existingAreasHash: core.AREAS_HASH });

test("foreground import makes 47 sequential five-save requests and stops without retries", async () => {
  const { runApprovedImport, approvedFirstRun } = load("src/components/admin/phase2-import-control.tsx", {
    react: nativeRequire("react"), "react/jsx-runtime": nativeRequire("react/jsx-runtime"),
    "@/components/ui/alert": {}, "@/components/ui/button": {}, "@/components/ui/page-heading": {},
  });
  const response = (completed) => ({ identity: { status: "VERIFIED" }, writesEnabled: true,
    executionStatus: completed === 235 ? "COMPLETE" : "READY",
    progress: { completed, total: 235, pending: false } });
  assert.equal(approvedFirstRun(response(0)), true);
  assert.equal(approvedFirstRun({ ...response(47), approvedStartAt: 47 }), true);
  assert.equal(approvedFirstRun({ ...response(47), approvedStartAt: 42 }), false);
  for (const value of [response(5), { ...response(0), writesEnabled: false },
    { ...response(0), executionStatus: "BLOCKED" },
    { ...response(0), identity: { status: "BLOCKED" } },
    { ...response(0), progress: { completed: 0, total: 235, pending: true } }]) {
    assert.equal(approvedFirstRun(value), false);
  }
  let calls = 0, published = 0;
  await runApprovedImport(0, async () => response(++calls * 5),
    (value) => { published = value.progress.completed; }, () => false);
  assert.equal(calls, 47);
  assert.equal(published, 235);
  calls = 0;
  await assert.rejects(runApprovedImport(0, async () => ++calls === 3
    ? { identity: { status: "BLOCKED" }, reason: "Save conflict" } : response(calls * 5),
  () => {}, () => false), /Save conflict/);
  assert.equal(calls, 3);
  calls = 0;
  await runApprovedImport(0, async () => response(++calls * 5), () => {}, () => calls >= 2);
  assert.equal(calls, 2);
  await assert.rejects(runApprovedImport(0, async () => response(6), () => {}, () => false), /unexpected/);
});

test("retired control stays unavailable even with a fresh local deadline", () => {
  const retired = load("src/lib/phase2-import.ts", {}, (source) => source
    .replace(/IMPORT_CONTROL_RETIRED = (true|false)/, "IMPORT_CONTROL_RETIRED = true"));
  const request = new Request("http://127.0.0.1:3237/admin/phase2-import", {
    headers: { host: "127.0.0.1:3237" },
  });
  assert.throws(() => retired.assertLocalRequest(request, { NODE_ENV: "development",
    GRAVENAV_LOCAL_PHASE2_IMPORT_UNTIL: new Date(Date.now() + 3600000).toISOString(),
  }), /disabled or expired/);
});

test("readiness authenticates the request client, never an unrelated connection, and never saves", async (t) => {
  const old = Object.fromEntries(["NODE_ENV", "VERCEL", "CI", "GRAVENAV_LOCAL_PHASE2_IMPORT_UNTIL"]
    .map((key) => [key, process.env[key]]));
  t.after(() => Object.entries(old).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }));
  process.env.NODE_ENV = "development";
  delete process.env.VERCEL;
  delete process.env.CI;
  process.env.GRAVENAV_LOCAL_PHASE2_IMPORT_UNTIL = new Date(Date.now() + 3600000).toISOString();
  let user = { id: core.PUGI_ID }, row = account, authError = null;
  let factoryCalls = 0, verification = null, inventoryPresent = false, completedImport = false;
  const completeJournal = { ...core.newJournal(), completed: plan.assignments.flatMap((group) => [
    ...(group.owner ? [group.owner] : []), group.lot, ...group.interments,
  ]).map((entry, index) => ({ requestId: entry.request_id, values: entry.values,
    receipt: { id: String(index + 1), revision: 1 } })) };
  const calls = [];
  const client = { auth: { getUser: async () => ({ data: { user }, error: authError }) },
    from: (table) => {
      assert.equal(table, "lot_owner");
      return { select: async () => ({ count: 45, error: null }) };
    },
    rpc: async (name, args) => {
      calls.push(name);
      if (name === "get_my_account") return { data: [row], error: null };
      if (name === "staff_dashboard_data") return {
        data: { summary: inventoryPresent ? { syntheticPlots: 0 } : {} }, error: null };
      if (completedImport && ["staff_burial_records", "staff_plot_management"].includes(name)) {
        return { data: { total: name === "staff_burial_records" ? 100 : 90,
          items: Array(name === "staff_plot_management" && args?.p_page === 2 ? 40 : 50).fill({}) },
        error: null };
      }
      if (inventoryPresent && ["staff_dashboard_counts", "staff_plot_management",
        "staff_coordinate_verification"].includes(name)) return { data: {}, error: null };
      throw Error("Readiness must not invoke a writer");
    } };
  const auth = load("src/lib/auth.ts", {
    "next/navigation": { redirect: () => { throw Error("redirect"); } },
    "./supabase/server": { getServerSupabase: () => { throw Error("Unrelated client factory used"); } },
  });
  const handler = load("src/app/api/admin/phase2-import/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/auth": auth,
    "@/lib/supabase/server": { getServerSupabase: async () => { factoryCalls++; return client; } },
    "@/lib/supabase/config": { localSupabaseConfig: { url: core.PROJECT_URL } },
    "@/lib/supabase/staff-visitor-preview": {
      getStaffVisitorPreview: async (id) => {
        assert.equal(completedImport, true);
        const row = completeJournal.completed.find((item) => item.receipt.id === id);
        return { record: { name: row.values.display_name, locationVerified: false, location: null },
          visible: false };
      },
    },
    "@/lib/supabase/gis-data": { getStaffGisReadiness: async (actorClient, args) => {
      assert.equal(actorClient, client);
      return { areaId: args.areaId, total: 0, counts: {}, releaseId: null };
    } },
    "@/lib/phase2-import": core,
    "@/lib/phase2-import-storage": {
      loadFixedPlan: async () => plan,
      loadJournal: async () => completedImport ? completeJournal : core.newJournal(),
      loadClearance: async () => null,
      persistVerification: async (value) => { verification = value; },
      persistJournal: () => { throw Error("Readiness must not write an import journal"); },
      withJournalLock: () => { throw Error("Writes must stay disabled"); },
    },
  });
  const request = (body = { action: "readiness" }, extra = {}) => new Request(
    "http://127.0.0.1:3237/api/admin/phase2-import", { method: "POST",
      headers: { host: "127.0.0.1:3237", origin: "http://127.0.0.1:3237",
        "content-type": "application/json", ...extra }, body: JSON.stringify(body) });
  await t.test("verified identity is checked through auth.getUser/get_my_account and requireStaff", async () => {
    const result = await handler.POST(request());
    const body = await result.json();
    assert.equal(result.status, 200);
    assert.equal(body.identity.status, "VERIFIED");
    assert.equal(body.identity.userId, core.PUGI_ID);
    assert.equal(body.identity.project, core.PROJECT);
    assert.equal(body.executionStatus, "BLOCKED");
    assert.equal(body.writesEnabled, false);
    assert.equal(factoryCalls, 1);
    assert.equal(verification.requestBound, true);
    assert.equal(result.headers.get("cache-control"), "no-store, private");
    assert.ok(!/access_token|refresh_token|password|cookie/i.test(JSON.stringify(body)));
    assert.ok(!calls.includes("staff_save_record"));
    const normalized = new Request("http://localhost:3237/api/admin/phase2-import", {
      method: "POST", headers: { host: "127.0.0.1:3237", origin: "http://127.0.0.1:3237",
        "content-type": "application/json" }, body: JSON.stringify({ action: "readiness" }),
    });
    assert.equal((await handler.POST(normalized)).status, 200);
  });
  await t.test("continue stays hard-disabled and caller-supplied enable flags are rejected", async () => {
    assert.equal((await handler.POST(request({ action: "continue" }))).status, 423);
    assert.equal((await handler.POST(request({ action: "continue", writesEnabled: true }))).status, 400);
    assert.equal((await handler.POST(request({ action: "readiness", project: "other" }))).status, 400);
    assert.ok(!calls.includes("staff_save_record"));
  });
  await t.test("post-migration verification reads all five definitions through the same actor client", async () => {
    inventoryPresent = true;
    const result = await handler.POST(request());
    assert.equal(result.status, 200);
    assert.equal(Object.keys(verification.readerChecks).filter((key) => key !== "checkedAt").length, 5);
    assert.equal(verification.writesEnabled, false);
    assert.equal(verification.readerChecks.staff_gis_readiness.length, 2);
    assert.ok(!calls.includes("staff_save_record"));
    inventoryPresent = false;
  });
  await t.test("completed import checks both directory pages and private previews without saving", async () => {
    inventoryPresent = true;
    completedImport = true;
    const result = await handler.POST(request());
    assert.equal(result.status, 200);
    assert.equal(verification.postImportChecks.owners, 45);
    assert.equal(verification.postImportChecks.records, 100);
    assert.equal(verification.postImportChecks.syntheticPlots, 90);
    assert.equal(verification.postImportChecks.previews.length, 3);
    assert.ok(!calls.includes("staff_save_record"));
    completedImport = false;
    inventoryPresent = false;
  });
  await t.test("unsigned, different, inactive and unauthorized accounts fail closed", async () => {
    user = null;
    assert.equal((await handler.POST(request())).status, 401);
    user = { id: "different-user" };
    assert.equal((await handler.POST(request())).status, 403);
    user = { id: core.PUGI_ID };
    for (const patch of [{ role_name: "MANAGER" }, { is_active: false },
      { account_status: "SUSPENDED" }, { username: "Other" }, { account_id: "different" }]) {
      row = { ...account, ...patch };
      assert.equal((await handler.POST(request())).status, 403);
    }
    row = account;
    authError = Error("unverified session");
    assert.equal((await handler.POST(request())).status, 401);
    authError = null;
    await assert.rejects(core.verifyPugi(client, "https://other.supabase.co"), /approved project/);
  });
  await t.test("cross-origin, bearer-injected, remote, expired and production requests are blocked", async () => {
    for (const headers of [{ origin: "http://unrelated.test" }, { authorization: "unrelated" },
      { host: "remote.example:3237" }, { "x-forwarded-host": "remote.example" }]) {
      assert.notEqual((await handler.POST(request(undefined, headers))).status, 200);
    }
    process.env.GRAVENAV_LOCAL_PHASE2_IMPORT_UNTIL = "2000-01-01T00:00:00Z";
    assert.equal((await handler.POST(request())).status, 404);
    process.env.GRAVENAV_LOCAL_PHASE2_IMPORT_UNTIL = new Date(Date.now() + 3600000).toISOString();
    process.env.NODE_ENV = "production";
    assert.equal((await handler.POST(request())).status, 404);
    process.env.NODE_ENV = "development";
  });
});

test("private checkpoints are synced before atomic replacement and concurrent batches are denied", async () => {
  const files = new Map(), events = [];
  const storage = load("src/lib/phase2-import-storage.ts", {
    "./phase2-import": core,
    "node:fs/promises": {
      mkdir: async () => {},
      readFile: async (path) => {
        if (!files.has(path)) throw Object.assign(Error("missing"), { code: "ENOENT" });
        return files.get(path);
      },
      open: async (path, flags, mode) => {
        assert.equal(mode, 0o600);
        if (flags === "wx" && files.has(path)) throw Object.assign(Error("locked"), { code: "EEXIST" });
        files.set(path, "");
        return {
          writeFile: async (value) => { files.set(path, value); events.push("write"); },
          sync: async () => { events.push("sync"); },
          close: async () => { events.push("close"); },
        };
      },
      rename: async (from, to) => { files.set(to, files.get(from)); files.delete(from); events.push("rename"); },
      unlink: async (path) => { files.delete(path); },
    },
  });
  await storage.persistJournal(core.newJournal());
  assert.deepEqual(events, ["write", "sync", "close", "rename"]);
  assert.deepEqual(await storage.loadJournal(plan), core.newJournal());
  let release, entered;
  const ready = new Promise((resolve) => { entered = resolve; });
  const wait = new Promise((resolve) => { release = resolve; });
  const first = storage.withJournalLock(async () => { entered(); await wait; });
  await ready;
  await assert.rejects(storage.withJournalLock(async () => {}), /batch is active/);
  release();
  await first;
  assert.ok(![...files.keys()].some((path) => path.endsWith("execution.lock")));
});

test("a rejected save or malformed receipt retains the exact pending request and stops", async () => {
  for (const reply of [
    { data: null, error: { code: "P0001", message: "Revision conflict" } },
    { data: { id: "unexpected", revision: 0 }, error: null },
  ]) {
    let checkpoint = core.newJournal();
    const calls = [];
    const client = {
      auth: { getUser: async () => ({ data: { user: { id: core.PUGI_ID } }, error: null }) },
      rpc: async (name, args) => {
        if (name === "get_my_account") return { data: [account], error: null };
        if (name === "staff_dashboard_data") return { data: { summary: { syntheticPlots: 0 } }, error: null };
        assert.equal(name, "staff_save_record");
        calls.push(args);
        return reply;
      },
      from: (table) => ({ select: async () => ({ count: table === "lot" ? 4494 : 0, error: null }) }),
    };
    await assert.rejects(core.executeBoundedBatch(client, plan, core.newJournal(),
      async (value) => { checkpoint = structuredClone(value); }, clearance()), /rejected|receipt is unexpected/);
    assert.equal(calls.length, 1);
    assert.equal(checkpoint.completed.length, 0);
    assert.equal(checkpoint.pending.requestId, plan.assignments[0].owner.request_id);
    assert.equal(calls[0].p_request_id, checkpoint.pending.requestId);
    core.validateJournal(plan, checkpoint);
  }
});

test("fixed executor preserves protected attribution, partial commits and exact recovery", async (t) => {
  // Disposable role fixtures only; never a substitute for the live application identity check.
  const db = await createTestDatabase();
  t.after(() => db.close());
  await seedGisFixtures(db);
  await db.query("insert into auth.users values($1)", [core.PUGI_ID]);
  await db.query(`insert into public.account(account_id,role_id,username,is_active,account_status,approved_at)
    select $1,role_id,'PUGI',true,'ACTIVE',now() from public.role where role_name='ADMIN'`, [core.PUGI_ID]);
  await db.exec(`insert into public.area(area_id,site_id,area_code,area_name,area_category) values
    (5,1,'BPG','Butterfly Palm Garden','garden'),(6,1,'MPG','Majestic Palm Garden','garden');
    insert into public.lot(area_id,lot_code,status)
    select 5,'UNRELATED-'||n,'HOLD' from generate_series(1,4494) n;`);
  await gisLogin(db, core.PUGI_ID);
  const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0].result;
  const inspect = async (sql, args = []) => {
    await gisLogin(db, core.PUGI_ID, "postgres");
    try { return await scalar(sql, args); }
    finally { await gisLogin(db, core.PUGI_ID); }
  };
  const baseline = await scalar("select jsonb_agg(to_jsonb(l) order by lot_id) result from public.lot l");
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: core.PUGI_ID } }, error: null }) },
    rpc: async (name, args) => {
      if (name === "get_my_account") return { data: [account], error: null };
      if (name === "staff_dashboard_data") return {
        data: await scalar("select public.staff_dashboard_data() result"), error: null };
      assert.equal(name, "staff_save_record");
      try { return { data: await scalar(
        "select public.staff_save_record($1,$2,$3,$4::jsonb,$5,$6) result",
        [args.p_entity,args.p_id,args.p_revision,JSON.stringify(args.p_values),args.p_request_id,args.p_operation]),
      error: null }; } catch (error) { return { data: null, error }; }
    },
    from: (table) => ({ select: async () => ({
      count: await scalar('select count(*)::int result from public.' + table), error: null,
    }) }),
  };
  let disk = structuredClone(core.newJournal()), failAfterCommit = true;
  const persist = async (value) => {
    if (failAfterCommit && value.completed.length === 1) {
      failAfterCommit = false;
      throw Error("Simulated process interruption after committed save");
    }
    disk = structuredClone(value);
  };
  await t.test("missing/stale clearance, changed plans and wrong journals make no saves", async () => {
    await assert.rejects(core.executeBoundedBatch(client, plan, core.newJournal(), persist, null), /approval/);
    await assert.rejects(core.executeBoundedBatch(client, plan, core.newJournal(), persist,
      { ...clearance(), checkedAt: "2000-01-01T00:00:00Z" }), /refreshed/);
    for (const patch of [{ actorId: "other" }, { policy: "other" }]) {
      assert.throws(() => core.assertClearance({ ...clearance(), ...patch }), /approval/);
    }
    const changed = structuredClone(plan);
    changed.assignments[0].lot.values.status = "HOLD";
    assert.throws(() => core.validatePlan(changed), /plan changed/);
    assert.throws(() => core.validateJournal(plan, { ...core.newJournal(), actorId: "other" }), /another actor/);
    assert.equal(await inspect("select count(*)::int result from public.staff_mutation"), 0);
  });
  await t.test("an unknown committed result replays the exact write-ahead request", async () => {
    await assert.rejects(core.executeBoundedBatch(client, plan, structuredClone(disk), persist,
      clearance()), /Simulated process interruption/);
    assert.equal(disk.completed.length, 0);
    assert.ok(disk.pending);
    assert.equal(await inspect("select count(*)::int result from public.staff_mutation"), 1);
    await core.executeBoundedBatch(client, plan, structuredClone(disk), persist, clearance());
    assert.equal(disk.completed.length, 5);
    assert.equal(await inspect("select count(*)::int result from public.staff_mutation"), 5);
  });
  await t.test("all 235 requests complete with truthful actor attribution and no duplicates", async () => {
    while (disk.completed.length < 235) {
      const before = disk.completed.length;
      await core.executeBoundedBatch(client, plan, structuredClone(disk), persist, clearance());
      assert.ok(disk.completed.length - before <= 5);
    }
    const counts = await inspect(`select jsonb_build_object(
      'receipts',(select count(*) from public.staff_mutation),
      'wrong_actor',(select count(*) from public.staff_mutation where actor_id<>$1::uuid),
      'wrong_audit_actor',(select count(*) from public.audit_log where table_name in
        ('lot_owner','deceased','burial_record') and actor_account_id is distinct from $1::uuid),
      'owners',(select count(*) from public.lot_owner),
      'samples',(select count(*) from public.lot where lot_code like 'P2S-%'),
      'unowned',(select count(*) from public.lot where lot_code like 'P2S-%' and lot_owner_id is null),
      'people',(select count(*) from public.deceased),
      'private_pending',(select count(*) from public.burial_record b join public.deceased d using(deceased_id)
        where b.record_status='pending' and not b.interment_confirmed and not d.public_display),
      'shared',(select count(*) from (select lot_id from public.burial_record group by lot_id having count(*)=2)s)
    ) result`, [core.PUGI_ID]);
    assert.deepEqual(counts, { receipts: 235, wrong_actor: 0, wrong_audit_actor: 0,
      owners: 45, samples: 90, unowned: 45, people: 100, private_pending: 100, shared: 10 });
    assert.deepEqual(await scalar("select jsonb_agg(to_jsonb(l) order by lot_id) result from public.lot l where lot_code like 'UNRELATED-%'"), baseline);
    await core.executeBoundedBatch(client, plan, structuredClone(disk), persist, clearance());
    assert.equal(await inspect("select count(*)::int result from public.staff_mutation"), 235);
    assert.equal(await scalar("select count(*)::int result from public.public_burial_records"), 0);
  });
});
