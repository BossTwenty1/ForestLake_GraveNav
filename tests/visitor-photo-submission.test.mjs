import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/app/api/gravesite/photos/submit/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function handler({ lookup = { data: { burial_id: 95 }, error: null }, insertError = null } = {}) {
  const calls = { uploads: 0, inserts: [], removals: 0 };
  const client = {
    from(table) {
      if (table === "site_settings") return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      };
      if (table === "public_burial_records") return {
        select(columns) {
          assert.equal(columns, "burial_id");
          return { eq: () => ({ maybeSingle: async () => lookup }) };
        },
      };
      assert.equal(table, "photo");
      return {
        select: () => ({ eq: () => ({ in: async () => ({ data: [], error: null }) }) }),
        insert: async row => { calls.inserts.push(row); return { error: insertError }; },
      };
    },
    storage: { from: () => ({
      upload: async () => { calls.uploads++; return { error: null }; },
      remove: async () => { calls.removals++; return { error: null }; },
    }) },
  };
  const dependencies = {
    "node:crypto": { randomUUID: () => "00000000-0000-4000-8000-000000000001" },
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/supabase/server-admin": { getServerServiceSupabase: () => client },
    "@/lib/visitor-photo-security": {
      checkVisitorUploadRateLimit: () => ({ allowed: true }),
      inspectAndSanitizeImage: bytes => ({ ok: true, bytes, mimeType: "image/png", extension: "png" }),
      MAX_TRIBUTE_PHOTOS_PER_MEMORIAL: 5,
      MAX_VISITOR_PHOTO_BYTES: 3 * 1024 * 1024,
      sanitizeVisitorSubmissionFields: () => ({
        ok: true, kind: "portrait", name: "Test Visitor", relation: "Family",
        contact: "visitor@example.invalid", caption: "Portrait request",
      }),
    },
  };
  const loaded = { exports: {} };
  new Function("require", "exports", compiled)(name => {
    assert.ok(name in dependencies, name);
    return dependencies[name];
  }, loaded.exports);
  return { post: loaded.exports.POST, calls };
}

async function request(post) {
  const original = process.env.NEXT_PUBLIC_SUPABASE_PHOTOS_BUCKET;
  process.env.NEXT_PUBLIC_SUPABASE_PHOTOS_BUCKET = "burial-photos";
  try {
    const body = new FormData();
    body.set("burialId", "95");
    body.set("consent", "true");
    body.set("file", new File([new Uint8Array([1, 2, 3])], "portrait.png"));
    return await post(new Request("http://localhost/api/gravesite/photos/submit", { method: "POST", body }));
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PHOTOS_BUCKET;
    else process.env.NEXT_PUBLIC_SUPABASE_PHOTOS_BUCKET = original;
  }
}

test("lookup permission failures return 503 without exposing errors or uploading a photo", async () => {
  const { post, calls } = handler({ lookup: { data: null, error: { message: "permission denied for view" } } });
  const response = await request(post);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /registry could not be reached/);
  assert.equal(calls.uploads, 0);
  assert.equal(calls.inserts.length, 0);
});

test("missing or unpublished memorials return 404 without uploading", async () => {
  const { post, calls } = handler({ lookup: { data: null, error: null } });
  const response = await request(post);
  assert.equal(response.status, 404);
  assert.equal(calls.uploads, 0);
});

test("successful portrait requests stay pending, hidden and keep contact out of the response", async () => {
  const { post, calls } = handler();
  const response = await request(post);
  const result = await response.json();
  assert.equal(response.status, 201);
  assert.equal(calls.uploads, 1);
  assert.equal(calls.inserts.length, 1);
  const row = calls.inserts[0];
  assert.equal(row.approval_status, "pending");
  assert.equal(row.public_display, false);
  assert.equal(row.uploaded_by, null);
  assert.equal(row.submitted_by_contact, "visitor@example.invalid");
  assert.equal(result.slots.portraitPending, 1);
  assert.equal(result.slots.canSubmitPortrait, false);
  assert.doesNotMatch(JSON.stringify(result), /visitor@example|submitted_by_contact|storage_path/);
});

test("metadata failures clean up uploaded objects and never report success", async () => {
  const { post, calls } = handler({ insertError: { message: "permission denied" } });
  const response = await request(post);
  assert.equal(response.status, 500);
  assert.equal(calls.removals, 1);
});
