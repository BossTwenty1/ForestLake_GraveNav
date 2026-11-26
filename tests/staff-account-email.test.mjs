import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const actorId = "d0000000-0000-4000-8000-000000000001";
const memberId = "d0000000-0000-4000-8000-000000000002";
const origin = "https://staff.example.test";
const inviteBody = { username: "Fictional Clerk", email: " CLERK@example.test ", role: "MANAGER" };

function load(file, imports) {
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

function request(body, { from = origin, type = "application/json" } = {}) {
  return new Request(origin + "/api/admin/accounts", {
    method: "POST",
    headers: { origin: from, "content-type": type },
    body: JSON.stringify(body),
  });
}

function routes({
  staff = { accountId: actorId, role: "ADMIN", accountStatus: "ACTIVE", isActive: true },
  appOrigin = origin, state = "send", authError = false, finishError = false,
} = {}) {
  const calls = [];
  const helper = load("lib/supabase/staff-account-server.ts", {
    "server-only": {},
    "next/server": { NextResponse: { json: (value, init) => Response.json(value, init) } },
    "@/lib/auth": { getCurrentStaff: async () => staff },
    "./config": { localSupabaseConfig: { environment: "hosted" }, publicAppOrigin: appOrigin },
  });
  const provision = load("app/api/admin/accounts/provision/route.ts", {
    "@/lib/supabase/staff-account-server": helper,
    "@/lib/supabase/server-admin": { getServerServiceSupabase: () => ({
      rpc: async (name, args) => {
        calls.push([name, args]);
        if (name === "staff_begin_invitation") {
          return { data: { state, id: "invitation", attemptId: "attempt", email: args.p_email } };
        }
        assert.equal(name, "staff_finish_invitation");
        return { data: { state: args.p_sent ? "sent" : "failed" },
          error: finishError ? { message: "Private internal failure" } : null };
      },
      auth: { admin: { inviteUserByEmail: async (email, options) => {
        calls.push(["inviteUserByEmail", email, options]);
        return authError ? { error: { message: "Private mail configuration" } }
          : { data: { user: { id: memberId } } };
      } } },
    }) },
  }).POST;
  const recover = load("app/api/admin/accounts/reset-password/route.ts", {
    "@/lib/supabase/staff-account-server": helper,
    "@/lib/supabase/server": { getServerSupabase: async () => ({ rpc: async (name, args) => {
      calls.push([name, args]);
      return { data: { account: { email: "clerk@example.test", revision: 7, canRecover: true } } };
    } }) },
    "@/lib/supabase/config": { getPublicSupabase: () => ({ auth: { resetPasswordForEmail: async (email, options) => {
      calls.push(["resetPasswordForEmail", email, options]);
      return { error: authError ? { message: "Private mail configuration" } : null };
    } } }) },
  }).POST;
  return { provision, recover, calls };
}

test("staff email routes deny unprivileged sessions, cross-origin requests and unsafe redirect configuration", async () => {
  for (const staff of [null, { role: "MANAGER", accountStatus: "ACTIVE", isActive: true },
    { role: "ADMIN", accountStatus: "SUSPENDED", isActive: false },
    { role: "ADMIN", accountStatus: "PENDING", isActive: false }]) {
    const { provision, recover, calls } = routes({ staff });
    assert.equal((await provision(request(inviteBody))).status, 403);
    assert.equal((await recover(request({ accountId: memberId, revision: 7 }))).status, 403);
    assert.deepEqual(calls, []);
  }
  const { provision, recover, calls } = routes();
  assert.equal((await provision(request(inviteBody, { from: "https://other.example.test" }))).status, 400);
  assert.equal((await recover(request({}, { type: "text/plain" }))).status, 400);
  assert.equal((await provision(request({ ...inviteBody, role: "OWNER" }))).status, 400);
  assert.equal((await provision(request({ ...inviteBody, email: "not-an-email" }))).status, 400);
  assert.deepEqual(calls, []);
  for (const appOrigin of ["http://staff.example.test", "https://localhost"]) {
    const invalid = routes({ appOrigin });
    assert.equal((await invalid.provision(request(inviteBody))).status, 503);
    assert.equal((await invalid.recover(request({ accountId: memberId, revision: 7 }))).status, 503);
    assert.deepEqual(invalid.calls, []);
  }
});

test("staff invitations normalize identity, avoid duplicate mail and report delivery or receipt failures privately", async () => {
  const good = routes();
  assert.equal((await good.provision(request(inviteBody))).status, 200);
  assert.equal(good.calls[0][1].p_email, "clerk@example.test");
  assert.equal(good.calls[0][1].p_role, "MANAGER");
  assert.equal(good.calls[1][2].redirectTo, origin + "/auth/callback?type=invite");
  assert.equal(good.calls[2][1].p_user_id, memberId);

  for (const state of ["sent", "sending"]) {
    const existing = routes({ state });
    const response = await existing.provision(request(inviteBody));
    assert.equal(response.status, state === "sent" ? 200 : 409);
    assert.deepEqual(existing.calls.map(([name]) => name), ["staff_begin_invitation"]);
  }

  for (const [failure, expected] of [[{ authError: true }, /email could not be sent/i],
    [{ finishError: true }, /delivery could not be confirmed/i]]) {
    const attempt = routes(failure);
    const response = await attempt.provision(request(inviteBody));
    assert.equal(response.status, 502);
    assert.match(response.headers.get("cache-control"), /no-store/);
    const result = await response.text();
    assert.match(result, expected);
    assert.doesNotMatch(result, /Private mail|Private internal|attemptId/);
    assert.equal(attempt.calls[2][1].p_sent, !failure.authError);
  }
});

test("staff recovery sends only to the current account email and handles stale state and delivery errors", async () => {
  const good = routes();
  assert.equal((await good.recover(request({ accountId: memberId, revision: 6 }))).status, 409);
  assert.equal(good.calls.length, 1);
  const result = await good.recover(request({ accountId: memberId, revision: 7, email: "ignored@example.test" }));
  assert.equal(result.status, 200);
  assert.deepEqual(good.calls.at(-1), ["resetPasswordForEmail", "clerk@example.test", {
    redirectTo: origin + "/auth/callback?type=recovery",
  }]);
  const failed = routes({ authError: true });
  const response = await failed.recover(request({ accountId: memberId, revision: 7 }));
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /Private mail/);
});

test("local staff requests accept the loopback host used by the browser only", () => {
  const helper = load("lib/supabase/staff-account-server.ts", {
    "server-only": {},
    "next/server": { NextResponse: {} },
    "@/lib/auth": {},
    "./config": { localSupabaseConfig: { environment: "local" }, publicAppOrigin: "http://localhost:3000" },
  });
  const check = (from, host) => helper.isStaffJsonRequest(new Request("http://localhost:3000/api/admin/accounts", {
    method: "POST",
    headers: { origin: from, host, "content-type": "application/json" },
  }));
  assert.equal(check("http://127.0.0.1:3000", "127.0.0.1:3000"), true);
  assert.equal(check("http://attacker.test:3000", "127.0.0.1:3000"), false);
  assert.equal(check("http://127.0.0.1:3001", "127.0.0.1:3001"), false);
  assert.equal(check("http://attacker.test:3000", "attacker.test:3000"), false);
});