import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/plot-capacity.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
new Function("exports", compiled)(loaded.exports);
const { hasAvailableBurialCapacity } = loaded.exports;

test("regular plots stop accepting burials at six reserved slots", () => {
  assert.equal(hasAvailableBurialCapacity("regular", 5), true);
  assert.equal(hasAvailableBurialCapacity("regular", 6), false);
  assert.equal(hasAvailableBurialCapacity("regular", null), false);
  assert.equal(hasAvailableBurialCapacity("regular", -1), false);
});

test("mausoleums have no burial limit and unclassified plots stay unavailable", () => {
  assert.equal(hasAvailableBurialCapacity("mausoleum", 30), true);
  assert.equal(hasAvailableBurialCapacity(null, 0), false);
});
