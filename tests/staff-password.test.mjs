import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { generateStaffPassword, validateStaffPassword } from "../src/lib/staff-password.ts";

test("validateStaffPassword enforces length, letter, and number rules", () => {
  assert.equal(validateStaffPassword("short1").valid, false);
  assert.equal(validateStaffPassword("onlyletters").valid, false);
  assert.equal(validateStaffPassword("123456789").valid, false);
  assert.equal(validateStaffPassword("a".repeat(129) + "1").valid, false);

  const ok = validateStaffPassword("ForestLake2026");
  assert.equal(ok.valid, true);
  assert.equal(ok.error, null);
  assert.deepEqual(ok.checks, { minLength: true, hasLetter: true, hasNumber: true });
});

test("generateStaffPassword produces valid strong passwords", () => {
  for (let i = 0; i < 10; i++) {
    const pw = generateStaffPassword(14);
    assert.equal(pw.length, 14);
    assert.equal(validateStaffPassword(pw).valid, true);
  }
});

test("staff onboarding and password recovery use email and require an active Administrator", async () => {
  const provision = await readFile(new URL("../src/app/api/admin/accounts/provision/route.ts", import.meta.url), "utf8");
  const reset = await readFile(new URL("../src/app/api/admin/accounts/reset-password/route.ts", import.meta.url), "utf8");
  const remove = await readFile(new URL("../src/app/api/admin/accounts/remove/route.ts", import.meta.url), "utf8");

  const helper = await readFile(new URL("../src/lib/supabase/staff-account-server.ts", import.meta.url), "utf8");
  for (const source of [provision, reset]) {
    assert.match(source, /await activeStaffAdministrator\(\)/);
    assert.doesNotMatch(source, /NEXT_PUBLIC_SUPABASE_(?:SECRET|SERVICE_ROLE)|auth\.admin\.(?:createUser|updateUserById)/);
  }
  assert.match(helper, /staff\.role === "ADMIN"/);
  assert.match(helper, /private, no-store/);
  assert.match(provision, /auth\.admin\.inviteUserByEmail/);
  assert.match(provision, /staff_begin_invitation/);
  assert.match(provision, /staff_finish_invitation/);
  assert.match(reset, /resetPasswordForEmail\(target.email/);
  assert.match(reset, /accountId === actor\.accountId/);
  assert.match(remove, /410/);
});
