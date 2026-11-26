"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildBurialTrendSeries,
  buildPendingTasksQueue,
  buildRecentActivityItems,
  buildSectionBurialBars,
  chooseDefaultDashboardPeriod,
  computeOccupancyMetrics,
  DASHBOARD_PERIOD_OPTIONS,
  DASHBOARD_TIMEZONE,
  summarizePublishedPhotos,
  type BurialTrendMetric,
  type BurialTrendMode,
  type DashboardPeriod,
} from "@/lib/admin-dashboard-analytics";
import {
  getAdminPhotoCounts,
  getAdminPhotos,
  getAdminPhotoThumbnails,
  getAuditLogPage,
  getDashboardBurialMetrics,
  getDashboardData,
  getDashboardPhotoMetrics,
  getPendingAccountCount,
  type AdminPhotoCounts,
  type DashboardBurialMetricRow,
  type DashboardPhotoMetricRow,
} from "@/lib/supabase/admin-data";
import type { AdminPhoto, AuditLogEntry, DashboardData } from "@/lib/supabase/types";
import type { VisitorSiteSettings } from "@/lib/site-settings";
import { useStaff } from "./staff-context";
import {
  BurialRecordsOverTimeCard,
  BurialsBySectionCard,
  CemeteryOccupancyCard,
} from "./admin-dashboard-charts";
import styles from "./admin-dashboard.module.css";

const PERIOD_STORAGE_KEY = "gravenav-admin-dashboard-period";

type SiteSettingsPayload = {
  settings: VisitorSiteSettings;
  persisted: boolean;
};

type DashboardState = {
  dashboard: DashboardData | null;
  burialRows: DashboardBurialMetricRow[];
  photoRows: DashboardPhotoMetricRow[];
  photoCounts: AdminPhotoCounts | null;
  pendingPhotos: AdminPhoto[];
  photoThumbnails: Record<number, string>;
  auditEntries: AuditLogEntry[];
  pendingAccountsCount: number;
  siteSettings: SiteSettingsPayload | null;
  partialErrors: string[];
  lastUpdated: Date | null;
};

const EMPTY_STATE: DashboardState = {
  dashboard: null,
  burialRows: [],
  photoRows: [],
  photoCounts: null,
  pendingPhotos: [],
  photoThumbnails: {},
  auditEntries: [],
  pendingAccountsCount: 0,
  siteSettings: null,
  partialErrors: [],
  lastUpdated: null,
};

function readStoredPeriod(): DashboardPeriod | null {
  try {
    const saved = sessionStorage.getItem(PERIOD_STORAGE_KEY);
    if (DASHBOARD_PERIOD_OPTIONS.some((opt) => opt.value === saved)) {
      return saved as DashboardPeriod;
    }
  } catch {
    // Ignore storage restriction.
  }
  return null;
}

function saveStoredPeriod(period: DashboardPeriod) {
  try {
    sessionStorage.setItem(PERIOD_STORAGE_KEY, period);
  } catch {
    // Ignore storage restriction.
  }
}

