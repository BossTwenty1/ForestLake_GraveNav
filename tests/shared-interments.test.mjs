import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createTestDatabase } from "./database-helper.mjs";
import { gisActors, gisLogin, seedGisFixtures } from "./gis-fixtures.mjs";

const migration = new URL("../supabase/migrations/20261107010000_shared_gravesite_interments.sql", import.meta.url);

test("shared graves reserve one physical lot and preserve identity, privacy and history", async (t) => {
  const db = await createTestDatabase({ throughMigration: "20261107000000_gis_begin_import_lock_order.sql" });
  t.after(() => db.close());
  await seedGisFixtures(db);
  await gisLogin(db);
  const result = async (statement, params = []) => (await db.query(statement, params)).rows[0]?.result;
  const save = (entity, values, { id = null, revision = null, op = "save", request = randomUUID() } = {}) =>
    result("select public.staff_save_record($1,$2,$3,$4::jsonb,$5,$6) result",
      [entity, id, revision, JSON.stringify(values), request, op]);
  const makePlot = (code, fields = {}) => save("lot", { area_id: 1, lot_code: code, status: "AVAILABLE", ...fields });
  const burial = (plot, index, fields = {}) => ({
    lot_id: Number(plot.id), display_name: "Fictional Person " + index, interment_date: "2026-01-10",
    record_status: "active", public_display: true, interment_status: "PERMANENT", remains_type: "ASH",
    interment_order_number: "SYNTHETIC-" + index, interment_confirmed: true, ...fields,
  });
  const add = (plot, index, fields, options) => save("burial_record", burial(plot, index, fields), options);
  const legacy = await makePlot("SHARED-LEGACY");
  const original = await add(legacy, 0, { interment_order_number: undefined, interment_confirmed: undefined });
  await gisLogin(db, gisActors.admin, "postgres");
  const oldIdentity = await result("select deceased_id result from public.burial_record where burial_id=$1", [original.id]);
  await db.exec(await readFile(migration, "utf8"));
  await gisLogin(db);

  let regular;
  const people = [];
  await t.test("legacy assignment stays intact; regular admission requires approved facts", async () => {
    const old = await result("select to_jsonb(b) result from public.burial_record b where burial_id=$1", [original.id]);
    assert.equal(old.deceased_id, oldIdentity);
    assert.equal(old.interment_slot, 1);
    assert.equal(old.interment_confirmed, null);
    await assert.rejects(add(legacy, 99), /already has a burial/);
    await assert.rejects(makePlot("SHARED-NO-APPROVAL", { grave_type: "regular" }), /lot_grave_policy_check/);
    regular = await makePlot("SHARED-REGULAR", { grave_type: "regular", grave_policy_reference: "synthetic approval" });
    await assert.rejects(add(regular, 1, { interment_confirmed: false }), /resolve and confirm/i);
    await assert.rejects(add(regular, 1, { interment_order_number: null }), /reviewed order/);
  });

  await t.test("six reservations, replay and duplicate order/person checks", async () => {
    const request = randomUUID();
    people.push(await add(regular, 1, { birth_date: "1926-01-01", death_date: "2025-01-01" }, { request }));
    assert.deepEqual(await add(regular, 1, { birth_date: "1926-01-01", death_date: "2025-01-01" }, { request }), people[0]);
    await assert.rejects(add(regular, 99, { interment_order_number: " synthetic-1 " }), /order already/);
    await assert.rejects(add(regular, 99, { display_name: "  fictional person 1 ", birth_date: "1926-01-01", death_date: "2025-01-01" }), /matching person/);
    people.push(await add(regular, 2));
    people.push(await add(regular, 3, { public_display: false }));
    people.push(await add(regular, 4, { record_status: "pending", interment_confirmed: false }));
    people.push(await add(regular, 5, { record_status: "archived" }));
    people.push(await add(regular, 6));
    await assert.rejects(add(regular, 7), /no remaining/);
    const plots = await result("select public.staff_plot_management('SHARED-REGULAR','all','all','all','plot','asc',1,20) result");
    assert.equal(plots.total, 1);
    const [plot] = plots.items;
    assert.equal(plot.confirmedCount, 5);
    assert.equal(plot.remainingInterments, 0);
    assert.equal(plot.interments.length, 6);
    const coordinates = await result("select public.staff_coordinate_verification('SHARED-REGULAR','all','all','priority','asc',1,20) result");
    assert.equal(coordinates.total, 1);
    const options = await result("select public.staff_interment_plot_options() result");
    assert.equal(options.some((option) => option.lotId === Number(regular.id)), false);
  });

  await t.test("public names and locations follow individual visibility; recovery never frees a slot", async () => {
    const deleted = await save("burial_record", {}, { ...people[5], op: "delete" });
    await assert.rejects(add(regular, 7), /no remaining/);
    await gisLogin(db, null, "anon");
    const roster = (id) => result("select public.public_shared_plot_burials($1) result", [id]);
    assert.deepEqual(await roster(people[0].id), [{ id: people[1].id, name: "Fictional Person 2" }]);
    for (const index of [2, 3, 4, 5]) assert.deepEqual(await roster(people[index].id), []);
    for (const [i, id] of people.slice(0, 2).entries()) {
      const matches = await result("select public.search_public_burials($1) result", ["Fictional Person " + (i + 1)]);
      assert.equal(matches.items[0].burial_id, Number(id.id));
      const association = await result("select public.public_burial_gis($1) result", [id.id]);
      assert.equal(association.lotId, regular.id);
    }
    await assert.rejects(result("select public.staff_interment_plot_options() result"), /permission denied/);
    await gisLogin(db);
    await save("burial_record", {}, { ...deleted, op: "restore" });
    await assert.rejects(add(regular, 7), /no remaining/);
    const audits = await result("select count(*)::int result from public.record_history where entity='burial_record' and record_id=$1", [deleted.id]);
    assert.equal(audits, 2);
    await add(regular, 4, {}, people[3]);
    const count = await result("select count(*)::int result from public.burial_record where lot_id=$1 and interment_confirmed", [regular.id]);
    assert.equal(count, 6);
    await assert.rejects(add(regular, 7), /no remaining/);
  });

  await t.test("an unresolved duplicate draft cannot block recovery of a confirmed record", async () => {
    const plot = await makePlot("SHARED-DRAFT", { grave_type: "regular", grave_policy_reference: "synthetic approval" });
    const identity = { display_name: "Fictional Shared Identity", birth_date: "1926-01-01", death_date: "2025-01-01" };
    const confirmed = await add(plot, 1, identity);
    const draft = await add(plot, 2, { ...identity, record_status: "pending", interment_confirmed: false });
    await assert.rejects(add(plot, 2, identity, draft), /matching person/);
    const removed = await save("burial_record", {}, { ...confirmed, op: "delete" });
    await save("burial_record", {}, { ...removed, op: "restore" });
    const roster = await result("select public.public_shared_plot_burials($1) result", [confirmed.id]);
    assert.deepEqual(roster, []);
  });

  await t.test("mausoleums require approved arrangements and are not capped at six", async () => {
    const maus = await makePlot("SHARED-MAUS", { grave_type: "mausoleum", grave_policy_reference: "synthetic arrangement" });
    await assert.rejects(add(maus, 1), /approved arrangement/);
    const policy = { area_id: 1, lot_code: "SHARED-MAUS", status: "AVAILABLE", grave_type: "mausoleum",
      grave_policy_reference: "synthetic arrangement", approved_mausoleum_capacity: 7 };
    await gisLogin(db, gisActors.manager);
    await assert.rejects(save("lot", policy, maus), /only administrators/i);
    await gisLogin(db);
    const approved = await save("lot", policy, maus);
    for (let i = 1; i <= 7; i++) await add(approved, i);
    await assert.rejects(add(approved, 8), /no remaining/);
    await assert.rejects(save("lot", { ...policy, approved_mausoleum_capacity: 6 }, approved), /below existing reservations/);
  });
});
