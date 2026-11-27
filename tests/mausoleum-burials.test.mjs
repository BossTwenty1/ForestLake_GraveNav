import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createTestDatabase } from "./database-helper.mjs";
import { gisLogin, seedGisFixtures } from "./gis-fixtures.mjs";

test("mausoleum burials have no configured limit while regular plots retain six slots", async t => {
  const db = await createTestDatabase({ throughMigration: "20261127030000_unlimited_mausoleum_burials.sql" });
  t.after(() => db.close());
  await seedGisFixtures(db);
  await gisLogin(db);
  const save = async (entity, values, current = {}) => (await db.query(
    "select public.staff_save_record($1,$2,$3,$4::jsonb,$5,'save') result",
    [entity, current.id ?? null, current.revision ?? null, JSON.stringify(values), randomUUID()],
  )).rows[0].result;
  const plot = (code, graveType) => save("lot", { area_id: 1, lot_code: code, status: "AVAILABLE",
    grave_type: graveType, grave_policy_reference: "Local test" });
  const add = (lot, i) => save("burial_record", { lot_id: Number(lot.id), display_name: `Test person ${i}`,
    record_status: "pending", public_display: false, interment_status: "PERMANENT", remains_type: "ASH" });

  const mausoleum = await plot("TEST-UNLIMITED", "mausoleum");
  for (let i = 1; i <= 13; i++) await add(mausoleum, i);
  const options = (await db.query("select public.staff_interment_plot_options() value")).rows[0].value;
  assert.equal(options.find(option => option.lotId === Number(mausoleum.id))?.remaining, null);
  const management = (await db.query("select public.staff_plot_management('TEST-UNLIMITED','all','all','all','plot','asc',1,20) value")).rows[0].value;
  assert.equal(management.items[0].remainingInterments, null);

  const regular = await plot("TEST-REGULAR-LIMIT", "regular");
  for (let i = 1; i <= 6; i++) await add(regular, i);
  await assert.rejects(add(regular, 7), /no remaining/i);

  const firstOwner = await save("lot_owner", { first_name: "First", last_name: "Owner", address: "Test address" });
  const secondOwner = await save("lot_owner", { first_name: "Second", last_name: "Owner", address: "Test address" });
  const unused = await plot("TEST-OWNER-TRANSFER", "regular");
  const lotFields = { area_id: 1, lot_code: "TEST-OWNER-TRANSFER", status: "AVAILABLE" };
  const assigned = await save("lot", { ...lotFields, lot_owner_id: Number(firstOwner.id) }, unused);
  await save("lot", { ...lotFields, lot_owner_id: Number(secondOwner.id) }, assigned);
  const updated = await db.query("select lot_owner_id from public.lot where lot_id=$1", [unused.id]);
  assert.equal(updated.rows[0].lot_owner_id, Number(secondOwner.id));
});