export function AdminFoundation() {
  const staff = useStaff();
  const canAdmin = ["ADMIN", "SUPER_ADMIN"].includes(staff?.role ?? "");
  const canManageStaff = staff?.canManageStaff === true;
  const [state, setState] = useState<DashboardState>(EMPTY_STATE);
  const [fatalError, setFatalError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<DashboardPeriod>(() => readStoredPeriod() ?? "last-12-months");
  const [periodTouched, setPeriodTouched] = useState(() => readStoredPeriod() !== null);
  const [trendMetric, setTrendMetric] = useState<BurialTrendMetric>("interment_date");
  const [trendMode, setTrendMode] = useState<BurialTrendMode>("period");

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setFatalError("");

    const [
      dashboardRes,
      burialsRes,
      photoRowsRes,
      pendingPhotosRes,
      auditRes,
      pendingAccountsRes,
      siteSettingsRes,
    ] = await Promise.allSettled([
      getDashboardData(),
      getDashboardBurialMetrics(),
      getDashboardPhotoMetrics(),
      getAdminPhotos({ status: "pending", pageSize: 4 }),
      getAuditLogPage({ page: 0, pageSize: 10 }),
      canManageStaff ? getPendingAccountCount() : Promise.resolve(0),
      canManageStaff ? fetch("/api/admin/site-settings", { cache: "no-store" }).then(async (res) => {
        if (!res.ok) throw new Error("Site settings unavailable");
        return (await res.json()) as SiteSettingsPayload;
      }) : Promise.resolve(null),
    ]);

    if (dashboardRes.status === "rejected") {
      setFatalError(
        dashboardRes.reason instanceof Error
          ? dashboardRes.reason.message
          : "The operational dashboard data could not be loaded.",
      );
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const partialErrors: string[] = [];
    const burialRows = burialsRes.status === "fulfilled" ? burialsRes.value : [];
    if (burialsRes.status === "rejected") partialErrors.push("Burial trend timeline could not be loaded.");

    const photoRows = photoRowsRes.status === "fulfilled" ? photoRowsRes.value : [];
    const photoCounts = photoRowsRes.status === "rejected"
      ? await getAdminPhotoCounts().catch(() => null)
      : null;
    if (photoRowsRes.status === "rejected" && !photoCounts) {
      partialErrors.push("Photo moderation metrics are temporarily unavailable.");
    }

    const pendingPhotos = pendingPhotosRes.status === "fulfilled" ? pendingPhotosRes.value.items : [];
    let photoThumbnails: Record<number, string> = {};
    if (pendingPhotos.length > 0) {
      photoThumbnails = await getAdminPhotoThumbnails(pendingPhotos.map((p) => p.photoId)).catch(() => ({}));
    }

    const auditEntries = auditRes.status === "fulfilled" ? auditRes.value.items : [];
    const pendingAccountsCount = pendingAccountsRes.status === "fulfilled" ? pendingAccountsRes.value : 0;
    const siteSettings = siteSettingsRes.status === "fulfilled" ? siteSettingsRes.value : null;

    setState({
      dashboard: dashboardRes.value,
      burialRows,
      photoRows,
      photoCounts,
      pendingPhotos,
      photoThumbnails,
      auditEntries,
      pendingAccountsCount,
      siteSettings,
      partialErrors,
      lastUpdated: new Date(),
    });

    if (!periodTouched && burialRows.length > 0) {
      setPeriod(chooseDefaultDashboardPeriod(burialRows));
    }

    setLoading(false);
    setRefreshing(false);
  }, [canManageStaff, periodTouched]);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!active) return;
      await fetchAll(false);
    })();
    return () => {
      active = false;
    };
  }, [fetchAll]);

  function handlePeriodChange(next: DashboardPeriod) {
    setPeriod(next);
    setPeriodTouched(true);
    saveStoredPeriod(next);
  }

  const trendSeries = useMemo(
    () => buildBurialTrendSeries(state.burialRows, period, trendMetric),
    [state.burialRows, period, trendMetric],
  );

  const sectionBars = useMemo(
    () => buildSectionBurialBars(state.burialRows, state.dashboard?.burialsBySection ?? []),
    [state.burialRows, state.dashboard?.burialsBySection],
  );

  const occupancyMetrics = useMemo(
    () =>
      computeOccupancyMetrics(
        state.dashboard?.occupancy ?? {
          occupied: 0,
          available: 0,
          booked: 0,
          onHold: 0,
          unknown: 0,
          total: 0,
          occupancyPercent: 0,
        },
      ),
    [state.dashboard?.occupancy],
  );

  const photoSummary = useMemo(() => {
    if (state.photoRows.length > 0 || state.photoCounts === null) {
      return summarizePublishedPhotos(state.photoRows);
    }
    return {
      pending: state.photoCounts.pending,
      visitorPending: state.photoCounts.visitorPending,
      approvedTotal: state.photoCounts.approved,
      publishedEligible: state.photoCounts.approved,
      visitorTotal: state.photoCounts.visitorPending,
      usesApprovedLabel: false,
    };
  }, [state.photoRows, state.photoCounts]);

  const pendingBurialsCount = useMemo(
    () => state.burialRows.filter((row) => row.recordStatus === "pending").length,
    [state.burialRows],
  );

  const publishedMemorialsCount = useMemo(
    () => state.burialRows.filter((row) => row.recordStatus === "active" && row.publicDisplay).length,
    [state.burialRows],
  );

  const recentActivity = useMemo(
    () => buildRecentActivityItems(state.dashboard?.recentChanges ?? [], state.auditEntries, canAdmin, 6),
    [state.dashboard?.recentChanges, state.auditEntries, canAdmin],
  );

  const pendingTasks = useMemo(
    () =>
      buildPendingTasksQueue({
        pendingPhotos: state.pendingPhotos,
        photoThumbnails: state.photoThumbnails,
        pendingPhotoTotal: photoSummary.pending,
        pendingBurialsCount,
        pendingAccountsCount: state.pendingAccountsCount,
        canAdmin: canManageStaff,
      }),
    [state.pendingPhotos, state.photoThumbnails, photoSummary.pending, pendingBurialsCount, state.pendingAccountsCount, canManageStaff],
  );

  const asOfTime = useMemo(() => {
    if (!state.lastUpdated) return "just now";
    return new Intl.DateTimeFormat("en-PH", {
      timeZone: DASHBOARD_TIMEZONE,
      hour: "numeric",
      minute: "2-digit",
    }).format(state.lastUpdated);
  }, [state.lastUpdated]);

  if (loading && !state.dashboard) {
    return <DashboardSkeleton />;
  }

  const totalBurials = state.dashboard?.summary.totalBurialRecords ?? state.burialRows.length;
  const mappedPhase2Lots = state.dashboard?.summary.syntheticPlots ?? 0;

  return (
    <div className={styles.dashboard}>
      {/* Band 0 — Header Banner & Reporting Period Controls */}
      <header className={styles.heroBanner}>
        <div aria-hidden="true" className={styles.heroBackdrop}>
          <Image alt="" className={styles.heroImgLight} height={320} priority src="/homepage/park-desktop-light.webp" width={640} />
          <Image alt="" className={styles.heroImgDark} height={320} src="/homepage/park-desktop-dark.webp" width={640} />
          <div className={styles.heroBackdropFeather} />
        </div>
        <div className={styles.heroInner}>
          <div>
            <p className={styles.heroEyebrow}>GraveNav Cemetery Management</p>
            <h1 className={styles.heroTitle}>Cemetery Analytics Dashboard</h1>
            <p className={styles.heroSubtitle}>
              Burial records, plot occupancy, photo activity, and operational workflows at a glance.
            </p>
          </div>

          <div className={styles.heroControls}>
            <div className={styles.heroControlsLeft}>
              <label className={styles.periodSelectWrap} htmlFor="dashboard-period-select">
                <Icon name="clock" size={15} />
                <span className="sr-only">Reporting period</span>
                <select
                  className={styles.periodSelect}
                  id="dashboard-period-select"
                  onChange={(event) => handlePeriodChange(event.target.value as DashboardPeriod)}
                  value={period}
                >
                  {DASHBOARD_PERIOD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <Icon className={styles.periodSelectChevron} name="chevronDown" size={14} />
              </label>

              <span className={styles.rangeMeta}>
                {trendSeries.rangeLabel} · {DASHBOARD_TIMEZONE}
              </span>

              {trendSeries.comparison && trendSeries.comparison.kind === "percent" ? (
                <span
                  className={`${styles.periodPill} ${
                    trendSeries.comparison.direction === "up"
                      ? styles.periodPillPositive
                      : styles.periodPillNeutral
                  }`}
                >
                  {trendSeries.comparison.direction === "up" ? "↑" : trendSeries.comparison.direction === "down" ? "↓" : "·"}{" "}
                  {trendSeries.comparison.label}
                </span>
              ) : trendSeries.comparison && trendSeries.comparison.kind === "absolute" ? (
                <span className={`${styles.periodPill} ${styles.periodPillPositive}`}>
                  {trendSeries.comparison.label}
                </span>
              ) : null}
            </div>

            <div className={styles.heroControlsRight}>
              <span className={styles.updatedLabel}>Updated {asOfTime}</span>
              <button
                className={styles.refreshButton}
                disabled={refreshing}
                onClick={() => void fetchAll(true)}
                type="button"
              >
                <Icon name="clock" size={14} />
                <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {fatalError ? (
        <Alert icon="alert" title="Dashboard data unavailable" variant="danger">
          <span>{fatalError}</span>
          <Button onClick={() => void fetchAll(false)} variant="quiet">
            Try again
          </Button>
        </Alert>
      ) : null}

      {state.partialErrors.length > 0 ? (
        <div className={styles.partialNotice} role="status">
          <span>{state.partialErrors.join(" ")}</span>
          <button className={styles.sortToggleBtn} onClick={() => void fetchAll(true)} type="button">
            Retry
          </button>
        </div>
      ) : null}

      {state.dashboard ? (
        <>
          {/* Band 1 — Six Compact KPI Cards */}
          <section aria-label="Key cemetery metrics" className={styles.kpiGrid}>
            <KpiCard
              href="/admin/burial-records"
              icon="memorial"
              label="Total Burial Records"
              meta={
                trendSeries.totalInPeriod > 0 && period !== "all-time"
                  ? `${trendSeries.totalInPeriod.toLocaleString()} in selected period`
                  : "Active, pending & archived"
              }
              metaTone={trendSeries.totalInPeriod > 0 ? "positive" : "neutral"}
              value={totalBurials.toLocaleString()}
            />

            <KpiCard
              attention={photoSummary.pending > 0}
              href="/admin/photos"
              icon="photos"
              label="Pending Photo Reviews"
              meta={
                photoSummary.pending > 0
                  ? `${photoSummary.visitorPending} visitor ${photoSummary.visitorPending === 1 ? "submission" : "submissions"}`
                  : "Moderation queue clear"
              }
              metaTone={photoSummary.pending > 0 ? "attention" : "positive"}
              value={photoSummary.pending.toLocaleString()}
            />

            <KpiCard
              href="/admin/photos?status=approved"
              icon="check"
              label={photoSummary.usesApprovedLabel ? "Approved Photos" : "Published Photos"}
              meta={
                photoSummary.approvedTotal !== photoSummary.publishedEligible
                  ? `${photoSummary.approvedTotal.toLocaleString()} approved total`
                  : "Eligible for public site"
              }
              metaTone="positive"
              value={(photoSummary.usesApprovedLabel
                ? photoSummary.approvedTotal
                : photoSummary.publishedEligible
              ).toLocaleString()}
            />

            <KpiCard
              href="/admin/plot-management"
              icon="grid"
              label="Total Plots"
              meta={`As of ${asOfTime}`}
              metaTone="neutral"
              value={occupancyMetrics.total.toLocaleString()}
            />

            <KpiCard
              href="/admin/plot-management?state=occupied"
              icon="verification"
              label="Occupancy Rate"
              meta={
                !occupancyMetrics.classificationIncomplete && totalBurials > occupancyMetrics.occupied
                  ? `${occupancyMetrics.occupied.toLocaleString()} of ${occupancyMetrics.total.toLocaleString()} plots (${totalBurials.toLocaleString()} interments)`
                  : occupancyMetrics.rateSubtext
              }
              metaTone={occupancyMetrics.classificationIncomplete ? "neutral" : "positive"}
              value={occupancyMetrics.rateDisplay}
            />

            <KpiCard
              href="/admin/plot-management?state=available"
              icon="layers"
              label="Available Plots"
              meta={occupancyMetrics.availabilitySubtext}
              metaTone={occupancyMetrics.available > 0 ? "positive" : "neutral"}
              value={occupancyMetrics.available.toLocaleString()}
            />
          </section>

          {/* Band 2 — Three-Column Primary Analytics Row */}
          <div className={styles.analyticsRow}>
            <BurialRecordsOverTimeCard
              error={state.partialErrors.find((msg) => msg.includes("Burial trend"))}
              metric={trendMetric}
              mode={trendMode}
              onMetricChange={setTrendMetric}
              onModeChange={setTrendMode}
              onSwitchToAllTime={() => handlePeriodChange("all-time")}
              series={trendSeries}
            />

            <BurialsBySectionCard sections={sectionBars} totalBurialRecords={totalBurials} />

            <CemeteryOccupancyCard asOfLabel={asOfTime} metrics={occupancyMetrics} totalInterments={totalBurials} />
          </div>

          {/* Band 3 — Three-Column Operations Row */}
          <div className={styles.operationsRow}>
            {/* Visitor Memorial Activity — Honest Deferred / Not Configured State (AC-07) */}
            <section aria-labelledby="dash-visitor-activity-title" className={styles.panel}>
              <header className={styles.panelHeader}>
                <div className={styles.panelTitleWrap}>
                  <span className={styles.panelIcon}>
                    <Icon name="users" size={16} />
                  </span>
                  <div>
                    <h2 className={styles.panelTitle} id="dash-visitor-activity-title">
                      Visitor Memorial Activity
                    </h2>
                    <p className={styles.panelSubtitle}>Visitor views, profile visits, and engagement</p>
                  </div>
                </div>
              </header>
              <div className={styles.panelBody}>
                <div className={styles.deferredBox}>
                  <div className={styles.deferredStatusRow}>
                    <span className={styles.deferredBadge}>Analytics not configured</span>
                    <span className={styles.chartScopeNote}>Deferred scope</span>
                  </div>
                  <p className={styles.deferredCopy}>
                    Aggregated visitor search, memorial view, and map-guidance telemetry is not instrumented yet. No
                    visit totals or bars are simulated.
                  </p>
                  <div className={styles.deferredSignal}>
                    <div className={styles.deferredSignalLabel}>
                      <strong>Visitor Photo Contributions</strong>
                      <span>Verified public submissions recorded in database</span>
                    </div>
                    <strong className={styles.deferredSignalCount}>
                      {photoSummary.visitorTotal.toLocaleString()}
                    </strong>
                  </div>
                </div>
              </div>
            </section>

            {/* Cemetery Plot Map (Overview) — Contextual Read-Only Preview (AC-08) */}
            <section aria-labelledby="dash-map-overview-title" className={styles.panel}>
              <header className={styles.panelHeader}>
                <div className={styles.panelTitleWrap}>
                  <span className={styles.panelIcon}>
                    <Icon name="location" size={16} />
                  </span>
                  <div>
                    <h2 className={styles.panelTitle} id="dash-map-overview-title">
                      Cemetery Plot Map (Overview)
                    </h2>
                    <p className={styles.panelSubtitle}>Forest Lake Phase 2 layout preview</p>
                  </div>
                </div>
                <Link className={styles.panelLink} href="/admin/cemetery-map">
                  Open Map
                  <Icon name="arrowUpRight" size={13} />
                </Link>
              </header>
              <div className={styles.panelBody}>
                <div className={styles.mapPreviewLayout}>
                  <Link
                    aria-label="Open interactive Forest Lake Phase 2 Cemetery Map"
                    className={styles.mapVisualFrame}
                    href="/admin/cemetery-map"
                  >
                    <div aria-hidden="true" className={styles.mapPhase2Stack}>
                      <Image alt="" height={512} src="/phase2-viewer/landscape/base.png" unoptimized width={512} />
                      <Image alt="" height={512} src="/phase2-viewer/landscape/protection.png" unoptimized width={512} />
                      <Image alt="" height={512} src="/phase2-viewer/landscape/roads.png" unoptimized width={512} />
                      <Image alt="" height={512} src="/phase2-viewer/landscape/paths.png" unoptimized width={512} />
                      <Image alt="" height={512} src="/phase2-planning/cad-details/site.fa4d57bae695.svg" unoptimized width={512} />
                      <Image alt="" height={512} src="/phase2-viewer/landscape/trees.png" unoptimized width={512} />
                    </div>
                    <span className={styles.mapVisualTag}>Phase 2 Baseline</span>
                  </Link>
                  <div className={styles.mapSideInfo}>
                    <dl className={styles.mapFacts}>
                      <div>
                        <dt>Phase 2 lots</dt>
                        <dd>{mappedPhase2Lots.toLocaleString()}</dd>
                      </div>
                      <div>
                        <dt>Occupied</dt>
                        <dd>{occupancyMetrics.occupied.toLocaleString()}</dd>
                      </div>
                      <div>
                        <dt>Sections</dt>
                        <dd>{sectionBars.filter((s) => !s.isUnassigned).length}</dd>
                      </div>
                    </dl>
                    <p className={styles.mapDisclaimer}>
                      Planning outline reference only. Inspect layers and plot assignments in Cemetery Map.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Quick Actions — Compact 2x2 Grid (Section 7) */}
            <section aria-labelledby="dash-quick-actions-title" className={styles.panel}>
              <header className={styles.panelHeader}>
                <div className={styles.panelTitleWrap}>
                  <span className={styles.panelIcon}>
                    <Icon name="target" size={16} />
                  </span>
                  <div>
                    <h2 className={styles.panelTitle} id="dash-quick-actions-title">
                      Quick Actions
                    </h2>
                    <p className={styles.panelSubtitle}>Common cemetery management tasks</p>
                  </div>
                </div>
              </header>
              <div className={styles.panelBody}>
                <div className={styles.quickActionsGrid}>
                  <Link
                    className={`${styles.quickActionBtn} ${styles.quickActionPrimary} admin-quick-action-btn`}
                    href="/admin/burial-records/new"
                  >
                    <Icon name="plus" size={15} />
                    <span>Add Burial Record</span>
                  </Link>
                  <Link
                    className={`${styles.quickActionBtn} ${
                      photoSummary.pending > 0 ? styles.quickActionAttention : styles.quickActionSoftYellow
                    } admin-quick-action-btn`}
                    href="/admin/photos"
                  >
                    <Icon name="photos" size={15} />
                    <span>
                      Moderate Photos{photoSummary.pending > 0 ? ` (${photoSummary.pending})` : ""}
                    </span>
                  </Link>
                  <Link
                    className={`${styles.quickActionBtn} admin-quick-action-btn`}
                    href="/admin/reports"
                  >
                    <Icon name="reports" size={15} />
                    <span>Generate Report</span>
                  </Link>
                  <Link
                    className={`${styles.quickActionBtn} admin-quick-action-btn`}
                    href="/admin/cemetery-map"
                  >
                    <Icon name="map" size={15} />
                    <span>Open Map</span>
                  </Link>
                </div>
              </div>
            </section>
          </div>

          {/* Band 4 — Recent Activity & Pending Reviews / Tasks */}
          <div className={styles.actionRow}>
            <section aria-labelledby="dash-recent-activity-title" className={styles.panel}>
              <header className={styles.panelHeader}>
                <div className={styles.panelTitleWrap}>
                  <span className={styles.panelIcon}>
                    <Icon name="audit" size={16} />
                  </span>
                  <div>
                    <h2 className={styles.panelTitle} id="dash-recent-activity-title">
                      Recent Activity
                    </h2>
                    <p className={styles.panelSubtitle}>Latest administrator and system events</p>
                  </div>
                </div>
                <Link className={styles.panelLink} href="/admin/audit-log">
                  View Audit Log
                  <Icon name="arrowUpRight" size={13} />
                </Link>
              </header>
              <div className={styles.panelBody}>
                {recentActivity.length === 0 ? (
                  <div className={styles.trendEmpty} role="status">
                    <p className={styles.trendEmptyTitle}>No recent audit events</p>
                    <p className={styles.trendEmptyDesc}>
                      Burial, plot, photo, and configuration changes will appear here once recorded.
                    </p>
                  </div>
                ) : (
                  <ol className={styles.activityList}>
                    {recentActivity.map((item) => (
                      <li className={styles.activityItem} key={item.id}>
                        <Link className={styles.activityRowLink} href={item.href || "/admin/audit-log"}>
                          <span aria-hidden="true" className={styles.activityIcon}>
                            <Icon name={item.icon} size={15} />
                          </span>
                          <span className={styles.activityText}>
                            <strong>{item.label}</strong>
                            <span>{item.detail}</span>
                          </span>
                          <time className={styles.activityTime} dateTime={item.createdAt}>
                            {formatRelativeAuditTime(item.createdAt)}
                          </time>
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>

            <section aria-labelledby="dash-pending-tasks-title" className={styles.panel}>
              <header className={styles.panelHeader}>
                <div className={styles.panelTitleWrap}>
                  <span className={`${styles.panelIcon} ${pendingTasks.total > 0 ? styles.panelIconYellow : ""}`}>
                    <Icon name="check" size={16} />
                  </span>
                  <div>
                    <h2 className={styles.panelTitle} id="dash-pending-tasks-title">
                      Pending Reviews &amp; Tasks
                    </h2>
                    <p className={styles.panelSubtitle}>Items that need your attention</p>
                  </div>
                </div>
                <span
                  className={`${styles.taskTotalPill} ${
                    pendingTasks.total > 0 ? styles.taskTotalAttention : styles.taskTotalClear
                  }`}
                >
                  {pendingTasks.total > 0 ? `${pendingTasks.total.toLocaleString()} total` : "All caught up"}
                </span>
              </header>
              <div className={styles.panelBody}>
                {pendingTasks.items.length === 0 ? (
                  <div className={styles.trendEmpty} role="status">
                    <p className={styles.trendEmptyTitle}>No pending reviews right now</p>
                    <p className={styles.trendEmptyDesc}>
                      All submitted photos, pending burial records{canManageStaff ? ", and staff account requests" : ""} have been addressed.
                    </p>
                  </div>
                ) : (
                  <ol className={styles.taskList}>
                    {pendingTasks.items.map((task) => (
                      <li className={styles.taskItem} key={task.id}>
                        <Link className={styles.taskRowLink} href={task.href}>
                          <span aria-hidden="true" className={styles.taskThumb}>
                            {task.thumbnailUrl ? (
                              <Image alt="" height={34} src={task.thumbnailUrl} unoptimized width={44} />
                            ) : (
                              <Icon
                                name={
                                  task.type === "photo_review"
                                    ? "photos"
                                    : task.type === "account_approval"
                                      ? "users"
                                      : "records"
                                }
                                size={16}
                              />
                            )}
                          </span>
                          <span className={styles.activityText}>
                            <strong>{task.title}</strong>
                            <span>{task.subtitle}</span>
                          </span>
                          <span
                            className={`${styles.taskBadge} ${
                              task.tone === "warning"
                                ? styles.taskBadgeWarning
                                : task.tone === "success"
                                  ? styles.taskBadgeSuccess
                                  : task.tone === "info"
                                    ? styles.taskBadgeInfo
                                    : styles.taskBadgeNeutral
                            }`}
                          >
                            {task.badgeLabel}
                          </span>
                          <Icon name="chevronRight" size={15} />
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>
          </div>

          {/* Band 5 — Footer Row: Visitor Site Controls */}
          <section aria-labelledby="dash-site-controls-title" className={styles.panel}>
            <header className={styles.panelHeader}>
              <div className={styles.panelTitleWrap}>
                <span className={styles.panelIcon}>
                  <Icon name="sliders" size={16} />
                </span>
                <div>
                  <h2 className={styles.panelTitle} id="dash-site-controls-title">
                    Visitor Site Controls
                  </h2>
                  <p className={styles.panelSubtitle}>
                    Manage what visitors can see and do on the public memorial site.
                  </p>
                </div>
              </div>
            </header>
            <div className={styles.panelBody}>
              <div className={styles.siteControlsGrid}>
                <SiteControlCard
                  description="Publish or hide deceased profiles, edit life dates, inscriptions, and family portraits."
                  href="/admin/burial-records"
                  icon="eye"
                  statusLabel={
                    publishedMemorialsCount > 0
                      ? `${publishedMemorialsCount.toLocaleString()} published`
                      : "Needs review"
                  }
                  statusTone={publishedMemorialsCount > 0 ? "green" : "neutral"}
                  title="Memorial Visibility & Inscriptions"
                />
                <SiteControlCard
                  description="Review and approve visitor-submitted portraits and gallery remembrance photos."
                  href="/admin/photos"
                  icon="photos"
                  statusLabel={
                    photoSummary.pending > 0
                      ? `${photoSummary.pending.toLocaleString()} pending`
                      : "Queue clear"
                  }
                  statusTone={photoSummary.pending > 0 ? "yellow" : "green"}
                  title="Photo Moderation"
                />
                <SiteControlCard
                  description="Inspect the Phase 2 Park Map and Esri Satellite layers and linked memorial plots."
                  href="/admin/cemetery-map"
                  icon="map"
                  statusLabel="Phase 2 active"
                  statusTone="green"
                  title="Interactive Cemetery Map"
                />
                {canManageStaff && <SiteControlCard
                  description="Update park hours, contact details, visitor announcements, and photo submission toggles."
                  href="/admin/site-settings"
                  icon="settings"
                  statusLabel={
                    !canAdmin
                      ? "View only"
                      : state.siteSettings?.settings.announcementEnabled
                        ? "Announcement live"
                        : state.siteSettings?.persisted
                          ? "Configured"
                          : "Default config"
                  }
                  statusTone={
                    state.siteSettings?.settings.announcementEnabled
                      ? "yellow"
                      : state.siteSettings?.persisted
                        ? "green"
                        : "neutral"
                  }
                  title="Visitor Site Settings"
                />}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function KpiCard({
  href,
  icon,
  label,
  value,
  meta,
  metaTone = "neutral",
  attention = false,
}: {
  href: string;
  icon: IconName;
  label: string;
  value: string;
  meta: string;
  metaTone?: "positive" | "attention" | "neutral";
  attention?: boolean;
}) {
  return (
    <Link className={`${styles.kpiCard} ${attention ? styles.kpiCardAttention : ""} admin-kpi-card`} href={href}>
      <div className={styles.kpiTop}>
        <span aria-hidden="true" className={`${styles.kpiIcon} ${attention ? styles.kpiIconAttention : ""}`}>
          <Icon name={icon} size={17} />
        </span>
        <div className={styles.kpiText}>
          <span className={styles.kpiLabel}>{label}</span>
          <strong className={styles.kpiValue}>{value}</strong>
        </div>
      </div>
      <span
        className={`${styles.kpiMeta} ${
          metaTone === "positive"
            ? styles.kpiMetaPositive
            : metaTone === "attention"
              ? styles.kpiMetaAttention
              : styles.kpiMetaNeutral
        }`}
      >
        {meta}
      </span>
    </Link>
  );
}

function SiteControlCard({
  href,
  icon,
  title,
  description,
  statusLabel,
  statusTone,
}: {
  href: string;
  icon: IconName;
  title: string;
  description: string;
  statusLabel: string;
  statusTone: "green" | "yellow" | "neutral";
}) {
  return (
    <Link className={`${styles.siteControlCard} admin-site-control-card`} href={href}>
      <div className={styles.siteControlTop}>
        <span aria-hidden="true" className={styles.panelIcon}>
          <Icon name={icon} size={16} />
        </span>
        <div className={styles.siteControlText}>
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
      </div>
      <div className={styles.siteControlFoot}>
        <span
          className={`${styles.statusPill} ${
            statusTone === "green"
              ? styles.statusPillGreen
              : statusTone === "yellow"
                ? styles.statusPillYellow
                : styles.statusPillNeutral
          }`}
        >
          {statusTone === "green" ? <Icon name="check" size={12} /> : null}
          {statusLabel}
        </span>
        <Icon name="chevronRight" size={15} />
      </div>
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard data" className={styles.dashboard} role="status">
      <span className="sr-only">Loading cemetery analytics…</span>
      <Skeleton className={styles.skeletonBanner} />
      <div className={styles.kpiGrid}>
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton className={styles.skeletonKpi} key={index} />
        ))}
      </div>
      <div className={styles.analyticsRow}>
        <Skeleton className={`${styles.skeletonCard} ${styles.trendPanel}`} />
        <Skeleton className={styles.skeletonCard} />
        <Skeleton className={styles.skeletonCard} />
      </div>
      <div className={styles.operationsRow}>
        <Skeleton className={styles.skeletonCardShort} />
        <Skeleton className={styles.skeletonCardShort} />
        <Skeleton className={styles.skeletonCardShort} />
      </div>
    </div>
  );
}

function formatRelativeAuditTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  const now = new Date();
  const dayFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: DASHBOARD_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const timeFmt = new Intl.DateTimeFormat("en-PH", {
    timeZone: DASHBOARD_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  });
  const todayKey = dayFmt.format(now);
  const yesterdayKey = dayFmt.format(new Date(now.getTime() - 86_400_000));
  const eventKey = dayFmt.format(date);

  if (eventKey === todayKey) return `Today, ${timeFmt.format(date)}`;
  if (eventKey === yesterdayKey) return `Yesterday, ${timeFmt.format(date)}`;
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: DASHBOARD_TIMEZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
