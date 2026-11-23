import "server-only";
import { readFile, mkdir, open, rename, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import {
  WORKBOOK_HASH, SQL_HASH, hash, validatePlan, newJournal, validateJournal, ImportBlocked,
  type Clearance, type FixedPlan, type Journal,
} from "./phase2-import";

// Fixed private paths, outside the repository and web root. No caller-controlled files.
const REVIEW = ".codex/visualizations/2026/09/23/" +
  "01a0cedf-199e-7451-939a-f6477c900657/full-dataset-preparation-20261117";
function privatePath(relative: string) {
  // Resolve only at request time; private workbook/preview files must never be bundled.
  const profile = process.env.USERPROFILE;
  if (!profile) throw new ImportBlocked("The local Windows user profile is unavailable.");
  return resolve(profile, relative);
}
function journalPath(name: string) {
  return privatePath(REVIEW + "/authenticated-executor/" + name);
}

export async function loadFixedPlan() {
  if (hash(await readFile(privatePath("Downloads/GraveNav_Phase2_Demo.xlsx"))) !== WORKBOOK_HASH) {
    throw new ImportBlocked("The authoritative workbook hash changed.");
  }
  const sql = resolve(process.cwd(),
    "supabase/migrations/20261117020000_separate_synthetic_plot_inventory.sql");
  if (hash(await readFile(sql)) !== SQL_HASH) {
    throw new ImportBlocked("The reviewed inventory SQL hash changed.");
  }
  return validatePlan(JSON.parse(await readFile(privatePath(REVIEW +
    "/full-dataset-import-preview.private.json"), "utf8")));
}
async function optionalJson(name: string) {
  try { return JSON.parse(await readFile(journalPath(name), "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new ImportBlocked("The private progress/evidence file could not be validated.");
  }
}
export async function loadJournal(plan: FixedPlan): Promise<Journal> {
  const journal = await optionalJson("progress.json") ?? newJournal();
  validateJournal(plan, journal);
  return journal;
}
export async function loadClearance(): Promise<Clearance | null> {
  // Created only after separately approved SQL application and fresh read-only hosted preflight.
  return optionalJson("execution-clearance.json");
}
async function atomicJson(name: string, value: unknown) {
  await mkdir(privatePath(REVIEW + "/authenticated-executor"), { recursive: true, mode: 0o700 });
  const target = journalPath(name);
  const file = await open(target + ".next", "w", 0o600);
  try { await file.writeFile(JSON.stringify(value, null, 2)); await file.sync(); }
  finally { await file.close(); }
  await rename(target + ".next", target);
}
export const persistJournal = (journal: Journal) => atomicJson("progress.json", journal);
export const persistVerification = (value: unknown) => atomicJson("identity-verification.json", value);

export async function withJournalLock<T>(work: () => Promise<T>): Promise<T> {
  await mkdir(privatePath(REVIEW + "/authenticated-executor"), { recursive: true, mode: 0o700 });
  const path = journalPath("execution.lock");
  let lock;
  try { lock = await open(path, "wx", 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const prior = JSON.parse(await readFile(path, "utf8"));
    if (!Number.isSafeInteger(prior.pid) || prior.pid <= 0) {
      throw new ImportBlocked("The local lock needs operator reconciliation.", 409);
    }
    try {
      process.kill(prior.pid, 0);
      throw new ImportBlocked("Another local batch is active. Wait before continuing.", 409);
    } catch (probe) {
      if ((probe as NodeJS.ErrnoException).code !== "ESRCH") throw probe;
    }
    await unlink(path); // Fixed private path; reclaim only a dead process's lock.
    lock = await open(path, "wx", 0o600);
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid }));
    await lock.sync();
    return await work();
  } finally {
    await lock.close();
    await unlink(path);
  }
}
