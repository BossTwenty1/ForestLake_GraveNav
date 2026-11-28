import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createTestDatabase } from "./database-helper.mjs";
import { gisLogin, seedGisFixtures } from "./gis-fixtures.mjs";

test("boundaryless court permits only pending mausoleum coordinates", async t => {
  const db = await createTestDatabase({ throughMigration: "20261127160000_staff_mausoleum_actions.sql" });
  t.after(() => db.close());
  await seedGisFixtures(db);
  await db.exec(await readFile(new URL("../supabase/migrations/20261127170000_pending_mausoleum_coordinates.sql", import.meta.url), "utf8"));
  await db.exec("insert into public.area(area_id,site_id,area_code,area_name,area_category) values (4,1,'MPC','Fictional court','garden')");
  await gisLogin(db);
  const values = { area_id:4, lot_code:"MPC-C-1-12", status:"HOLD", grave_type:"mausoleum", grave_policy_reference:"Fictional test", location_geom:{ type:"Point", coordinates:[123.74,13.12] } };
  const save = value => db.query("select public.staff_save_record('lot',null,null,$1::jsonb,$2,'save') result", [JSON.stringify(value), randomUUID()]);
  const lot = (await save(values)).rows[0].result;
  await assert.rejects(save({...values,lot_code:"MPC-C-2-12",grave_type:"regular"}), /no boundary/i);
  await assert.rejects(save({...values,lot_code:"unrelated"}), /no boundary/i);
  await assert.rejects(db.query("select public.staff_save_record('lot',$1,$2,$3::jsonb,$4,'review')",[String(lot.id),lot.revision,JSON.stringify({status:"verified",reason:"test"}),randomUUID()]), /no boundary/i);
});
