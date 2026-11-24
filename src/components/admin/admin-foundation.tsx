"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon, type IconName } from "@/components/ui/icons";
import { PageHeading } from "@/components/ui/page-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminPhotoCounts, getDashboardData, type AdminPhotoCounts } from "@/lib/supabase/admin-data";
import type { DashboardData } from "@/lib/supabase/types";

type Tone = "success" | "warning" | "danger" | "neutral";

export function AdminFoundation() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [photoCounts, setPhotoCounts] = useState<AdminPhotoCounts | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextDashboard, nextPhotos] = await Promise.all([
        getDashboardData(),
        getAdminPhotoCounts().catch(() => null),
      ]);
      setDashboard(nextDashboard);
      setPhotoCounts(nextPhotos);
    } catch (reason) {
      setDashboard(null);
      setError(reason instanceof Error ? reason.message : "The operational data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      getDashboardData(),
      getAdminPhotoCounts().catch(() => null),
    ])
      .then(([nextDashboard, nextPhotos]) => {
        if (!active) return;
        setDashboard(nextDashboard);
        setPhotoCounts(nextPhotos);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "The operational data could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const pendingPhotos = photoCounts?.pending ?? 0;

  return (
    <div className="admin-foundation">
      <PageHeading
        actions={(
          <>
            <Link className="admin-page-action admin-page-action--primary" href="/admin/burial-records/new">
              <Icon name="plus" size={17} />
              <span>Add burial record</span>
            </Link>
            <Link
              className={`admin-page-action ${pendingPhotos > 0 ? "admin-page-action--attention" : "admin-page-action--secondary"}`}
              href="/admin/photos"
            >
              <Icon name="photos" size={16} />
              <span>Moderate photos{pendingPhotos > 0 ? ` (${pendingPhotos})` : ""}</span>
            </Link>
            <Link className="admin-page-action admin-page-action--secondary" href="/admin/reports">
              <Icon name="reports" size={16} />
              <span>Generate report</span>
            </Link>
            <Link className="admin-page-action admin-page-action--secondary" href="/admin/cemetery-map">
              <Icon name="map" size={16} />
              <span>Open map</span>
            </Link>
          </>
        )}
        description="Manage visitor memorial records, submitted remembrance photos, plot inventory, and cemetery analytics."
        title="Dashboard"
      />

      {error ? (
        <Alert icon="alert" title="Dashboard data unavailable" variant="danger">
          <span>{error}</span>
          <Button onClick={() => void loadDashboard()} variant="quiet">Try again</Button>
        </Alert>
      ) : null}

      {loading ? <DashboardLoading /> : null}
      {!loading && dashboard ? <DashboardContent data={dashboard} photoCounts={photoCounts} /> : null}
    </div>
  );
}

function DashboardContent({ data, photoCounts }: { data: DashboardData; photoCounts: AdminPhotoCounts | null }) {
  const { summary } = data;
  const pendingPhotos = photoCounts?.pending ?? 0;
  const publishedPhotos = photoCounts?.approved ?? 0;

  return (
    <>
      <section aria-label="Operational summary" className="admin-dashboard-metrics">
        <AdminStatCard detail="Active, pending, and archived memorial records" href="/admin/burial-records" icon="records" label="Total burial records" value={summary.totalBurialRecords} />
        <AdminStatCard detail="Pending visitor portraits & gallery tributes" href="/admin/photos" icon="photos" label="Pending photo reviews" tone={pendingPhotos > 0 ? "warning" : "success"} value={pendingPhotos} />
        <AdminStatCard detail="Approved portraits & gallery photos live on site" href="/admin/photos" icon="check" label="Published photos" tone="success" value={publishedPhotos} />
        <AdminStatCard detail="Total cemetery plots in register" href="/admin/plot-management" icon="grid" label="Total plots" value={summary.occupiedPlots + summary.availablePlots + (summary.syntheticPlots ?? 0) + (data.occupancy.booked + data.occupancy.onHold + data.occupancy.unknown)} />
      </section>

      <div className="admin-dashboard-insights">
        <BurialsBySection sections={data.burialsBySection} />
        <div className="admin-dashboard-insights__rail">
          <CemeteryOccupancy occupancy={data.occupancy} />
          <RecentChanges changes={data.recentChanges} />
        </div>
      </div>

      <VisitorContentQuickPanel photoCounts={photoCounts} />
    </>
  );
}

function VisitorContentQuickPanel({ photoCounts }: { photoCounts: AdminPhotoCounts | null }) {
  const pending = photoCounts?.pending ?? 0;
  const visitorPending = photoCounts?.visitorPending ?? 0;
  return (
    <Card className="admin-dashboard-panel">
      <DashboardPanelHeader
        action={pending > 0 ? <Badge variant="warning">{pending} awaiting review</Badge> : <Badge variant="success">All caught up</Badge>}
        description="Dynamic controls for what visitors see on search results, memorial profiles, and the Phase 2 map"
        icon="photos"
        title="Visitor Site Controls"
        tone={pending > 0 ? "warning" : "success"}
      />
      <CardContent>
        <div className="admin-settings-grid">
          <Link className="admin-stat-card admin-stat-card--neutral" href="/admin/burial-records">
            <div className="admin-stat-card__header">
              <span>Memorial Visibility &amp; Inscriptions</span>
              <span className="admin-section-icon admin-section-icon--neutral"><Icon name="records" size={18} /></span>
            </div>
            <span className="admin-stat-card__detail">Publish or hide deceased profiles, edit life dates, inscriptions, and family portraits.</span>
          </Link>
          <Link className="admin-stat-card admin-stat-card--neutral" href="/admin/photos">
            <div className="admin-stat-card__header">
              <span>Visitor Photo Moderation</span>
              <span className={`admin-section-icon admin-section-icon--${pending > 0 ? "warning" : "success"}`}><Icon name="photos" size={18} /></span>
            </div>
            <span className="admin-stat-card__detail">
              {visitorPending > 0
                ? `${visitorPending} visitor-submitted portrait or gallery photos waiting for approval.`
                : "Approve or reject visitor remembrance photos and portrait requests before publication."}
            </span>
          </Link>
          <Link className="admin-stat-card admin-stat-card--neutral" href="/admin/cemetery-map">
            <div className="admin-stat-card__header">
              <span>Interactive Phase 2 Map</span>
              <span className="admin-section-icon admin-section-icon--neutral"><Icon name="map" size={18} /></span>
            </div>
            <span className="admin-stat-card__detail">Inspect Park Map and Esri Satellite view, click any occupied lot to open its memorial record.</span>
          </Link>
          <Link className="admin-stat-card admin-stat-card--neutral" href="/admin/site-settings">
            <div className="admin-stat-card__header">
              <span>Visitor Site Settings</span>
              <span className="admin-section-icon admin-section-icon--neutral"><Icon name="settings" size={18} /></span>
            </div>
            <span className="admin-stat-card__detail">Update park hours, contact details, visitor announcement banners, and photo submission toggles live.</span>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardLoading() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard data" className="admin-dashboard-loading" role="status">
      <span className="sr-only">Loading operational data…</span>
      <div className="admin-dashboard-metrics">
        {Array.from({ length: 4 }, (_, index) => <Skeleton className="admin-dashboard-loading__metric" key={index} />)}
      </div>
      <div className="admin-dashboard-loading__insights">
        <Skeleton className="admin-dashboard-loading__section" />
        <div className="admin-dashboard-loading__rail">
          <Skeleton className="admin-dashboard-loading__occupancy" />
          <Skeleton className="admin-dashboard-loading__activity" />
        </div>
      </div>
      <Skeleton className="admin-dashboard-loading__verification" />
    </div>
  );
}

type StatCardProps = { href: string; icon: IconName; label: string; value: number; detail: string; tone?: Tone };

function AdminStatCard({ href, icon, label, value, detail, tone = "neutral" }: StatCardProps) {
  return (
    <Link className={`admin-stat-card admin-stat-card--${tone}`} href={href}>
      <div className="admin-stat-card__header">
        <span>{label}</span>
        <span className={`admin-section-icon admin-section-icon--${tone}`}><Icon name={icon} size={18} /></span>
      </div>
      <strong>{value.toLocaleString()}</strong>
      <span className="admin-stat-card__detail">{detail}</span>
    </Link>
  );
}

function BurialsBySection({ sections }: { sections: DashboardData["burialsBySection"] }) {
  const maxCount = Math.max(...sections.map((section) => section.burialCount), 0);
  return (
    <Card className="admin-dashboard-panel admin-section-chart">
      <DashboardPanelHeader description="Current burial records grouped by their plot area" icon="layers" title="Burials by Cemetery Section" />
      {sections.length ? (
        <CardContent className="admin-section-chart__content">
          <ol className="admin-section-bars">
            {sections.map((section) => {
              const percentage = maxCount ? (section.burialCount / maxCount) * 100 : 0;
              return (
                <li className="admin-section-bar" key={section.areaId}>
                  <div className="admin-section-bar__label"><span>{section.areaName}</span><strong>{section.burialCount.toLocaleString()}</strong></div>
                  <span aria-label={`${section.areaName}: ${section.burialCount.toLocaleString()} burial records`} className="admin-section-bar__track" role="img">
                    <span className="admin-section-bar__fill" style={{ width: `${percentage}%` }} />
                  </span>
                </li>
              );
            })}
          </ol>
        </CardContent>
      ) : (
        <CardContent><EmptyState description="Section totals will appear after a current burial record is assigned to a plot." icon="layers" title="No section activity yet" /></CardContent>
      )}
    </Card>
  );
}

function CemeteryOccupancy({ occupancy }: { occupancy: DashboardData["occupancy"] }) {
  const occupiedStop = occupancy.total ? (occupancy.occupied / occupancy.total) * 100 : 0;
  const availableStop = occupancy.total ? occupiedStop + (occupancy.available / occupancy.total) * 100 : occupiedStop;
  const bookedStop = occupancy.total ? availableStop + (occupancy.booked / occupancy.total) * 100 : availableStop;
  const holdStop = occupancy.total ? bookedStop + (occupancy.onHold / occupancy.total) * 100 : bookedStop;
  const donutStyle = {
    "--occupancy-occupied": `${occupiedStop}%`,
    "--occupancy-available": `${availableStop}%`,
    "--occupancy-booked": `${bookedStop}%`,
    "--occupancy-hold": `${holdStop}%`,
  } as CSSProperties;
  const chartLabel = occupancy.total
    ? `${occupancy.occupancyPercent}% occupied: ${occupancy.occupied} occupied, ${occupancy.available} available, ${occupancy.booked} booked, ${occupancy.onHold} on hold, and ${occupancy.unknown} unknown — not assessed`
    : "No current plots are available for occupancy reporting";

  return (
    <Card className="admin-dashboard-panel admin-occupancy-panel">
      <DashboardPanelHeader description="Assignment and commercial status across current plots" icon="chart" title="Cemetery Occupancy" />
      <CardContent className="admin-occupancy-content">
        <div aria-label={chartLabel} className="admin-occupancy-donut" role="img" style={donutStyle}>
          <div><strong>{occupancy.occupancyPercent}%</strong><span>Occupied</span></div>
        </div>
        <dl className="admin-occupancy-legend">
          <OccupancyLegendItem label="Occupied" tone="occupied" value={occupancy.occupied} />
          <OccupancyLegendItem label="Available" tone="available" value={occupancy.available} />
          <OccupancyLegendItem label="Booked" tone="booked" value={occupancy.booked} />
          <OccupancyLegendItem label="On hold" tone="hold" value={occupancy.onHold} />
          <OccupancyLegendItem label="Unknown — not assessed" tone="unknown" value={occupancy.unknown} />
        </dl>
      </CardContent>
    </Card>
  );
}

function OccupancyLegendItem({ label, value, tone }: { label: string; value: number; tone: "occupied" | "available" | "booked" | "hold" | "unknown" }) {
  return <div><dt><span aria-hidden="true" className={`admin-occupancy-legend__key admin-occupancy-legend__key--${tone}`} />{label}</dt><dd>{value.toLocaleString()}</dd></div>;
}

function RecentChanges({ changes }: { changes: DashboardData["recentChanges"] }) {
  return (
    <Card className="admin-dashboard-panel admin-recent-panel">
      <DashboardPanelHeader action={<Link className="text-button" href="/admin/audit-log">View Audit Log</Link>} description="Latest meaningful administrator activity" icon="audit" title="Recent Record Changes" />
      {changes.length ? (
        <ol className="admin-activity-list">{changes.map((change) => <ActivityItem change={change} key={change.auditId} />)}</ol>
      ) : (
        <CardContent><EmptyState description="Burial, plot, and photo events will appear here as staff work is recorded." icon="audit" title="No recent record changes" /></CardContent>
      )}
    </Card>
  );
}

function ActivityItem({ change }: { change: DashboardData["recentChanges"][number] }) {
  const context = [change.subject, change.plotCode].filter(Boolean).join(" · ") || "Cemetery record";
  return (
    <li className="admin-activity-item">
      <span aria-hidden="true" className="admin-activity-item__icon"><Icon name={change.label.startsWith("Coordinates") ? "verification" : "records"} size={16} /></span>
      <div><strong>{change.label}</strong><span>{context}</span></div>
      <time dateTime={change.createdAt}>{formatAuditTime(change.createdAt)}</time>
    </li>
  );
}

function DashboardPanelHeader({ title, description, icon, action, tone = "neutral" }: { title: string; description: string; icon: IconName; action?: ReactNode; tone?: Tone }) {
  return (
    <CardHeader className="admin-panel-header">
      <div className="admin-panel-heading">
        <span className={`admin-section-icon admin-section-icon--${tone}`}><Icon name={icon} size={17} /></span>
        <div><CardTitle>{title}</CardTitle><p className="admin-panel-description">{description}</p></div>
      </div>
      {action ? <div className="admin-panel-action">{action}</div> : null}
    </CardHeader>
  );
}

function formatAuditTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
