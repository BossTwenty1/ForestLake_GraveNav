import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBurialTrendSeries,
  buildPendingTasksQueue,
  buildRecentActivityItems,
  buildSectionBurialBars,
  chooseDefaultDashboardPeriod,
  computeOccupancyMetrics,
  computePeriodDelta,
  sanitizeAuditEntityText,
  summarizePublishedPhotos,
} from "../src/lib/admin-dashboard-analytics.ts";

test("computePeriodDelta enforces strict zero-denominator rules (Section 4.2)", () => {
  const pct = computePeriodDelta(15, 10);
  assert.equal(pct.kind, "percent");
  assert.equal(pct.percent, 50);
  assert.equal(pct.direction, "up");

  const down = computePeriodDelta(8, 10);
  assert.equal(down.kind, "percent");
  assert.equal(down.percent, -20);
  assert.equal(down.direction, "down");

  const zeroPrior = computePeriodDelta(12, 0);
  assert.equal(zeroPrior.kind, "absolute");
  assert.equal(zeroPrior.delta, 12);
  assert.match(zeroPrior.label, /\+12 vs\. 0 prior/);

  const bothZero = computePeriodDelta(0, 0);
  assert.equal(bothZero.kind, "no-baseline");
  assert.equal(bothZero.label, "No comparable prior baseline");
});

test("buildBurialTrendSeries keeps interment_date and created_at strictly separate and buckets accurately", () => {
  const now = new Date("2026-11-24T12:00:00+08:00");
  const rows = [
    { burialId: 1, lotId: 10, recordStatus: "active", publicDisplay: true, intermentDate: "2020-05-10", createdAt: "2026-11-21T08:00:00Z", areaId: 1, areaName: "Butterfly Palm Garden A" },
    { burialId: 2, lotId: 10, recordStatus: "active", publicDisplay: true, intermentDate: "2022-08-14", createdAt: "2026-11-21T09:00:00Z", areaId: 1, areaName: "Butterfly Palm Garden A" },
    { burialId: 3, lotId: 11, recordStatus: "pending", publicDisplay: false, intermentDate: null, createdAt: "2026-11-21T10:00:00Z", areaId: 2, areaName: "Majestic Palm Garden A" },
  ];

  assert.equal(chooseDefaultDashboardPeriod(rows, now), "all-time");

  const interment12m = buildBurialTrendSeries(rows, "last-12-months", "interment_date", now);
  assert.equal(interment12m.totalInPeriod, 0);
  assert.equal(interment12m.excludedUndatedCount, 1);
  assert.equal(interment12m.points.length, 12);

  const created12m = buildBurialTrendSeries(rows, "last-12-months", "created_at", now);
  assert.equal(created12m.totalInPeriod, 3);
  assert.equal(created12m.points[created12m.points.length - 1].count, 3);
  assert.equal(created12m.points[created12m.points.length - 1].cumulative, 3);

  const allTimeInterments = buildBurialTrendSeries(rows, "all-time", "interment_date", now);
  assert.equal(allTimeInterments.interval, "year");
  assert.equal(allTimeInterments.points.map((p) => p.label).join(","), "2020,2021,2022");
  assert.equal(allTimeInterments.points.map((p) => p.count).join(","), "1,0,1");
  assert.equal(allTimeInterments.points.map((p) => p.cumulative).join(","), "1,1,2");
});

test("buildSectionBurialBars counts each interment on shared gravesites and preserves unassigned bucket", () => {
  const rows = [
    { burialId: 1, lotId: 50, recordStatus: "active", publicDisplay: true, intermentDate: "2020-01-01", createdAt: "2026-11-21T00:00:00Z", areaId: 1, areaName: "Majestic Palm Garden C" },
    { burialId: 2, lotId: 50, recordStatus: "active", publicDisplay: true, intermentDate: "2021-01-01", createdAt: "2026-11-21T00:00:00Z", areaId: 1, areaName: "Majestic Palm Garden C" },
    { burialId: 3, lotId: 51, recordStatus: "active", publicDisplay: true, intermentDate: "2022-01-01", createdAt: "2026-11-21T00:00:00Z", areaId: 2, areaName: "Butterfly Palm Garden B" },
    { burialId: 4, lotId: null, recordStatus: "pending", publicDisplay: false, intermentDate: null, createdAt: "2026-11-21T00:00:00Z", areaId: null, areaName: null },
  ];

  const bars = buildSectionBurialBars(rows);
  assert.equal(bars.length, 3);
  assert.deepEqual(bars[0], { areaId: 1, areaName: "Majestic Palm Garden C", burialCount: 2, isUnassigned: false });
  assert.deepEqual(bars[1], { areaId: 2, areaName: "Butterfly Palm Garden B", burialCount: 1, isUnassigned: false });
  assert.deepEqual(bars[2], { areaId: null, areaName: "Unassigned / unknown section", burialCount: 1, isUnassigned: true });
});

