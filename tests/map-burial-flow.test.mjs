import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createTestDatabase } from "./database-helper.mjs";
import { gisLogin, seedGisFixtures } from "./gis-fixtures.mjs";

test("public map shows public active mapped burials while preserving privacy and pending rules", async t => {
  const db = await createTestDatabase({ throughMigration: "20261127040000_local_review_status_updates.sql" });
  t.after(() => db.close());
  await seedGisFixtures(db);
  await gisLogin(db);
  const save = async (entity, values) => (await db.query("select public.staff_save_record($1,null,null,$2::jsonb,$3,'save') result", [entity, JSON.stringify(values), randomUUID()])).rows[0].result;
  const lot = await save("lot", { area_id: 1, lot_code: "TEST-MAP-BURIAL", status: "AVAILABLE", grave_type: "regular", grave_policy_reference: "Fictional test" });
  const digest = "02a4dba490872f9be8cf56280ccf432d31796431c1f808f542fbff86ac28ca77";
  const candidate = "lawn:99991";
  const input = { lot_id: Number(lot.id), display_name: "Fictional test", birth_date: "1950-01-01", death_date: "2020-01-01", sex: "female", public_display: true, record_status: "pending", interment_status: "PERMANENT", remains_type: "ASH" };
  await assert.rejects(save("burial_record", { ...input, record_status: "active" }), /confirm/i);
  const pending = await save("burial_record", input);
  await db.exec("reset role");
  const selection = await readFile(new URL("../scripts/phase2-staging/install-capstone-visitor-selection.sql", import.meta.url), "utf8");
  await db.exec(selection.split("-- Keep normal operational eligibility")[0] + "commit;");
  for (const file of ["install-capstone-planning-assignments.sql", "install-capstone-planning-memorials.sql"]) {
    await db.exec(await readFile(new URL(`../scripts/phase2-staging/${file}`, import.meta.url), "utf8"));
  }
  await db.exec(await readFile(new URL("../supabase/migrations/20261127050000_public_map_active_burials.sql", import.meta.url), "utf8"));
  await db.query("insert into gis_private.capstone_planning_lot(lot_id,plan_sha256,cad_candidate_id,review_reference) values ($1,$2,$3,$4)", [lot.id, digest, candidate, "Fictional test"]);
  await gisLogin(db);
  let statuses = (await db.query("select public.staff_planning_plot_statuses($1) value", [digest])).rows[0].value;
  assert.ok(statuses.occupied.includes(candidate));
  await gisLogin(db, null, "anon");
  assert.equal((await db.query("select * from public.get_capstone_planning_memorials($1,$2)", [candidate, digest])).rows.length, 0);
  await gisLogin(db);
  const confirmed = await save("burial_record", { ...input, display_name: "Fictional confirmed", record_status: "active", interment_confirmed: true, interment_date: "2020-01-02", interment_order_number: "TEST-ORDER" });
  const privateRecord = await save("burial_record", { ...input, display_name: "Fictional private", public_display: false, record_status: "active", interment_confirmed: true, interment_date: "2020-01-03", interment_order_number: "TEST-PRIVATE" });
  statuses = (await db.query("select public.staff_planning_plot_statuses($1) value", [digest])).rows[0].value;
  assert.ok(statuses.occupied.includes(candidate));
  await gisLogin(db, null, "anon");
  const visible = (await db.query("select * from public.get_capstone_planning_memorials($1,$2)", [candidate, digest])).rows;
  assert.deepEqual(visible.map(row => row.id), [confirmed.id]);
  assert.equal((await db.query("select public.get_capstone_planning_plot($1,$2) value", [confirmed.id,digest])).rows[0].value, candidate);
  assert.equal((await db.query("select public.get_capstone_planning_plot($1,$2) value", [privateRecord.id,digest])).rows[0].value, null);
  assert.equal((await db.query("select public.get_capstone_planning_plot($1,$2) value", [pending.id,digest])).rows[0].value, null);
});
