import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { createTestDatabase } from "./database-helper.mjs";
import { gisActors, gisLogin, seedGisFixtures } from "./gis-fixtures.mjs";

const actorId = "e0000000-0000-4000-8000-000000000001";
const targetId = "e0000000-0000-4000-8000-000000000002";
const origin = "https://staff.example.test";

function loadTs(file, imports) {
  const source = readFileSync(new URL("../src/" + file, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  new Function("require", "exports", outputText)(name => {
    assert.ok(name in imports, "Unexpected route dependency: " + name);
    return imports[name];
  }, exports);
  return exports;
}

function makeRequest(body, { from = origin, type = "application/json" } = {}) {
  return new Request(origin + "/api/admin/accounts/remove", {
    method: "POST",
    headers: { origin: from, "content-type": type },
    body: JSON.stringify(body),
  });
}

function buildRemoveRoute({
  staff = { accountId: actorId, role: "SUPER_ADMIN", accountStatus: "ACTIVE", isActive: true },
  canDeleteRpc = staff?.role === "SUPER_ADMIN" && staff?.isActive && staff?.accountStatus === "ACTIVE",
  beginResponse = { data: { state: "delete_auth", accountId: targetId, attemptId: "attempt-1", revision: 4, hasAuthUser: true }, error: null },
  deleteUserResponse = { data: { user: null }, error: null },
  deleteUserThrows = false,
  finishResponse = { data: { state: "completed", accountId: targetId, revision: 5 }, error: null },
  hasServiceClient = true,
} = {}) {
  const calls = [];
  const helper = loadTs("lib/supabase/staff-account-server.ts", {
    "server-only": {},
    "next/server": { NextResponse: { json: (value, init) => Response.json(value, init) } },
    "@/lib/auth": { getCurrentStaff: async () => staff },
    "@/lib/supabase/server": {
      getServerSupabase: async () => ({
        rpc: async name => {
          calls.push(["user_rpc", name]);
          return { data: canDeleteRpc, error: null };
        },
      }),
    },
    "./config": { localSupabaseConfig: { environment: "hosted" }, publicAppOrigin: origin },
  });

  const route = loadTs("app/api/admin/accounts/remove/route.ts", {
    "@/lib/supabase/staff-account-server": helper,
    "@/lib/supabase/server-admin": {
      getServerServiceSupabase: () => (hasServiceClient ? {
        rpc: async (name, args) => {
          calls.push([name, args]);
          if (name === "staff_begin_account_deletion") return beginResponse;
          assert.equal(name, "staff_finish_account_deletion");
          return finishResponse;
        },
        auth: {
          admin: {
            deleteUser: async (id, shouldSoftDelete) => {
              calls.push(["deleteUser", id, shouldSoftDelete]);
              if (deleteUserThrows) throw new Error("Private upstream timeout");
              return deleteUserResponse;
            },
          },
        },
      } : null),
    },
  }).POST;

  return { route, calls };
}

test("permanent staff account deletion enforces database authorization, preservation, recovery, and irreversibility", async t => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  await seedGisFixtures(db);

  const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.value;
  const asOwner = () => gisLogin(db, null, "postgres");
  const asService = () => gisLogin(db, null, "service_role");
  const revisionOf = async id => {
    await asOwner();
    return scalar("select revision value from public.account where account_id=$1", [id]);
  };

  // Trigger still prevents inserting an account row without an auth.users identity.
  await asOwner();
  await assert.rejects(
    db.query(
      "insert into public.account(account_id,role_id,username) select $1,role_id,'orphan-user' from public.role where role_name='MANAGER'",
      [randomUUID()],
    ),
    /valid authentication user/i,
  );

  // Before any Super Administrator exists, ADMIN still cannot permanently delete accounts.
  await gisLogin(db, gisActors.admin);
  assert.equal(await scalar("select public.can_permanently_delete_staff_accounts() value"), false);
  await assert.rejects(
    scalar("select public.staff_begin_account_deletion($1,$2,$3) value", [gisActors.admin, gisActors.manager, 1]),
    /permission denied/i,
  );

  await asService();
  await assert.rejects(
    scalar("select public.staff_begin_account_deletion($1,$2,$3) value", [gisActors.admin, gisActors.manager, 1]),
    /active Super Administrator/i,
  );

  // Bootstrap gisActors.admin as the first Super Administrator.
  await asOwner();
  await db.query(
    "update auth.users set email=$1, email_confirmed_at=now(), encrypted_password='hash' where id=$2",
    ["super1@example.test", gisActors.admin],
  );
  await db.query(
    "update auth.users set email=$1, email_confirmed_at=now(), encrypted_password='hash' where id=$2",
    ["admin2@example.test", gisActors.otherAdmin],
  );
  await db.query(
    "update auth.users set email=$1, email_confirmed_at=now(), encrypted_password='hash' where id=$2",
    ["manager1@example.test", gisActors.manager],
  );
  await scalar("select staff_private.bootstrap_super_admin($1) value", [gisActors.admin]);

  // Role authorization checks on can_permanently_delete_staff_accounts.
  await gisLogin(db, gisActors.admin);
  assert.equal(await scalar("select public.can_permanently_delete_staff_accounts() value"), true);
  await gisLogin(db, gisActors.otherAdmin);
  assert.equal(await scalar("select public.can_permanently_delete_staff_accounts() value"), false);
  await gisLogin(db, gisActors.manager);
  assert.equal(await scalar("select public.can_permanently_delete_staff_accounts() value"), false);
  await gisLogin(db, null, "anon");
  await assert.rejects(scalar("select public.can_permanently_delete_staff_accounts() value"), /permission denied/i);

  // Seed cemetery work (burial_record, photo, invitation, audit_log) owned by gisActors.manager.
  await asOwner();
  const managerEmail = "manager1@example.test";
  await db.exec(`
    with target_area as (select area_id from public.area order by area_id limit 1),
    new_lot as (
      insert into public.lot(area_id, lot_code, status)
      select area_id, 'DEL-TEST-001', 'AVAILABLE' from target_area
      returning lot_id
    ),
    new_deceased as (
      insert into public.deceased(display_name) values ('Fictional Memorial')
      returning deceased_id
    ),
    new_burial as (
      insert into public.burial_record(deceased_id, lot_id, created_by, updated_by, record_status, interment_status, remains_type)
      select d.deceased_id, l.lot_id, '${gisActors.manager}', '${gisActors.manager}', 'active', 'PERMANENT', 'FRESH'
      from new_deceased d cross join new_lot l
      returning burial_id
    )
    insert into public.photo(burial_id, uploaded_by, storage_path, file_name)
    select burial_id, '${gisActors.manager}', 'test/memorial.jpg', 'memorial.jpg' from new_burial;
    insert into public.audit_log(actor_account_id, action, table_name, record_id)
      values ('${gisActors.manager}', 'insert', 'burial_record', 'del-test-1');
    insert into staff_private.invitations(email, username, role_name, requested_by, account_id, delivery_status, sent_at)
      values ('${managerEmail}', 'fictional-manager', 'MANAGER', '${gisActors.admin}', '${gisActors.manager}', 'sent', now());
  `);

  // Self-deletion, non-Super-Admin actor, stale revision, and last-Super-Admin checks.
  const superRev = await revisionOf(gisActors.admin);
  const managerRev = await revisionOf(gisActors.manager);
  await asService();
  await assert.rejects(
    scalar("select public.staff_begin_account_deletion($1,$2,$3) value", [gisActors.admin, gisActors.admin, superRev]),
    /own account/i,
  );
  await assert.rejects(
    scalar("select public.staff_begin_account_deletion($1,$2,$3) value", [gisActors.otherAdmin, gisActors.manager, managerRev]),
    /active Super Administrator/i,
  );
  await assert.rejects(
    scalar("select public.staff_begin_account_deletion($1,$2,$3) value", [gisActors.manager, gisActors.otherAdmin, 1]),
    /active Super Administrator/i,
  );
  await assert.rejects(
    scalar("select public.staff_begin_account_deletion($1,$2,$3) value", [gisActors.admin, gisActors.manager, managerRev + 99]),
    /changed/i,
  );

  // Phase 1: begin deletion blocks access immediately before Auth deletion.
  const firstAttempt = await scalar(
    "select public.staff_begin_account_deletion($1,$2,$3) value",
    [gisActors.admin, gisActors.manager, managerRev],
  );
  assert.equal(firstAttempt.state, "delete_auth");
  assert.equal(firstAttempt.hasAuthUser, true);
  assert.ok(firstAttempt.revision > managerRev);

  // Target session is already blocked in RLS/RPC even before Auth user removal.
  await gisLogin(db, gisActors.manager);
  assert.equal(await scalar("select public.is_active_admin_or_manager() value"), false);

  // Duplicate in-flight call returns state='deleting' without issuing a second attempt.
  await asService();
  const inFlight = await scalar(
    "select public.staff_begin_account_deletion($1,$2,$3) value",
    [gisActors.admin, gisActors.manager, firstAttempt.revision],
  );
  assert.equal(inFlight.state, "deleting");

  // Safety check: finish refuses to mark complete if auth.users row still exists.
  const prematureFinish = await scalar(
    "select public.staff_finish_account_deletion($1,$2,$3,$4) value",
    [gisActors.admin, gisActors.manager, firstAttempt.attemptId, true],
  );
  assert.equal(prematureFinish.state, "auth_failed");
  await asOwner();
  assert.equal(await scalar("select deleted_at value from public.account where account_id=$1", [gisActors.manager]), null);

  // Failed/interrupted deletion stays visible in Staff Accounts as DELETING for retry.
  await gisLogin(db, gisActors.admin);
  const retryDetails = await scalar("select public.staff_account_details($1) value", [gisActors.manager]);
  assert.equal(retryDetails.account.status, "DELETING");
  assert.equal(retryDetails.account.deletionPending, true);

  // Simulate Auth failure recovery: retry begin -> remove auth.users row -> finish completes.
  await asService();
  const retryAttempt = await scalar(
    "select public.staff_begin_account_deletion($1,$2,$3) value",
    [gisActors.admin, gisActors.manager, prematureFinish.revision],
  );
  assert.equal(retryAttempt.state, "delete_auth");

  await asOwner();
  await db.query("delete from auth.users where id=$1", [gisActors.manager]);

  await asService();
  const completed = await scalar(
    "select public.staff_finish_account_deletion($1,$2,$3,$4) value",
    [gisActors.admin, gisActors.manager, retryAttempt.attemptId, true],
  );
  assert.equal(completed.state, "completed");

  // Duplicate call after completion is idempotent.
  const duplicateAfter = await scalar(
    "select public.staff_begin_account_deletion($1,$2,$3) value",
    [gisActors.admin, gisActors.manager, completed.revision],
  );
  assert.equal(duplicateAfter.state, "completed");

  // Verify personal details scrubbed, historical stub preserved, cemetery records & audit intact.
  await asOwner();
  const stub = (await db.query("select username, is_active, account_status, deleted_at from public.account where account_id=$1", [gisActors.manager])).rows[0];
  assert.match(stub.username, /^Deleted staff \([0-9a-f]{8}\)$/);
  assert.equal(stub.is_active, false);
  assert.equal(stub.account_status, "REVOKED");
  assert.ok(stub.deleted_at);
  assert.equal(await scalar("select count(*)::int value from staff_private.invitations where account_id=$1", [gisActors.manager]), 0);
  assert.equal(await scalar("select count(*)::int value from public.burial_record where created_by=$1", [gisActors.manager]), 1);
  assert.equal(await scalar("select count(*)::int value from public.photo where uploaded_by=$1", [gisActors.manager]), 1);
  assert.ok(await scalar("select count(*)::int value from public.audit_log where actor_account_id=$1", [gisActors.manager]) >= 1);

  const deletionAudit = (await db.query(
    "select actor_account_id, action, old_values, new_values from public.audit_log where table_name='account' and record_id=$1 and new_values->>'event'='account_deleted'",
    [gisActors.manager],
  )).rows[0];
  assert.equal(deletionAudit.actor_account_id, gisActors.admin);
  assert.equal(deletionAudit.action, "delete");
  assert.doesNotMatch(JSON.stringify(deletionAudit), new RegExp(managerEmail, "i"));

  // Permanently deleted account is absent from directory/details and cannot be restored.
  await gisLogin(db, gisActors.admin);
  const dirAfter = await scalar("select public.staff_account_directory() value");
  assert.equal(dirAfter.items.some(item => item.accountId === gisActors.manager), false);
  await assert.rejects(scalar("select public.staff_account_details($1) value", [gisActors.manager]), /unavailable/i);

  await asOwner();
  await assert.rejects(
    db.query("update public.account set is_active=true, account_status='ACTIVE', deactivated_at=null where account_id=$1", [gisActors.manager]),
    /cannot be restored or modified/i,
  );

  // Promote second Super Admin, verify deleting one works, and deleting the remaining last one fails.
  const otherRev = await revisionOf(gisActors.otherAdmin);
  await gisLogin(db, gisActors.admin);
  await scalar(
    "select public.staff_save_record('account',$1,$2,$3::jsonb,$4,'role') value",
    [gisActors.otherAdmin, otherRev, JSON.stringify({ value: "SUPER_ADMIN" }), randomUUID()],
  );

  const secondSuperRev = await revisionOf(gisActors.otherAdmin);
  await asService();
  const deleteSecond = await scalar(
    "select public.staff_begin_account_deletion($1,$2,$3) value",
    [gisActors.admin, gisActors.otherAdmin, secondSuperRev],
  );
  assert.equal(deleteSecond.state, "delete_auth");

  // Once gisActors.otherAdmin is blocked, it can no longer delete gisActors.admin (last active Super Admin + inactive actor).
  await assert.rejects(
    scalar("select public.staff_begin_account_deletion($1,$2,$3) value", [gisActors.otherAdmin, gisActors.admin, superRev]),
    /active Super Administrator/i,
  );
});

test("permanent deletion API route enforces Super Admin auth, CSRF, error privacy, and partial-failure recovery", async () => {
  for (const staff of [
    null,
    { accountId: actorId, role: "MANAGER", accountStatus: "ACTIVE", isActive: true },
    { accountId: actorId, role: "ADMIN", accountStatus: "ACTIVE", isActive: true },
    { accountId: actorId, role: "SUPER_ADMIN", accountStatus: "SUSPENDED", isActive: false },
    { accountId: actorId, role: "SUPER_ADMIN", accountStatus: "PENDING", isActive: false },
  ]) {
    const { route, calls } = buildRemoveRoute({ staff });
    assert.equal((await route(makeRequest({ accountId: targetId, revision: 3 }))).status, 403);
    assert.deepEqual(calls, []);
  }

  // DB RPC denial fails closed even if session claims SUPER_ADMIN.
  const deniedByDb = buildRemoveRoute({ canDeleteRpc: false });
  assert.equal((await deniedByDb.route(makeRequest({ accountId: targetId, revision: 3 }))).status, 403);
  assert.deepEqual(deniedByDb.calls, [["user_rpc", "can_permanently_delete_staff_accounts"]]);

  // Cross-origin, bad content-type, invalid payload, and self-deletion checks.
  const bad = buildRemoveRoute();
  assert.equal((await bad.route(makeRequest({ accountId: targetId, revision: 3 }, { from: "https://evil.test" }))).status, 400);
  assert.equal((await bad.route(makeRequest({ accountId: targetId, revision: 3 }, { type: "text/plain" }))).status, 400);
  assert.equal((await bad.route(makeRequest({ accountId: "not-a-uuid", revision: 3 }))).status, 400);
  assert.equal((await bad.route(makeRequest({ accountId: actorId, revision: 3 }))).status, 400);

  // Successful end-to-end route execution calls hard deleteUser(targetId, false) and finishes.
  const ok = buildRemoveRoute();
  const okRes = await ok.route(makeRequest({ accountId: targetId, revision: 3 }));
  assert.equal(okRes.status, 200);
  assert.match(okRes.headers.get("cache-control"), /no-store/);
  assert.deepEqual(await okRes.json(), { ok: true });
  assert.deepEqual(ok.calls[1], ["staff_begin_account_deletion", { p_actor: actorId, p_account_id: targetId, p_revision: 3 }]);
  assert.deepEqual(ok.calls[2], ["deleteUser", targetId, false]);
  assert.deepEqual(ok.calls[3], ["staff_finish_account_deletion", { p_actor: actorId, p_account_id: targetId, p_attempt_id: "attempt-1", p_auth_deleted: true }]);

  // Auth provider error: never claims success, records auth_failed, returns retryable 502 without leaking provider internals.
  const authFail = buildRemoveRoute({
    deleteUserThrows: true,
    finishResponse: { data: { state: "auth_failed", accountId: targetId, revision: 4 }, error: null },
  });
  const authFailRes = await authFail.route(makeRequest({ accountId: targetId, revision: 3 }));
  assert.equal(authFailRes.status, 502);
  const authFailBody = await authFailRes.json();
  assert.equal(authFailBody.retryable, true);
  assert.equal(authFailBody.revision, 4);
  assert.doesNotMatch(JSON.stringify(authFailBody), /Private upstream|attempt-1/i);
  assert.equal(authFail.calls[3][1].p_auth_deleted, false);

  // Recovery when Auth user was already removed in an interrupted prior attempt (404 / user_not_found).
  const alreadyGoneInAuth = buildRemoveRoute({
    deleteUserResponse: { data: { user: null }, error: { status: 404, code: "user_not_found", message: "User not found" } },
  });
  const recoveredRes = await alreadyGoneInAuth.route(makeRequest({ accountId: targetId, revision: 4 }));
  assert.equal(recoveredRes.status, 200);
  assert.equal(alreadyGoneInAuth.calls[3][1].p_auth_deleted, true);

  // DB finish failure returns retryable 502, never claims success.
  const finishFail = buildRemoveRoute({
    finishResponse: { data: null, error: { message: "Private SQL detail" } },
  });
  const finishFailRes = await finishFail.route(makeRequest({ accountId: targetId, revision: 3 }));
  assert.equal(finishFailRes.status, 502);
  const finishFailText = await finishFailRes.text();
  assert.doesNotMatch(finishFailText, /Private SQL detail/);

  // Stale revision and in-flight duplicate handling.
  const stale = buildRemoveRoute({
    beginResponse: { data: null, error: { code: "40001", message: "This account changed. Reload and review it again." } },
  });
  assert.equal((await stale.route(makeRequest({ accountId: targetId, revision: 1 }))).status, 409);

  const dupDone = buildRemoveRoute({
    beginResponse: { data: { state: "completed", accountId: targetId, revision: 5 }, error: null },
  });
  const dupDoneRes = await dupDone.route(makeRequest({ accountId: targetId, revision: 5 }));
  assert.equal(dupDoneRes.status, 200);
  assert.deepEqual(await dupDoneRes.json(), { ok: true, alreadyDeleted: true });
  assert.equal(dupDone.calls.length, 2); // user_rpc + begin only; never calls deleteUser again

  const dupRunning = buildRemoveRoute({
    beginResponse: { data: { state: "deleting", accountId: targetId, revision: 4 }, error: null },
  });
  assert.equal((await dupRunning.route(makeRequest({ accountId: targetId, revision: 4 }))).status, 409);
});
