import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createTestDatabase } from "./database-helper.mjs";
import { gisLogin, seedGisFixtures } from "./gis-fixtures.mjs";

const script = (name) => readFile(new URL("../scripts/phase2-staging/" + name + "-capstone-visitor-selection.sql", import.meta.url), "utf8");

test("exact capstone approval exposes pending memorials without changing interment or GIS status", async (t) => {
  const db = await createTestDatabase({ throughMigration: "20261117020000_separate_synthetic_plot_inventory.sql" });
  t.after(() => db.close());
  await seedGisFixtures(db);
  await gisLogin(db);
  const scalar = async (statement, params = []) => (await db.query(statement, params)).rows[0]?.result;
  const save = (entity, input, before) => scalar("select public.staff_save_record($1,$2,$3,$4::jsonb,$5,'save') result",
    [entity, before?.id ?? null, before?.revision ?? null, JSON.stringify(input), randomUUID()]);
  const lot = await save("lot", {area_id:1,lot_code:"P2S-"+"a".repeat(64),status:"AVAILABLE",grave_type:"regular",grave_policy_reference:"Isolated regression"});
  const operationalLot = await save("lot", {area_id:2,lot_code:"OPERATING-1",status:"AVAILABLE",grave_type:"regular",grave_policy_reference:"Isolated regression"});
  const input = (name, lotId) => ({
    lot_id: lotId, display_name: name, interment_order_number: name, death_date:"2021-01-01",
    interment_date:"2021-01-02", record_status:"pending", interment_confirmed:false, public_display:false,
    interment_status:"PERMANENT",remains_type:"ASH",
  });
  const provenance = {
    record_source: "GRAVENAV_PHASE2_PROJECT_SAMPLE_V1",
    quality_notes: JSON.stringify({data_classification:"PROJECT_SAMPLE_FICTIONAL",existing_lot_id:lot.id,
      source_row_key:"a".repeat(64),display_reference:"Garden · Block 2 · Lot 014"}),
  };
  const leftValues = {...input("Lucia Cuenca",lot.id),...provenance};
  const rightValues = {...input("Rafael Cuenca",lot.id),...provenance};
  const [left, right] = [await save("burial_record",leftValues),await save("burial_record",rightValues)];
  const operational = await save("burial_record",{...input("Amparo Lopez",operationalLot.id),
    record_status:"active",interment_confirmed:true,public_display:true});
  await assert.rejects(save("burial_record",{...leftValues,record_status:"active"},left), /confirm/i);

  const snapshot = async () => (await db.query("select burial_id,deceased_id,lot_id,record_status,interment_slot,interment_confirmed from public.burial_record order by burial_id")).rows;
  await db.exec("reset role");
  const identities = await snapshot();
  await db.exec(await script("install"));
  const selectMemorial = async id => {
    const person = identities.find(row => String(row.burial_id) === id);
    await db.query("insert into gis_private.capstone_visitor_selection(burial_id,deceased_id,lot_id,review_reference) values ($1,$2,$3,$4)",
      [id,person.deceased_id,person.lot_id,"Disposable test review"]);
  };
  await selectMemorial(left.id);
  await db.exec(await readFile(new URL("../scripts/phase2-staging/install-capstone-planning-assignments.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../scripts/phase2-staging/install-capstone-planning-memorials.sql", import.meta.url), "utf8"));
  const popupNames = async (candidate = "lawn:2363", digest = "b".repeat(64)) =>
    (await db.query("select name from public.get_capstone_planning_memorials($1,$2)", [candidate,digest])).rows.map(row => row.name);
  const digest = "b".repeat(64);
  const setPlot = lotId => db.query("insert into gis_private.capstone_planning_lot(lot_id,plan_sha256,cad_candidate_id,review_reference) values ($1,$2,$3,$4)",
    [lotId,digest,"lawn:2363","Disposable planning review"]);
  const layoutFor = (id, version = digest) => scalar("select public.get_capstone_planning_plot($1,$2) result",[id,version]);
  await setPlot(lot.id);
  await assert.rejects(setPlot(operationalLot.id),/duplicate key/);
  await gisLogin(db);
  const visibleLeft = await save("burial_record",{...leftValues,public_display:true},left);
  const visibleRight = await save("burial_record",{...rightValues,public_display:true},right);

  await gisLogin(db,null,"anon");
  const visibleIds = () => scalar("select array_agg(burial_id::text order by burial_id) result from public.public_burial_records");
  assert.deepEqual(await visibleIds(),[left.id,operational.id]);
  assert.equal(await scalar("select public.public_burial_gis($1) result",[left.id]),null);
  assert.equal(await layoutFor(left.id),"lawn:2363");
  assert.equal(await layoutFor(left.id,"c".repeat(64)),null);
  assert.equal(await layoutFor(right.id),null);
  assert.deepEqual(await popupNames(), ["Lucia Cuenca"]);
  assert.deepEqual(await popupNames("lawn:2364"), []);
  assert.deepEqual(await popupNames("lawn:2363", "c".repeat(64)), []);
  assert.equal(await layoutFor(operational.id),null);
  await assert.rejects(db.query("select * from gis_private.capstone_planning_lot"),/permission denied/);
  assert.deepEqual(await scalar("select public.public_shared_plot_burials($1) result",[left.id]),[]);
  assert.equal((await scalar("select public.search_public_burials('Garden · Block 2 · Lot 014') result")).total,1);
  await assert.rejects(db.query("select * from gis_private.capstone_visitor_selection"),/permission denied/);

  await db.exec("reset role");
  await selectMemorial(right.id);
  await gisLogin(db,null,"anon");
  assert.deepEqual(await visibleIds(),[left.id,right.id,operational.id]);
  assert.equal(await layoutFor(right.id),await layoutFor(left.id));
  assert.deepEqual(await popupNames(), ["Lucia Cuenca","Rafael Cuenca"]);
  assert.deepEqual(await scalar("select public.public_shared_plot_burials($1) result",[left.id]),
    [{id:right.id,name:rightValues.display_name}]);

  await gisLogin(db);
  await save("burial_record", {...rightValues,public_display:false},visibleRight);
  await gisLogin(db,null,"anon");
  assert.deepEqual(await visibleIds(),[left.id,operational.id]);
  await db.exec("reset role");
  assert.deepEqual(await snapshot(),identities);
  assert.deepEqual(await popupNames(), ["Lucia Cuenca"]);
  await db.exec("drop function public.get_capstone_planning_memorials(text,text); drop function public.get_capstone_planning_plot(bigint,text); drop table gis_private.capstone_planning_lot;");
  await db.exec(await script("remove"));
  await gisLogin(db,null,"anon");
  assert.deepEqual(await visibleIds(),[operational.id]);
  assert.equal(visibleLeft.id,left.id);
});
