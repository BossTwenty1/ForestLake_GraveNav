import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/staff-roles.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { isStaffRole, hasRequiredStaffRole } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

test("staff roles recognize super administrators without granting them to other roles", () => {
  for (const role of ["SUPER_ADMIN", "ADMIN", "MANAGER"]) assert.equal(isStaffRole(role), true);
  for (const role of ["", "admin", "OWNER", "SUPERADMIN"]) assert.equal(isStaffRole(role), false);
  for (const role of ["SUPER_ADMIN", "ADMIN", "MANAGER"]) {
    assert.equal(hasRequiredStaffRole(role), true);
    assert.equal(hasRequiredStaffRole(role, role), true);
  }
  assert.equal(hasRequiredStaffRole("SUPER_ADMIN", "ADMIN"), true);
  assert.equal(hasRequiredStaffRole("ADMIN", "SUPER_ADMIN"), false);
  assert.equal(hasRequiredStaffRole("MANAGER", "SUPER_ADMIN"), false);
  assert.equal(hasRequiredStaffRole("MANAGER", "ADMIN"), false);
  assert.equal(hasRequiredStaffRole("ADMIN", "MANAGER"), false);
});
