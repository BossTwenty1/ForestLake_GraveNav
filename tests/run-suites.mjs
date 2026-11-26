import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const suites = {
  integration: ["gis-concurrency.test.mjs"],
  "private-gis": ["private-gis.test.mjs"],
};
const excluded = new Set([...suites.integration, ...suites["private-gis"]]);
const mode = process.argv[2] ?? "standard";
const candidates = readdirSync(new URL("./", import.meta.url)).filter(name => name.endsWith(".test.mjs")).sort();
const files = mode === "standard" ? candidates.filter(name => !excluded.has(name)) : suites[mode];
if (!Array.isArray(files) || !files.length || files.some(file => !candidates.includes(file))) {
  throw Error("Expected a populated standard, integration or private-gis suite.");
}
console.log(`GraveNav ${mode}: ${files.length} test files.`);
if (mode === "standard") {
  console.log("Docker cases use test:integration. Approved CAD checks use test:private-gis.");
}
const result = spawnSync(process.execPath, ["--test", "--test-concurrency=4", ...process.argv.slice(3),
  ...files.map(file => fileURLToPath(new URL(file, import.meta.url)))], {
  cwd: fileURLToPath(new URL("../", import.meta.url)), stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
