import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import * as react from "react";

const source = readFileSync(new URL("../src/components/visitor/staff-plot-statuses.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const loaded = { exports: {} };
new Function("require", "exports", compiled)(name => {
  if (name === "react") return react;
  if (name === "react/jsx-runtime") return jsx;
  if (name === "./plot-highlights.module.css") return {};
  throw Error(`Unexpected dependency: ${name}`);
}, loaded.exports);
const { matchesStaffFilters, staffPlotState, staffPlotStyle } = loaded.exports;

const data = {
  occupied: new Set(["lawn:1"]), available: new Set(["lawn:2"]),
  booked: new Set(["lawn:3"]), hold: new Set(["lawn:4"]), unavailable: new Set(["lawn:5"]),
  types: { standard: new Set(["lawn:2"]), premium: new Set(["lawn:1", "lawn:3"]),
    special_premium: new Set(["lawn:4"]), mausoleum: new Set(["estates:1"]) },
};

test("status and lot-type filters combine and leave unknowns unconfirmed", () => {
  assert.equal(matchesStaffFilters("lawn:1", data, { status: "occupied", lotType: "premium" }), true);
  assert.equal(matchesStaffFilters("lawn:1", data, { status: "available", lotType: "premium" }), false);
  assert.equal(matchesStaffFilters("lawn:1", data, { status: "occupied", lotType: "standard" }), false);
  assert.equal(matchesStaffFilters("lawn:9", data, { status: "unknown", lotType: "unknown" }), true);
  assert.equal(matchesStaffFilters("estates:1", data, { status: "all", lotType: "mausoleum" }), true);
  assert.equal(staffPlotState("lawn:9", data), "unknown");
});

test("filtered plots share gray while matching plots keep their status colors", () => {
  assert.equal(staffPlotStyle("occupied", true).fillColor, "#ffdf00");
  const unavailable = staffPlotStyle("unavailable", true).fillColor;
  assert.match(unavailable, /^#[0-9a-f]{6}$/i);
  assert.ok(parseInt(unavailable.slice(1, 3), 16) > parseInt(unavailable.slice(3, 5), 16));
  assert.equal(staffPlotStyle("available", false).fillColor, staffPlotStyle("occupied", false).fillColor);
  assert.ok(staffPlotStyle("unknown", true).dashArray);
});
