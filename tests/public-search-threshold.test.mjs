import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createTestDatabase } from "./database-helper.mjs";

test("search keeps the 0.3 contract without setting an extension parameter", async t => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  const { rows } = await db.query("select pg_get_functiondef('public.search_public_burials(text,text,text,text,integer,integer)'::regprocedure) definition");
  const definition = rows[0].definition;
  assert.doesNotMatch(definition, /SET pg_trgm\./i);
  assert.match(definition, /SECURITY DEFINER/i);
  const oracle = definition
    .replace("public.search_public_burials(", "pg_temp.previous_search_public_burials(")
    .replace("SECURITY DEFINER", "SECURITY INVOKER")
    .replace("SET search_path TO", "SET pg_trgm.similarity_threshold TO '0.3'\n SET search_path TO")
    .replace("extensions.similarity(public.search_normalize(v.display_name), q) >= 0.3::real", "public.search_normalize(v.display_name) operator(extensions.%) q");
  assert.notEqual(oracle, definition);
  await db.exec(oracle);
  await db.exec(await readFile(new URL("./fixtures/public-search-threshold.sql", import.meta.url), "utf8"));
});
