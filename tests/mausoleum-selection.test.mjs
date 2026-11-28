import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/phase2-planning.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
const loaded = { exports: {} };
new Function("require", "exports", compiled)(name => {
  if (name === "./phase2-cad-details" || name === "./phase2-plot-coordinates") return {};
  throw Error(`Unexpected dependency: ${name}`);
}, loaded.exports);
const { mausoleumEnvelope, mausoleumRepresentative } = loaded.exports;
const data = JSON.parse(readFileSync(new URL("../public/phase2-viewer/data/phase2.local.json", import.meta.url), "utf8"));

test("each of the 12 internal spaces selects the same mausoleum outline", () => {
  const groups = new Map();
  for (const space of data.layers.estates) {
    const outline = mausoleumEnvelope(data, space);
    assert.ok(outline);
    const group = groups.get(outline.id) ?? [];
    group.push(space.id);
    groups.set(outline.id, group);
  }
  assert.equal(groups.size, 29);
  for (const group of groups.values()) assert.equal(group.length, 12);
  for (const group of groups.values()) {
    const representatives = new Set(group.map(id => mausoleumRepresentative(data, data.layers.estates.find(space => space.id === id)).id));
    assert.deepEqual([...representatives], [group.toSorted()[0]]);
  }
  assert.equal(mausoleumEnvelope(data, data.layers.lawn[0]), null);
});

test("incomplete or ambiguous mausoleum geometry is not grouped", () => {
  const space = data.layers.estates[0];
  const incomplete = { ...data, layers: { ...data.layers, estates: data.layers.estates.slice(1) } };
  assert.equal(mausoleumEnvelope(incomplete, space), null);
  assert.equal(mausoleumRepresentative(incomplete, space), null);
  const block = mausoleumEnvelope(data, space);
  const ambiguous = { ...data, layers: { ...data.layers, blocks: [...data.layers.blocks, block] } };
  assert.equal(mausoleumEnvelope(ambiguous, space), null);
});
