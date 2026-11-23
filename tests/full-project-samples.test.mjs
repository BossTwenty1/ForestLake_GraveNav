import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { prepareFullSamples, bindIntermentValues } from "../scripts/phase2-staging/prepare-full-project-samples.mjs";
import { createTestDatabase } from "./database-helper.mjs";
import { gisActors, gisLogin, seedGisFixtures } from "./gis-fixtures.mjs";

const datasetPath = process.env.GRAVENAV_PROJECT_SAMPLE_DATASET;
const snapshotPath = process.env.GRAVENAV_PROJECT_SAMPLE_SNAPSHOT;

test("full unchanged workbook dataset: protected dry run, rollback and replay", {
  skip: !datasetPath || !snapshotPath ? "Supply the existing verified dataset and read-only snapshot paths" : false,
}, async (t) => {
  const dataset = JSON.parse(readFileSync(datasetPath, "utf8"));
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const beforeSource = JSON.stringify(dataset);
  const plan = prepareFullSamples(dataset, snapshot);
  assert.deepEqual(plan, prepareFullSamples(dataset, snapshot), "Plan must be deterministic");
  const db = await createTestDatabase();
  t.after(() => db.close());
  await seedGisFixtures(db);
  // Disposable fixtures only. No hosted connection, Auth impersonation or source edits.
  await db.exec(`insert into public.area(area_id,site_id,area_code,area_name,area_category)
    values(5,1,'TEST-BPG','Butterfly Palm Garden','garden'),
          (6,1,'TEST-MPG','Majestic Palm Garden','garden');
    update public.area set boundary_geom=extensions.st_geomfromtext(
      'POLYGON((0 0,1 0,1 1,0 1,0 0))',4326)::extensions.geography where area_id=5;
    insert into public.lot(area_id,lot_code,status,location_geom,coordinate_status,coordinate_verified)
    values(5,'UNRELATED-VERIFIED','HOLD',extensions.st_setsrid(extensions.st_makepoint(0.5,0.5),4326)::extensions.geography,'verified',true);`);
  await gisLogin(db);
  const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.result;
  const save = (entity, values, request, id = null, revision = null) =>
    scalar("select public.staff_save_record($1,$2,$3,$4::jsonb,$5,'save') result",
      [entity, id, revision, JSON.stringify(values), request]);
  const baseline = async () => {
    await gisLogin(db, gisActors.admin, "postgres");
    const result = await scalar(`select jsonb_build_object(
      'owners',(select count(*) from public.lot_owner),
      'lots',(select count(*) from public.lot),
      'people',(select count(*) from public.deceased),
      'burials',(select count(*) from public.burial_record),
      'receipts',(select count(*) from public.staff_mutation),
      'history',(select count(*) from public.record_history),
      'audits',(select count(*) from public.audit_log),
      'unrelated',(select to_jsonb(l) from public.lot l where lot_code='UNRELATED-VERIFIED'),
      'areas',(select jsonb_agg(to_jsonb(a) order by area_id) from public.area a)
    ) result`);
    await gisLogin(db);
    return result;
  };
  const initial = await baseline();
  const initialInventory = await scalar("select public.staff_dashboard_data() result");

  async function groupSave(group, failAfter = -1, rollback = false) {
    await db.exec("begin");
    let count = 0;
    const checkpoint = () => { if (++count === failAfter) throw Error("Injected rollback"); };
    try {
      const owner = group.owner
        ? await save("lot_owner", group.owner.values, group.owner.request_id) : null;
      if (owner) checkpoint();
      const lot = await save("lot", {
        ...group.lot.values, lot_owner_id: owner?.id ?? null,
      }, group.lot.request_id);
      checkpoint();
      const interments = [];
      for (const entry of group.interments) {
        interments.push(await save("burial_record", bindIntermentValues(entry, lot.id), entry.request_id));
        checkpoint();
      }
      await db.exec(rollback ? "rollback" : "commit");
      return { owner, lot, interments };
    } catch (error) { await db.exec("rollback"); throw error; }
  }

  await t.test("complete preview retains all relationships and refuses automatic identity/policy promotion", () => {
    assert.equal(plan.assignments.length, 90);
    assert.equal(plan.counts.owners_to_create, 45);
    assert.equal(plan.counts.deceased_to_create, 100);
    assert.equal(plan.counts.interments_to_create, 100);
    assert.equal(plan.counts.protected_save_calls, 235);
    assert.equal(plan.ready_for_hosted_execution, false);
    assert.equal(plan.execution_authorized, false);
    assert.equal(plan.policies_approved.length, 6);
    assert.equal(plan.counts.policy_blocked_assignments, 0);
    assert.equal(plan.assignments.filter((g) => !g.owner).length, 45);
    assert.ok(plan.assignments.filter((g) => !g.owner).every((g) => g.interments.length === 1));
    const requests = plan.assignments.flatMap((g) => [
      ...(g.owner ? [g.owner.request_id] : []), g.lot.request_id,
      ...g.interments.map((entry) => entry.request_id),
    ]);
    assert.equal(new Set(requests).size, 235);
    assert.equal(new Set(plan.assignments.map((g) => g.lot.values.lot_code)).size, 90);
    assert.ok(plan.assignments.every((g) => g.existing_lot_id === null &&
      g.lot.values.location_geom === null && !g.historical_cad_identity_verified));
    assert.equal(plan.assignments.filter((g) => g.interments.length === 2).length, 10);
    assert.equal(JSON.stringify(dataset), beforeSource);
  });
  await t.test("wrong project, duplicate IDs, occupied namespace and existing batch are rejected", () => {
    for (const patch of [
      { project_ref: "wrong" }, { synthetic_namespace_conflicts: 1 },
      { existing_sample_interments: 1 }, { existing_sample_owners: 1 },
      { transaction_read_only: "off" },
    ]) assert.throws(() => prepareFullSamples(dataset, { ...snapshot, ...patch }));
    const broken = structuredClone(dataset);
    broken.interments[1].sample_id = broken.interments[0].sample_id;
    assert.throws(() => prepareFullSamples(broken, snapshot), /Duplicate/);
  });
  const rollbackGroup = plan.assignments.find((g) => g.owner && g.interments.length === 2);
  await t.test("failure after owner, plot, first and second interment rolls back rows, receipts and audit", async () => {
    for (const failAfter of [1, 2, 3, 4]) {
      await assert.rejects(groupSave(rollbackGroup, failAfter), /Injected rollback/);
      assert.deepEqual(await baseline(), initial);
    }
    await groupSave(rollbackGroup, -1, true);
    assert.deepEqual(await baseline(), initial);
  });
  const receipts = [];
  await t.test("interruption between individual committed calls resumes with the same receipts", async () => {
    const owner = await save("lot_owner", rollbackGroup.owner.values, rollbackGroup.owner.request_id);
    assert.deepEqual(await save("lot_owner", rollbackGroup.owner.values,
      rollbackGroup.owner.request_id), owner);
    assert.equal((await baseline()).owners - initial.owners, 1);
    assert.equal((await baseline()).lots - initial.lots, 0);
    const lotValues = { ...rollbackGroup.lot.values, lot_owner_id: owner.id };
    const lot = await save("lot", lotValues, rollbackGroup.lot.request_id);
    assert.deepEqual(await save("lot", lotValues, rollbackGroup.lot.request_id), lot);
    assert.equal((await baseline()).burials - initial.burials, 0);
    for (const [index, entry] of rollbackGroup.interments.entries()) {
      const values = bindIntermentValues(entry, lot.id);
      const receipt = await save("burial_record", values, entry.request_id);
      assert.deepEqual(await save("burial_record", values, entry.request_id), receipt);
      assert.equal((await baseline()).burials - initial.burials, index + 1);
    }
    assert.equal((await baseline()).receipts - initial.receipts, 4);
  });
  await t.test("all 45 owners, 90 synthetic groups and 100 people/interments pass protected saves", async () => {
    // Simulate a disconnected run after committed groups, then replay its full reviewed plan.
    for (const group of plan.assignments.slice(0, 30)) await groupSave(group);
    const partial = await baseline();
    await assert.rejects(groupSave(plan.assignments[30], 1), /Injected rollback/);
    assert.deepEqual(await baseline(), partial);
    for (const group of plan.assignments) receipts.push(await groupSave(group));
    const result = await baseline();
    assert.equal(result.owners - initial.owners, 45);
    assert.equal(result.lots - initial.lots, 90);
    assert.equal(result.people - initial.people, 100);
    assert.equal(result.burials - initial.burials, 100);
    assert.equal(result.receipts - initial.receipts, 235);
    assert.deepEqual(result.unrelated, initial.unrelated);
    assert.deepEqual(result.areas, initial.areas);
  });
  await t.test("exact replay after a partially completed run never duplicates records", async () => {
    const before = await baseline();
    for (const group of plan.assignments) await groupSave(group);
    assert.deepEqual(await baseline(), before);
    const altered = structuredClone(rollbackGroup);
    altered.owner.values.address += " conflicting replay";
    await assert.rejects(groupSave(altered), /request|different|conflict/i);
    assert.deepEqual(await baseline(), before);
  });
  await t.test("synthetic inventory is counted separately from physical inventory and coordinate reviews", async () => {
    const dashboard = await scalar("select public.staff_dashboard_data() result");
    assert.equal(dashboard.occupancy.total, initialInventory.occupancy.total);
    assert.equal(dashboard.occupancy.occupied, initialInventory.occupancy.occupied);
    assert.equal(dashboard.summary.needsVerification, initialInventory.summary.needsVerification);
    assert.equal(dashboard.summary.syntheticPlots, 90);
    assert.ok(plan.execution_holds.some((hold) => hold.includes("physical inventory")));
  });
  await t.test("existing staff readers retrieve complete data; public readers return no hidden sample", async () => {
    const directory = await scalar("select public.staff_burial_records('','all','all','all','all','updated','desc',1,100) result");
    assert.equal(directory.total, 100);
    const owners = await scalar("select count(*)::int result from public.lot_owner where deleted_at is null");
    assert.equal(owners, 45);
    const references = await scalar("select public.staff_sample_plot_references($1) result",
      [receipts.map((r) => r.lot.id)]);
    assert.equal(references.length, 90);
    assert.ok(references.every((ref) => ref.reference));
    const states = await scalar(`select jsonb_build_object(
      'pending',(select count(*) from public.burial_record where record_status='pending'),
      'confirmed',(select count(*) from public.burial_record where interment_confirmed),
      'public_flags',(select count(*) from public.deceased where public_display),
      'geometry',(select count(*) from public.lot where lot_code like 'P2S-%' and location_geom is not null),
      'verified',(select count(*) from public.lot where lot_code like 'P2S-%' and coordinate_verified),
      'paired',(select count(*) from (select lot_id from public.burial_record group by lot_id having count(*)=2) s)
    ) result`);
    assert.deepEqual(states, { pending: 100, confirmed: 0, public_flags: 0, geometry: 0, verified: 0, paired: 10 });
    await gisLogin(db, null, "anon");
    assert.equal(await scalar("select count(*)::int result from public.public_burial_records"), 0);
    const searched = await scalar("select public.search_public_burials('Tomas Kuwento') result");
    assert.equal(searched.total, 0);
    assert.equal(await scalar("select public.public_burial_gis($1) result", [receipts[0].interments[0].id]), null);
    await assert.rejects(save("lot_owner", rollbackGroup.owner.values, randomUUID()), /permission|staff/i);
    await gisLogin(db);
  });
  await t.test("fictional shared records cannot be activated by fabricating actual-interment evidence", async () => {
    const index = plan.assignments.findIndex((g) => g.interments.length === 2);
    const entry = plan.assignments[index].interments[0];
    const existing = receipts[index];
    await assert.rejects(save("burial_record", {
      ...bindIntermentValues(entry, existing.lot.id), record_status: "active",
    }, randomUUID(), existing.interments[0].id, 1), /confirm/i);
    await gisLogin(db, gisActors.manager);
    const changed = structuredClone(rollbackGroup);
    changed.owner.request_id = randomUUID();
    changed.lot.request_id = randomUUID();
    changed.lot.values.lot_code += "-MANAGER";
    await assert.rejects(groupSave(changed), /Only administrators/i);
    await gisLogin(db);
    assert.equal((await baseline()).owners, 45);
  });
});
