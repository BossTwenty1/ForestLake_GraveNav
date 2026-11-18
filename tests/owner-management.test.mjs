import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { createTestDatabase } from "./database-helper.mjs";
import { gisActors, gisLogin, seedGisFixtures } from "./gis-fixtures.mjs";

function loadReaders(response) {
  const calls = [];
  const chain = new Proxy({}, {
    get: (_, method) => method === "then"
      ? (resolve, reject) => Promise.resolve(response).then(resolve, reject)
      : (...args) => { calls.push([method, ...args]); return chain; },
  });
  const client = { from: (...args) => { calls.push(["from", ...args]); return chain; } };
  const source = readFileSync(new URL("../src/lib/supabase/admin-data.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", output)((name) => {
    if (name === "./config") return { getBrowserSupabase: () => client };
    if (name === "./mutation-receipts") return {};
    throw Error("Unexpected dependency: " + name);
  }, loaded, loaded.exports);
  return { readers: loaded.exports, calls };
}

test("owner search uses the existing bounded private reader and retains revisions", async () => {
  const { readers, calls } = loadReaders({ data: [{
    lot_owner_id: 7, revision: 3, first_name: "Test", last_name: "Owner", address: "Test address",
  }], count: 42 });
  const result = await readers.getOwnerRecordsPage({ search: "Owner,(x)", page: 1, pageSize: 20 });
  assert.equal(result.items[0].revision, 3);
  assert.equal(result.items[0].lotOwnerId, 7);
  assert.equal(result.hasMore, true);
  assert.ok(calls.some(([method, field, value]) => method === "is" && field === "deleted_at" && value === null));
  assert.ok(calls.some(([method, from, to]) => method === "range" && from === 20 && to === 39));
  const filter = calls.find(([method]) => method === "or")[1];
  assert.ok(filter.includes("first_name.ilike.*Ownerx*"));
  assert.ok(filter.includes("aliases.ilike.*Ownerx*"));
});

test("invalid owner IDs never query the database; unavailable owners stay absent", async () => {
  const { readers, calls } = loadReaders({ data: null, error: null });
  for (const id of ["0", "-1", "1.5", "x", "9007199254740993"]) {
    assert.equal(await readers.getOwnerRecord(id), null);
  }
  assert.equal(calls.length, 0);
  assert.equal(await readers.getOwnerRecord("12"), null);
  assert.ok(calls.some(([method, key, id]) => method === "eq" && key === "lot_owner_id" && id === 12));
});

test("relationship readers are bounded, owner-filtered and read-only", async () => {
  const { readers, calls } = loadReaders({ data: [], count: 0, error: null });
  assert.deepEqual((await readers.getOwnerPlots(7)).items, []);
  assert.deepEqual((await readers.getOwnerInterments(7, 2)).items, []);
  assert.ok(calls.some(([method, key, id]) => method === "eq" && key === "lot_owner_id" && id === 7));
  assert.ok(calls.some(([method, key, id]) => method === "eq" && key === "lot.lot_owner_id" && id === 7));
  assert.ok(calls.some(([method, key]) => method === "is" && key === "lot.deleted_at"));
  assert.ok(calls.some(([method, from, to]) => method === "range" && from === 40 && to === 59));
  assert.ok(!calls.some(([method]) => ["insert", "update", "delete", "upsert"].includes(method)));
});

test("relationship failures are not presented as empty associations", async () => {
  const { readers } = loadReaders({ data: null, error: new Error("Permission denied") });
  await assert.rejects(readers.getOwnerPlots(7), /Permission denied/);
  await assert.rejects(readers.getOwnerInterments(7), /Permission denied/);
});

test("protected owner registration and editing preserve roles, receipts, revisions and plots", async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  await seedGisFixtures(db);
  await gisLogin(db);
  const request = randomUUID();
  const values = { first_name: "Fictional", last_name: "Owner", address: "Isolated test address" };
  const save = async (id, revision, input, requestId = randomUUID()) =>
    (await db.query(
      "select public.staff_save_record('lot_owner',$1,$2,$3::jsonb,$4,'save') result",
      [id, revision, JSON.stringify(input), requestId],
    )).rows[0].result;
  const owner = await save(null, null, values, request);
  assert.equal((await db.query("select count(*)::int n from public.lot where lot_owner_id=$1", [owner.id])).rows[0].n, 0);
  assert.deepEqual(await save(null, null, values, request), owner);
  await gisLogin(db, gisActors.admin, "postgres");
  await db.query("insert into public.lot(area_id,lot_code,lot_owner_id) values(1,'OWNER-TEST',$1)", [owner.id]);
  const before = (await db.query("select to_jsonb(l) row from public.lot l where lot_code='OWNER-TEST'")).rows;
  await gisLogin(db, gisActors.manager);
  const edited = await save(owner.id, owner.revision, { ...values, aliases: "Clerk test alias" });
  assert.equal(edited.revision, owner.revision + 1);
  await assert.rejects(save(owner.id, owner.revision, values), /changed|revision|reload/i);
  await assert.rejects(db.query("update public.lot_owner set address='bypass' where lot_owner_id=$1", [owner.id]), /permission denied/i);
  const after = (await db.query("select to_jsonb(l) row from public.lot l where lot_code='OWNER-TEST'")).rows;
  assert.deepEqual(after, before);
  await gisLogin(db, gisActors.inactive);
  await assert.rejects(save(owner.id, edited.revision, values), /active|staff|permission/i);
  await gisLogin(db, null, "anon");
  await assert.rejects(save(null, null, values), /permission|staff/i);
  await assert.rejects(db.query("select * from public.lot_owner"), /permission denied/i);
});
