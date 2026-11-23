import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

function load(file, dependencies = {}) {
  const source = readFileSync(new URL("../" + file, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", output)((name) => {
    if (!(name in dependencies)) throw Error("Unexpected dependency: " + name);
    return dependencies[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}
const helpers = load("src/lib/burial-records.ts");
const row = {
  burial_id: 47, deceased_id: 9, lot_id: 12, revision: 4, interment_date: "2020-01-02",
  record_status: "active", interment_status: "PERMANENT", remains_type: "ASH",
  reference_no: "TEST-REF", service_provider: "Test provider", record_source: "Test source",
  quality_notes: "Private notes", interment_order_number: "TEST-ORDER", interment_confirmed: true,
};
function readers({ empty = false, referenceError = null, sexReadError = null } = {}) {
  const calls = [];
  const rows = {
    burial_record: empty ? [] : [row],
    deceased: [{ deceased_id: 9, display_name: "Test person", public_display: false,
      birth_date: "1900-01-01", death_date: "2020-01-01", sex: "female" }],
    lot: [{ lot_id: 12, lot_code: "TEST-INTERNAL", area_id: 1,
      coordinate_status: "pending", coordinate_verified: false }],
    area: [{ area_id: 1, area_name: "Test garden" }],
  };
  const client = {
    from(table) {
      calls.push(["from", table]);
      const chain = new Proxy({}, {
        get: (_, method) => method === "then"
          ? (resolve, reject) => Promise.resolve({ data: rows[table], count: rows[table].length })
            .then(resolve, reject)
          : method === "maybeSingle"
            ? async () => ({
              data: sexReadError ? null : rows[table][0],
              error: sexReadError,
            })
            : (...args) => { calls.push([method, ...args]); return chain; },
      });
      return chain;
    },
    async rpc(name, args) {
      calls.push(["rpc", name, args]);
      return { data: [{ lotId: "12", reference: "TEST SYNTHETIC REFERENCE" }], error: referenceError };
    },
  };
  return {
    calls,
    api: load("src/lib/supabase/admin-data.ts", {
      "./config": { getBrowserSupabase: () => client }, "./mutation-receipts": {},
    }),
  };
}

test("detail lookup targets the exact burial ID outside the directory page", async () => {
  const { api, calls } = readers();
  const record = await api.getAdminRecord("47");
  assert.ok(calls.some(([method, field, id]) => method === "eq" && field === "burial_id" && id === 47));
  assert.ok(calls.some(([method, field, value]) => method === "is" && field === "deleted_at" && value === null));
  assert.equal(record.burialId, 47);
  assert.equal(record.sex, "female");
  assert.equal(record.intermentConfirmed, true);
  assert.equal(record.intermentOrderNumber, "TEST-ORDER");
  assert.equal(record.syntheticPlotReference, "TEST SYNTHETIC REFERENCE");
  assert.equal(record.plot, "TEST-INTERNAL");
  assert.equal(record.coordinateVerified, false);
  assert.ok(!calls.some(([method]) => ["insert", "update", "delete"].includes(method)));
});

test("invalid and removed records never fall back to another person", async () => {
  const { api, calls } = readers({ empty: true });
  for (const id of ["0", "-1", "x", "1.2", "9007199254740993"]) {
    assert.equal(await api.getAdminRecord(id), null);
  }
  assert.equal(calls.length, 0);
  assert.equal(await api.getAdminRecord("47"), null);
  assert.ok(!calls.some(([method]) => method === "rpc"));
});

test("reference service failures remain errors; older readers retain existing records", async () => {
  await assert.rejects(
    readers({ referenceError: new Error("Unavailable references") }).api.getAdminRecord("47"),
    /Unavailable references/,
  );
  const record = await readers({ referenceError: { code: "PGRST202" } }).api.getAdminRecord("47");
  assert.equal(record.burialId, 47);
  assert.equal(record.syntheticPlotReference, undefined);
});

test("editing and directory status changes retain private fields, revision and confirmation", async () => {
  const record = await readers().api.getAdminRecord("47");
  const input = helpers.recordInputFromRecord(record, { recordStatus: "archived" });
  assert.equal(input.revision, 4);
  assert.equal(input.sex, "female");
  assert.equal(input.publicDisplay, false);
  assert.equal(input.recordStatus, "archived");
  assert.equal(input.intermentConfirmed, true);
  assert.equal(input.intermentOrderNumber, "TEST-ORDER");
  assert.equal(input.qualityNotes, "Private notes");
  assert.equal(input.recordSource, "Test source");
  assert.equal(input.lotId, 12);
});

test("record details still load before the optional sex column is migrated", async () => {
  const record = await readers({ sexReadError: { code: "42703" } }).api.getAdminRecord("47");
  assert.equal(record.burialId, 47);
  assert.equal(helpers.recordInputFromRecord(record).sex, undefined);
});

test("legacy unknown confirmation is preserved rather than converted into a reviewed fact", async () => {
  const record = await readers().api.getAdminRecord("47");
  const input = helpers.recordInputFromRecord({ ...record, intermentConfirmed: null });
  assert.equal(input.intermentConfirmed, undefined);
});

test("return links stay inside the burial directory", () => {
  assert.equal(helpers.safeBurialReturnTo("/admin/burial-records?query=test&page=2"),
    "/admin/burial-records?query=test&page=2");
  for (const value of [undefined, "//evil.test", "https://evil.test", "/admin/burial-records/new"]) {
    assert.equal(helpers.safeBurialReturnTo(value), "/admin/burial-records");
  }
});