test("computeOccupancyMetrics avoids misleading rates when classification is incomplete or zero", () => {
  const incomplete = computeOccupancyMetrics({
    occupied: 0, available: 0, booked: 0, onHold: 4494, unknown: 0, total: 4494, occupancyPercent: 0,
  });
  assert.equal(incomplete.occupancyRate, null);
  assert.equal(incomplete.rateDisplay, "N/A");
  assert.equal(incomplete.classificationIncomplete, true);

  const empty = computeOccupancyMetrics({
    occupied: 0, available: 0, booked: 0, onHold: 0, unknown: 0, total: 0, occupancyPercent: 0,
  });
  assert.equal(empty.occupancyRate, null);
  assert.equal(empty.rateDisplay, "N/A");

  const realPhase2 = computeOccupancyMetrics({
    occupied: 90, available: 0, booked: 0, onHold: 4494, unknown: 0, total: 4584, occupancyPercent: 2,
  });
  assert.equal(realPhase2.occupancyRate, 2);
  assert.equal(realPhase2.rateDisplay, "2%");
  assert.equal(realPhase2.total, 4584);
  assert.match(realPhase2.availabilitySubtext, /4,494 on hold/);
});

test("summarizePublishedPhotos distinguishes approved total vs publicly eligible memorials", () => {
  const summary = summarizePublishedPhotos([
    { photoId: 1, approvalStatus: "approved", publicDisplay: true, uploadedBy: null, createdAt: "2026-11-21", burialActivePublic: true },
    { photoId: 2, approvalStatus: "approved", publicDisplay: true, uploadedBy: "staff-1", createdAt: "2026-11-21", burialActivePublic: false },
    { photoId: 3, approvalStatus: "pending", publicDisplay: false, uploadedBy: null, createdAt: "2026-11-22", burialActivePublic: true },
  ]);
  assert.equal(summary.publishedEligible, 1);
  assert.equal(summary.approvedTotal, 2);
  assert.equal(summary.pending, 1);
  assert.equal(summary.visitorPending, 1);
  assert.equal(summary.visitorTotal, 2);
});

test("pending tasks and activity respect ADMIN vs MANAGER role boundaries and scrub hashes/UUIDs", () => {
  assert.equal(sanitizeAuditEntityText(`P2S-${"a".repeat(64)}`), "Phase 2 plot");
  assert.equal(sanitizeAuditEntityText("123e4567-e89b-12d3-a456-426614174000"), "Protected record");

  const adminQueue = buildPendingTasksQueue({
    pendingPhotos: [],
    photoThumbnails: {},
    pendingPhotoTotal: 2,
    pendingBurialsCount: 3,
    pendingAccountsCount: 4,
    canAdmin: true,
  });
  assert.equal(adminQueue.total, 9);
  assert.ok(adminQueue.items.some((item) => item.type === "account_approval"));

  const managerQueue = buildPendingTasksQueue({
    pendingPhotos: [],
    photoThumbnails: {},
    pendingPhotoTotal: 2,
    pendingBurialsCount: 3,
    pendingAccountsCount: 4,
    canAdmin: false,
  });
  assert.equal(managerQueue.total, 5);
  assert.ok(!managerQueue.items.some((item) => item.type === "account_approval"));

  const auditEntries = [
    { audit_id: 10, actor_account_id: null, action: "update", table_name: "account", record_id: "123e4567-e89b-12d3-a456-426614174000", new_values: { username: "Staff" }, created_at: "2026-11-24T10:00:00Z" },
    { audit_id: 11, actor_account_id: null, action: "insert", table_name: "photo", record_id: "5", new_values: { file_name: "memorial.jpg" }, created_at: "2026-11-24T09:00:00Z" },
  ];
  const managerActivity = buildRecentActivityItems([], auditEntries, false);
  assert.equal(managerActivity.length, 1);
  assert.equal(managerActivity[0].label, "Photo uploaded");

  const adminActivity = buildRecentActivityItems([], auditEntries, true);
  assert.equal(adminActivity.length, 2);
});
