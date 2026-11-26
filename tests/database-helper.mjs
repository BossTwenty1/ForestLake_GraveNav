import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { postgis } from "@electric-sql/pglite-postgis";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { testAuthSchema, testStorageSchema } from "./supabase-test-schema.mjs";
export async function createTestDatabase({ throughMigration } = {}) {
  const dir = new URL("../supabase/migrations/", import.meta.url);
  const migrations = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
  const cutoffIndex = throughMigration === undefined ? migrations.length - 1 : migrations.indexOf(throughMigration);
  if (cutoffIndex === -1) throw new Error(`Unknown migration cutoff: ${throughMigration}`);

  const db = new PGlite({ extensions: { postgis, pg_trgm } });
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    ${testAuthSchema}
    ${testStorageSchema}
  `);
  for (const file of migrations.slice(0, cutoffIndex + 1)) {
    try { await db.exec(await readFile(new URL(file, dir), "utf8")); }
    catch (error) { await db.close(); throw new Error(file + ": " + error.message, { cause: error }); }
  }
  return db;
}
