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
import { getDashboardData } from "@/lib/supabase/admin-data";
import type { DashboardData } from "@/lib/supabase/types";
import { useStaff } from "./staff-context";

type Tone = "success" | "warning" | "danger" | "neutral";

export function AdminFoundation() {
  const canAdmin = useStaff()?.role === "ADMIN";
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setDashboard(await getDashboardData());
    } catch (reason) {
      setDashboard(null);
      setError(reason instanceof Error ? reason.message : "The operational data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    getDashboardData()
      .then((data) => {
        if (active) setDashboard(data);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "The operational data could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const needsVerification = dashboard?.summary.needsVerification ?? 0;

  return (
    <div className="admin-foundation">
      <PageHeading
        actions={(
          <>
            <Link className="admin-page-action admin-page-action--primary" href="/admin/burial-records?add=1">
              <Icon name="plus" size={17} />
              <span>Add burial record</span>
            </Link>
            {canAdmin ? (
              <Link
                className={`admin-page-action ${needsVerification > 0 ? "admin-page-action--attention" : "admin-page-action--secondary"}`}
                href="/admin/coordinate-verification"
              >
                <Icon name="verification" size={16} />
                <span>Verify coordinates</span>
              </Link>
            ) : null}
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
        description="Current cemetery operations, plot occupancy, and coordinate readiness."
        title="Dashboard"
      />

      {error ? (
        <Alert icon="alert" title="Dashboard data unavailable" variant="danger">
          <span>{error}</span>
          <Button onClick={() => void loadDashboard()} variant="quiet">Try again</Button>
        </Alert>
      ) : null}

      {loading ? <DashboardLoading /> : null}
      {!loading && dashboard ? <DashboardContent canAdmin={canAdmin} data={dashboard} /> : null}
    </div>
  );
}

function DashboardContent({ canAdmin, data }: { canAdmin: boolean; data: DashboardData }) {
  const { summary } = data;
  return (
    <>
      <section aria-label="Operational summary" className="admin-dashboard-metrics">
        <AdminStatCard detail="Current records across all workflow states" href="/admin/burial-records" icon="records" label="Total burial records" value={summary.totalBurialRecords} />
        <AdminStatCard detail="Current plots with a burial assignment" href="/admin/plot-management" icon="location" label="Occupied plots" tone="success" value={summary.occupiedPlots} />
        <AdminStatCard detail="Available status with no burial assignment" href="/admin/plot-management" icon="grid" label="Available plots" value={summary.availablePlots} />
        <AdminStatCard
          detail="Missing, pending, or rejected coordinates"
          href={canAdmin ? "/admin/coordinate-verification" : "/admin/plot-management"}
          icon="verification"
          label="Needs verification"
          tone={summary.needsVerification > 0 ? "warning" : "success"}
          value={summary.needsVerification}
        />
      </section>

      <p className="input-hint">
        Synthetic project plots: {summary.syntheticPlots ?? "Count requires the staff read-model update"}.
        {summary.syntheticPlots !== undefined
          ? " Physical plot totals and coordinate reviews exclude these samples." : ""}
      </p>

      <div className="admin-dashboard-insights">
        <BurialsBySection sections={data.burialsBySection} />
        <div className="admin-dashboard-insights__rail">
          <CemeteryOccupancy occupancy={data.occupancy} />
          <RecentChanges changes={data.recentChanges} />
        </div>
      </div>

      <VerificationQueue canAdmin={canAdmin} items={data.verificationItems} total={summary.needsVerification} />
    </>
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
        <CardContent><EmptyState description="Burial, plot, and coordinate events will appear here as staff work is recorded." icon="audit" title="No recent record changes" /></CardContent>
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

function VerificationQueue({ canAdmin, items, total }: { canAdmin: boolean; items: DashboardData["verificationItems"]; total: number }) {
  return (
    <Card className="admin-dashboard-panel admin-verification-panel">
      <DashboardPanelHeader
        action={total > 0 && canAdmin ? <Badge variant="warning">{total.toLocaleString()} need attention</Badge> : undefined}
        description="Current plots with missing, pending, or rejected coordinate work"
        icon="verification"
        title="Items Needing Verification"
        tone={total > 0 ? "warning" : "success"}
      />
      {items.length ? (
        <div className="admin-verification-table-wrap">
          <table className="admin-verification-table">
            <caption className="sr-only">Plots that need coordinate verification</caption>
            <thead><tr><th scope="col">Plot</th><th scope="col">Issue</th><th scope="col">Updated</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.lotId}>
                  <td data-label="Plot"><strong>{item.plot}</strong></td>
                  <td data-label="Issue"><span>{item.issue}</span>{item.rejectionReason ? <small>{item.rejectionReason}</small> : null}</td>
                  <td data-label="Updated"><time dateTime={item.updatedAt}>{formatAuditTime(item.updatedAt)}</time></td>
                  <td data-label="Status"><VerificationBadge status={item.status} /></td>
                  <td data-label="Action">
                    {canAdmin ? (
                      <Link className="admin-row-action" href={`/admin/coordinate-verification?plot=${encodeURIComponent(item.plot)}`}>Review<span className="sr-only"> {item.plot}</span></Link>
                    ) : <span className="admin-readonly-label">Administrator review</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > items.length && canAdmin ? <div className="admin-panel-footer"><span>Showing {items.length.toLocaleString()} of {total.toLocaleString()} items</span><Link href="/admin/coordinate-verification">Open full queue</Link></div> : null}
        </div>
      ) : (
        <CardContent><EmptyState action={<Link className="text-button" href="/admin/plot-management">Review plot inventory</Link>} description="No current plots have missing, pending, or rejected coordinates." icon="check" title="Coordinate work is up to date" /></CardContent>
      )}
    </Card>
  );
}

function VerificationBadge({ status }: { status: DashboardData["verificationItems"][number]["status"] }) {
  const labels = { missing: "Missing", pending: "Pending", rejected: "Rejected" } as const;
  const variants = { missing: "danger", pending: "warning", rejected: "danger" } as const;
  return <Badge variant={variants[status]}>{labels[status]}</Badge>;
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
