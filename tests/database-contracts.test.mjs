import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "./database-helper.mjs";

test("database migrations and operational contracts", async (t) => {
  const db = await createTestDatabase();
  const admin = "00000000-0000-0000-0000-000000000001";
  const manager = "00000000-0000-0000-0000-000000000002";
  const login = async (id, role = "authenticated") => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || ""]);
    await db.exec("set role " + role);
  };
  const save = async (entity, id, revision, values, operation = "save", request = randomUUID()) =>
    (await db.query("select public.staff_save_record($1,$2,$3,$4::jsonb,$5,$6) as result",
      [entity, id === null ? null : String(id), revision, JSON.stringify(values), request, operation])).rows[0].result;
  const search = async (query, section = "all", page = 1, year = "any") =>
    (await db.query("select public.search_public_burials($1,$2,$3,'name',$4,2) as result", [query, section, year, page])).rows[0].result;
  const lot = (code, lon = 0.5) => ({ area_id: 1, block_id: null, lot_owner_id: null, lot_code: code, legacy_location_code: null, status: "AVAILABLE", location_geom: { type: "Point", coordinates: [lon, 0.5] }, coordinate_accuracy_m: 5 });
  const burial = (lotId, name = "Maria Santos", visible = true) => ({
    display_name: name, birth_date: "1940-01-01", death_date: "2020-01-01", public_display: visible,
    lot_id: Number(lotId), interment_date: "2020-01-05", record_status: "active", interment_status: "PERMANENT",
    remains_type: "FRESH", reference_no: null, service_provider: null, record_source: null, quality_notes: null,
  });
  try {
    await db.exec(`
      insert into auth.users values ('${admin}'),('${manager}');
      insert into public.account(account_id,role_id,username,is_active,account_status,approved_at)
        select '${admin}',role_id,'admin',true,'ACTIVE',now() from public.role where role_name='ADMIN';
      insert into public.account(account_id,role_id,username,is_active,account_status,approved_at)
        select '${manager}',role_id,'manager',true,'ACTIVE',now() from public.role where role_name='MANAGER';
      insert into public.site(site_name,address) values('Test cemetery','Test address');
      insert into public.area(site_id,area_code,area_name,area_category,boundary_geom)
        values(1,'RPG','Test garden','garden',extensions.st_geogfromtext('POLYGON((0 0,1 0,1 1,0 1,0 0))'));
    `);
    await login(admin);
    let firstLot, firstBurial;
    await t.test("new coordinates are pending and request retries create only one plot", async () => {
      const request = randomUUID();
      firstLot = await save("lot", null, null, lot("RPG-001"), "save", request);
      assert.deepEqual(await save("lot", null, null, lot("RPG-001"), "save", request), firstLot);
      assert.equal((await db.query("select coordinate_status,coordinate_verified from public.lot")).rows[0].coordinate_status, "pending");
      await assert.rejects(save("lot", null, null, lot("RPG-002"), "save", request), /different changes/);
      assert.equal((await db.query("select count(*)::int n from public.lot")).rows[0].n, 1);
    });
    await t.test("out-of-boundary coordinates roll back the entire request", async () => {
      await assert.rejects(save("lot", null, null, lot("BAD", 2)), /outside/);
      assert.equal((await db.query("select count(*)::int n from public.lot")).rows[0].n, 1);
    });
    await t.test("reviews require reasons and reject stale edits", async () => {
      await assert.rejects(save("lot", firstLot.id, firstLot.revision, { status: "rejected" }, "review"), /reason/);
      firstLot = await save("lot", firstLot.id, firstLot.revision, { status: "rejected", reason: "Revisit marker" }, "review");
      assert.equal((await db.query("select coordinate_rejection_reason from public.lot")).rows[0].coordinate_rejection_reason, "Revisit marker");
      await assert.rejects(save("lot", firstLot.id, 1, lot("RPG-001")), /Another staff member/);
      firstLot = await save("lot", firstLot.id, firstLot.revision, { status: "verified" }, "review");
    });
    await t.test("manager cannot approve coordinates, delete, or bypass the safe API", async () => {
      await login(manager);
      await assert.rejects(save("lot", firstLot.id, firstLot.revision, { status: "verified" }, "review"), /Only administrators/);
      await assert.rejects(save("lot", firstLot.id, firstLot.revision, {}, "delete"), /Only administrators/);
      await assert.rejects(db.exec("update public.lot set coordinate_verified=true"), /permission denied/);
      assert.equal((await db.query("select * from public.record_history")).rows.length, 0);
      await login(admin);
    });
    await t.test("burial creation is atomic and double-submission safe", async () => {
      const request = randomUUID();
      firstBurial = await save("burial_record", null, null, burial(firstLot.id), "save", request);
      assert.deepEqual(await save("burial_record", null, null, burial(firstLot.id), "save", request), firstBurial);
      await assert.rejects(save("burial_record", null, null, burial(firstLot.id)), /already has/);
      assert.equal((await db.query("select count(*)::int n from public.deceased")).rows[0].n, 1);
      await assert.rejects(save("burial_record", firstBurial.id, firstBurial.revision, { ...burial(firstLot.id, "Changed"), remains_type: "INVALID" }), /check constraint/);
      assert.equal((await db.query("select display_name from public.deceased")).rows[0].display_name, "Maria Santos");
    });
    await t.test("ranked name and plot search respects public visibility, filters and pagination", async () => {
      const secondLot = await save("lot", null, null, lot("RPG-002"));
      await save("burial_record", null, null, burial(secondLot.id, "Maria Santoso"));
      const privateLot = await save("lot", null, null, lot("RPG-003"));
      await save("burial_record", null, null, burial(privateLot.id, "Maria Private", false));
      const thirdLot = await save("lot", null, null, lot("RPG-004"));
      await save("burial_record", null, null, burial(thirdLot.id, "Jose Santos"));
      await login(null, "anon");
      let result = await search("Santos,   Maria");
      assert.equal(result.items[0].display_name, "Maria Santos");
      assert.equal(result.items[0].match_type, "exact");
      assert.equal(result.items[0].interment_date, "2020-01-05");
      assert.equal((await search("rpg 001")).items[0].match_type, "exact");
      assert.ok((await search("Maria Santso")).items.some((row) => row.match_type === "similar"));
      assert.equal((await search("Private")).total, 0);
      assert.equal((await search("Maria", "Different garden")).total, 0);
      assert.equal((await search("Maria", "all", 1, "1900-1999")).total, 0);
      result = await search("");
      assert.equal(result.total, 3);
      assert.equal(result.items.length, 2);
      const next = await search("", "all", 2);
      assert.equal(next.items.length, 1);
      assert.ok(!result.items.some((r) => r.burial_id === next.items[0].burial_id));
      await assert.rejects(db.exec("select * from public.lot_owner"), /permission denied/);
      await login(admin);
    });
    await t.test("owner edits and removal are recoverable and version checked", async () => {
      const values = { first_name: "Test", last_name: "Owner", address: "Test address" };
      let owner = await save("lot_owner", null, null, values);
      owner = await save("lot_owner", owner.id, owner.revision, { ...values, address: "Changed address" });
      await assert.rejects(save("lot_owner", owner.id, 1, values), /Another staff member/);
      const h = (await db.query("select * from public.record_history where entity='lot_owner' order by history_id desc limit 1")).rows[0];
      owner = await save("lot_owner", owner.id, owner.revision, { history_id: h.history_id }, "revert");
      assert.equal((await db.query("select address from public.lot_owner where lot_owner_id=$1", [owner.id])).rows[0].address, "Test address");
      owner = await save("lot_owner", owner.id, owner.revision, {}, "delete");
      await save("lot_owner", owner.id, owner.revision, {}, "restore");
      assert.equal((await db.query("select deleted_at from public.lot_owner where lot_owner_id=$1", [owner.id])).rows[0].deleted_at, null);
    });
    await t.test("photo uploads cannot self-approve and review is administrator-only", async () => {
      await login(manager);
      await assert.rejects(db.query("insert into public.photo(burial_id,uploaded_by,storage_path,file_name,approval_status,public_display) values($1,$2,'bad','bad.jpg','approved',true)", [firstBurial.id, manager]), /row-level security/);
      const photo = (await db.query("insert into public.photo(burial_id,uploaded_by,storage_path,file_name) values($1,$2,'test/photo','test.jpg') returning photo_id,revision", [firstBurial.id, manager])).rows[0];
      await assert.rejects(save("photo", photo.photo_id, photo.revision, { status: "approved" }, "review"), /Only administrators/);
      await login(admin);
      await save("photo", photo.photo_id, photo.revision, { status: "approved" }, "review");
      assert.equal((await db.query("select count(*)::int n from public.public_burial_photos")).rows[0].n, 1);
      await assert.rejects(save("photo", photo.photo_id, photo.revision, { status: "rejected" }, "review"), /Another staff member/);
    });
    await t.test("account actions preserve administrator-only and stale-session protection", async () => {
      const target = "00000000-0000-0000-0000-000000000003";
      await db.exec("reset role");
      await db.query("insert into auth.users values($1)", [target]);
      await db.query("insert into public.account(account_id,role_id,username) select $1,role_id,'pending-staff' from public.role where role_name='MANAGER'", [target]);
      await login(manager);
      await assert.rejects(save("account", target, 1, {}, "approve"), /Only administrators/);
      await login(admin);
      const approved = await save("account", target, 1, {}, "approve");
      await assert.rejects(save("account", target, 1, {}, "activate"), /Another staff member/);
      await save("account", target, approved.revision, {}, "activate");
      assert.equal((await db.query("select account_status from public.account where account_id=$1", [target])).rows[0].account_status, "ACTIVE");
      await assert.rejects(db.query("select public.admin_change_account_role($1,'ADMIN')", [target]), /permission denied/);
    });
    await t.test("soft deletion hides public records and restores without losing relationships", async () => {
      firstBurial = await save("burial_record", firstBurial.id, firstBurial.revision, {}, "delete");
      assert.equal((await search("rpg001")).total, 0);
      assert.equal((await db.query("select count(*)::int n from public.public_burial_photos")).rows[0].n, 0);
      await assert.rejects(save("lot", firstLot.id, firstLot.revision, {}, "delete"), /burial record/);
      firstBurial = await save("burial_record", firstBurial.id, firstBurial.revision, {}, "restore");
      assert.equal((await search("rpg001")).total, 1);
      assert.equal((await db.query("select count(*)::int n from public.public_burial_photos")).rows[0].n, 1);
    });
    await t.test("undo restores the previous edit and prevents overwriting newer versions", async () => {
      firstBurial = await save("burial_record", firstBurial.id, firstBurial.revision, burial(firstLot.id, "Edited Name"));
      const h = (await db.query("select * from public.record_history where entity='burial_record' order by history_id desc limit 1")).rows[0];
      firstBurial = await save("burial_record", firstBurial.id, firstBurial.revision, { history_id: h.history_id }, "revert");
      assert.equal((await search("rpg001")).items[0].display_name, "Maria Santos");
      await assert.rejects(save("burial_record", firstBurial.id, firstBurial.revision, { history_id: h.history_id }, "revert"), /latest unchanged/);
    });
    await t.test("staff burial workspace searches, filters, sorts, and pages on the server", async () => {
      const list = async ({ query = "", verification = "all", sort = "updated", direction = "desc", page = 1 } = {}) =>
        (await db.query(
          "select public.staff_burial_records($1,'all','all',$2,'all',$3,$4,$5,10) as result",
          [query, verification, sort, direction, page],
        )).rows[0].result;
      const all = await list({ sort: "name", direction: "asc" });
      assert.equal(all.total, all.totalAll);
      assert.ok(all.items.length > 1);
      assert.deepEqual(
        all.items.map((item) => item.name),
        [...all.items.map((item) => item.name)].sort((a, b) => a.localeCompare(b)),
      );
      assert.ok(all.sections.includes("Test garden"));
      const searched = await list({ query: "RPG-002" });
      assert.equal(searched.total, 1);
      assert.equal(searched.items[0].plot, "RPG-002");
      const pendingCoordinates = await list({ verification: "pending" });
      assert.ok(pendingCoordinates.items.length > 0);
      assert.ok(pendingCoordinates.items.every((item) => !item.coordinateVerified));
      await db.exec("set role anon");
      await assert.rejects(list(), /permission denied|active staff account/);
      await login(admin);
    });
    await t.test("plot workspace derives occupancy and supports bounded server queries", async () => {
      const list = async ({ query = "", area = "all", state = "all", verification = "all", sort = "updated", direction = "desc", page = 1, pageSize = 10 } = {}) =>
        (await db.query(
          "select public.staff_plot_management($1,$2,$3,$4,$5,$6,$7,$8) as result",
          [query, area, state, verification, sort, direction, page, pageSize],
        )).rows[0].result;

      await save("lot", null, null, { ...lot("RPG-010"), status: "BOOKED" });
      await save("lot", null, null, { ...lot("RPG-011"), status: "HOLD" });
      for (let index = 12; index <= 19; index += 1) await save("lot", null, null, lot(`RPG-0${index}`));

      const all = await list({ sort: "plot", direction: "asc" });
      assert.equal(all.total, all.totalAll);
      assert.equal(all.items.length, 10);
      assert.deepEqual(
        all.items.map((item) => item.lotCode),
        [...all.items.map((item) => item.lotCode)].sort((a, b) => a.localeCompare(b)),
      );
      assert.deepEqual(all.areas, [{ areaId: 1, areaCode: "RPG", label: "Test garden" }]);

      const expectedOccupied = (await db.query("select count(*)::int n from public.lot l where l.deleted_at is null and exists(select 1 from public.burial_record br where br.lot_id=l.lot_id)")).rows[0].n;
      const expectedAvailable = (await db.query("select count(*)::int n from public.lot l where l.deleted_at is null and l.status='AVAILABLE' and not exists(select 1 from public.burial_record br where br.lot_id=l.lot_id)")).rows[0].n;
      const expectedVerification = (await db.query("select count(*)::int n from public.lot where deleted_at is null and (location_geom is null or coordinate_status in ('pending','rejected'))")).rows[0].n;
      assert.equal(all.summary.occupied, expectedOccupied);
      assert.equal(all.summary.available, expectedAvailable);
      assert.equal(all.summary.needsVerification, expectedVerification);
      assert.equal(all.summary.total, all.summary.occupied + all.summary.available + all.summary.booked + all.summary.onHold);

      const searched = await list({ query: "RPG-001" });
      assert.equal(searched.total, 1);
      assert.equal(searched.items[0].operationalState, "occupied");
      assert.equal(searched.items[0].assignedDeceasedName, "Maria Santos");
      assert.equal((await list({ area: "1" })).total, all.totalAll);
      assert.ok((await list({ state: "booked" })).items.every((item) => item.operationalState === "booked"));
      assert.ok((await list({ verification: "verified" })).items.every((item) => item.coordinateState === "verified"));
      assert.equal((await list({ query: "RPG-010", area: "1", state: "booked", verification: "pending" })).total, 1);

      const secondPage = await list({ sort: "plot", direction: "asc", page: 2 });
      assert.ok(secondPage.items.length > 0);
      assert.ok(!all.items.some((item) => secondPage.items.some((next) => next.lotId === item.lotId)));
      assert.equal((await list({ pageSize: 50 })).items.length, all.totalAll);

      firstBurial = await save("burial_record", firstBurial.id, firstBurial.revision, {}, "delete");
      const reservedForRecovery = await list({ query: "RPG-001" });
      assert.equal(reservedForRecovery.items[0].operationalState, "occupied");
      assert.equal(reservedForRecovery.items[0].assignedBurialDeleted, true);
      firstBurial = await save("burial_record", firstBurial.id, firstBurial.revision, {}, "restore");

      await login(manager);
      assert.equal(typeof (await list()).summary.total, "number");
      await login(null, "anon");
      await assert.rejects(list(), /permission denied|active staff account/);
      await login(admin);
    });
    await t.test("coordinate verification queue is bounded, consistent, auditable, and administrator-only", async () => {
      const list = async ({ query = "", area = "all", state = "actionable", sort = "priority", direction = "asc", page = 1, pageSize = 10 } = {}) =>
        (await db.query(
          "select public.staff_coordinate_verification($1,$2,$3,$4,$5,$6,$7) as result",
          [query, area, state, sort, direction, page, pageSize],
        )).rows[0].result;

      const missing = await save("lot", null, null, { ...lot("CV-001"), location_geom: null, coordinate_accuracy_m: null });
      const rejected = await save("lot", null, null, { ...lot("CV-002"), coordinate_accuracy_m: 8.25 });
      await save("lot", rejected.id, rejected.revision, { status: "rejected", reason: "Marker is outside the plot boundary" }, "review");

      const queue = await list();
      const directNeedsReview = (await db.query("select count(*)::int n from public.lot where deleted_at is null and (location_geom is null or coordinate_status in ('pending','rejected'))")).rows[0].n;
      const directVerified = (await db.query("select count(*)::int n from public.lot where deleted_at is null and location_geom is not null and coordinate_status='verified' and coordinate_verified")).rows[0].n;
      assert.equal(queue.total, directNeedsReview);
      assert.equal(queue.summary.needsVerification, directNeedsReview);
      assert.equal(queue.summary.verified, directVerified);
      assert.equal(queue.summary.needsVerification, queue.summary.missing + queue.summary.pending + queue.summary.rejected);
      assert.ok(queue.items.every((item) => ["missing", "pending", "rejected"].includes(item.coordinateState)));

      assert.equal((await list({ query: "CV-001" })).items[0].lotId, Number(missing.id));
      assert.ok((await list({ query: "Maria Santos", state: "all" })).items.some((item) => item.assignedDeceasedName === "Maria Santos"));
      assert.equal((await list({ area: "1" })).total, queue.total);
      assert.ok((await list({ state: "missing" })).items.every((item) => item.coordinateState === "missing"));
      const rejectedOnly = await list({ state: "rejected" });
      assert.equal(rejectedOnly.total, 1);
      assert.equal(rejectedOnly.items[0].rejectionReason, "Marker is outside the plot boundary");
      assert.ok(rejectedOnly.items[0].history.some((event) => event.event === "rejected" && event.actorName === "admin"));
      assert.ok((await list({ state: "verified" })).items.every((item) => item.coordinateState === "verified"));
      assert.equal((await list({ query: "CV-002", area: "1", state: "rejected" })).total, 1);

      const ascending = await list({ state: "all", sort: "plot", direction: "asc" });
      assert.deepEqual(ascending.items.map((item) => item.lotCode), [...ascending.items.map((item) => item.lotCode)].sort((a, b) => a.localeCompare(b)));
      const laterPage = await list({ state: "all", sort: "plot", direction: "asc", page: 2 });
      assert.ok(laterPage.items.length > 0);
      assert.ok(!ascending.items.some((item) => laterPage.items.some((next) => next.lotId === item.lotId)));
      assert.equal((await list({ state: "all", pageSize: 50 })).items.length, queue.totalAll);

      await login(manager);
      await assert.rejects(list(), /administrator|permission denied/);
      await login(null, "anon");
      await assert.rejects(list(), /permission denied|administrator/);
      await login(admin);
    });
    await t.test("dashboard aggregation follows burial, occupancy, verification, area, and audit rules", async () => {
      const missingLot = await save("lot", null, null, { ...lot("RPG-005"), location_geom: null, coordinate_accuracy_m: null });
      let rejectedLot = await save("lot", null, null, lot("RPG-006"));
      rejectedLot = await save("lot", rejectedLot.id, rejectedLot.revision, { status: "rejected", reason: "Marker needs recapture" }, "review");

      const dashboard = (await db.query("select public.staff_dashboard_data() as data")).rows[0].data;
      const expectedRecords = (await db.query("select count(*)::int n from public.burial_record where deleted_at is null")).rows[0].n;
      const expectedOccupied = (await db.query("select count(*)::int n from public.lot l where l.deleted_at is null and exists(select 1 from public.burial_record br where br.lot_id=l.lot_id)")).rows[0].n;
      const expectedAvailable = (await db.query("select count(*)::int n from public.lot l where l.deleted_at is null and l.status='AVAILABLE' and not exists(select 1 from public.burial_record br where br.lot_id=l.lot_id)")).rows[0].n;
      const expectedVerification = (await db.query("select count(*)::int n from public.lot where deleted_at is null and (location_geom is null or coordinate_status in ('pending','rejected'))")).rows[0].n;

      assert.equal(dashboard.summary.totalBurialRecords, expectedRecords);
      assert.equal(dashboard.summary.occupiedPlots, expectedOccupied);
      assert.equal(dashboard.summary.availablePlots, expectedAvailable);
      assert.equal(dashboard.summary.needsVerification, expectedVerification);
      assert.equal(dashboard.occupancy.occupied + dashboard.occupancy.available + dashboard.occupancy.booked + dashboard.occupancy.onHold, dashboard.occupancy.total);
      assert.equal(dashboard.occupancy.occupancyPercent, Math.round(expectedOccupied * 100 / dashboard.occupancy.total));
      assert.deepEqual(dashboard.burialsBySection.map((section) => section.areaName), ["Test garden"]);
      assert.equal(dashboard.burialsBySection[0].burialCount, expectedRecords);
      assert.ok(dashboard.recentChanges.length <= 6);
      assert.ok(dashboard.recentChanges.some((event) => event.label === "Coordinates rejected" && event.plotCode === "RPG-006"));
      assert.ok(dashboard.verificationItems.some((item) => item.lotId === Number(missingLot.id) && item.status === "missing"));
      assert.ok(dashboard.verificationItems.some((item) => item.lotId === Number(rejectedLot.id) && item.status === "rejected"));

      firstBurial = await save("burial_record", firstBurial.id, firstBurial.revision, {}, "delete");
      const afterSoftDelete = (await db.query("select public.staff_dashboard_data() as data")).rows[0].data;
      assert.equal(afterSoftDelete.summary.totalBurialRecords, expectedRecords - 1);
      assert.equal(afterSoftDelete.summary.occupiedPlots, expectedOccupied);
      firstBurial = await save("burial_record", firstBurial.id, firstBurial.revision, {}, "restore");

      await login(manager);
      assert.equal(typeof (await db.query("select public.staff_dashboard_data() as data")).rows[0].data.summary.totalBurialRecords, "number");
      await login(null, "anon");
      await assert.rejects(db.exec("select public.staff_dashboard_data()"), /permission denied/);
      await login(admin);
    });
  } finally { await db.close(); }
});
