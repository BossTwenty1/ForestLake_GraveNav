import Link from "next/link";
import { AdminPageFrame } from "@/components/admin/admin-page-content";
import { AdminShell } from "@/components/admin/admin-shell";
import { ReportPrintButton } from "@/components/admin/report-print-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow,
} from "@/components/ui/table";
import { buildReport } from "@/lib/admin-reports";
import { PARK_NAME } from "@/lib/park-details";
import { readStaffReport, requireReportClient } from "@/lib/supabase/staff-reports";
import styles from "./reports.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports & Analytics | GraveNav", robots: { index: false, follow: false } };

const countFormat = new Intl.NumberFormat("en-PH");
const formatCount = (count: number) => countFormat.format(count);
const generatedFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

export default async function AdminReportsRoute({ searchParams }: {
  searchParams: Promise<{ year?: string | string[]; area?: string | string[] }>;
}) {
  const client = await requireReportClient();
  const params = await searchParams;
  let report;
  try {
    report = buildReport(await readStaffReport(client), params);
  } catch {
    return (
      <AdminShell active="Reports">
        <AdminPageFrame title="Reports & Analytics">
          <Alert title="Reports are temporarily unavailable" variant="danger" icon="alert">
            A complete report could not be loaded. Reload the page to try again.
          </Alert>
        </AdminPageFrame>
      </AdminShell>
    );
  }

  const { area, year, years, areaOptions, plots, plotStatuses, activity, months, gardens } = report;
  const periodLabel = year === "all" ? "All years" : year;
  const csvHref = (period: string) => "/admin/reports/export?" +
    new URLSearchParams({ area: area ? String(area.area_id) : "all", year: period });
  const monthMax = Math.max(1, ...months.flatMap((month) => [month.active, month.pending]));
  const hasMonthlyActivity = months.some((month) => month.active > 0 || month.pending > 0);
  const generatedAt = generatedFormat.format(new Date());

  return (
    <AdminShell active="Reports">
      <div className={styles.report}>
        <div className={styles.printHeader} aria-hidden="true">
          <strong>{PARK_NAME} — Cemetery Management Report</strong>
          <span>{area?.area_name || "All gardens and areas"} · {periodLabel} · Generated {generatedAt}</span>
        </div>
        <AdminPageFrame
          title="Reports & Analytics"
          description="Reconciled interment activity, visitor visibility, and cemetery plot inventory."
          actions={<div className={styles.controls}><ReportPrintButton /></div>}
        >
          <form action="/admin/reports" method="get" className={styles.filters}>
            <label className="input-field">
              <span className="input-label">Interment year</span>
              <select className="input-control" name="year" defaultValue={year}>
                <option value="all">All years</option>
                {years.map((option) => <option value={option} key={option}>{option}</option>)}
              </select>
            </label>
            <label className="input-field">
              <span className="input-label">Garden or area</span>
              <select className="input-control" name="area" defaultValue={area?.area_id || "all"}>
                <option value="all">All gardens and areas</option>
                {areaOptions.map((option) => (
                  <option value={option.area_id} key={option.area_id}>{option.area_name}</option>
                ))}
              </select>
            </label>
            <Button type="submit">Apply filters</Button>
          </form>

          <p className={styles.scope}>
            <strong>{area?.area_name || "All gardens and areas"} · {periodLabel}</strong>
            {" "}· Activity counts reflect recorded interments in the selected period. Plot totals show current inventory.
          </p>

          <Card>
            <CardHeader><CardTitle>Cemetery summary</CardTitle></CardHeader>
            <CardContent>
              <dl className={styles.summary}>
                <Metric label="Total plots" value={plots.total} />
                <Metric label="Occupied plots" value={plots.occupied} />
                <Metric label="Shared gravesites (2+)" value={plots.shared} />
                <Metric label="Interment records" value={activity.records} />
                <Metric label="Active records" value={activity.active} />
                <Metric label="Pending records" value={activity.pending} />
                <Metric label="Published to visitors" value={activity.publicVisible} />
              </dl>
              <p className={styles.note}>
                Reconciliation: {formatCount(activity.active)} active + {formatCount(activity.pending)} pending
                {activity.archived > 0 ? ` + ${formatCount(activity.archived)} archived` : ""} = {formatCount(activity.records)} records
                {" "}({formatCount(activity.publicVisible)} public on Visitor site, {formatCount(activity.hiddenStaffOnly)} staff-only).
                {activity.undated > 0 && ` Undated records in this area scope: ${formatCount(activity.undated)}.`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Monthly interment activity</CardTitle></CardHeader>
            <CardContent>
              <p className={styles.note}>
                Dated interments grouped by calendar month ({periodLabel}). Active and pending statuses are shown separately.
              </p>
              {!hasMonthlyActivity ? (
                <p className={styles.empty}>
                  No dated active or pending interment records match this period and area.
                </p>
              ) : (
                <Table caption={`Monthly interment activity for ${periodLabel}`} className={`${styles.table} ${styles.monthTable}`}>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell scope="col">Month</TableHeaderCell>
                      <TableHeaderCell scope="col">Active records</TableHeaderCell>
                      <TableHeaderCell scope="col">Pending records</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {months.map((month) => (
                      <TableRow key={month.label}>
                        <TableHeaderCell scope="row">{month.label}</TableHeaderCell>
                        <TableCell><Bar count={month.active} max={monthMax} /></TableCell>
                        <TableCell><Bar count={month.pending} max={monthMax} pending /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className={styles.inventory}>
            <Card>
              <CardHeader><CardTitle>Plot inventory status</CardTitle></CardHeader>
              <CardContent>
                <p className={styles.note}>Occupied plots have at least one recorded interment. All statuses reconcile to total plots.</p>
                {plots.total ? (
                  <Distribution total={plots.total} rows={[
                    ["Occupied", plotStatuses.occupied],
                    ["Available", plotStatuses.available],
                    ["Booked", plotStatuses.booked],
                    ["On hold", plotStatuses.hold],
                    ["Unknown", plotStatuses.unknown],
                    ...(plotStatuses.other ? [["Other status", plotStatuses.other] as const] : []),
                  ]} />
                ) : <p className={styles.empty}>No current plots in this area.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Visitor visibility &amp; record status</CardTitle></CardHeader>
              <CardContent>
                <p className={styles.note}>Controls which records appear in public Visitor search and memorial profiles.</p>
                {activity.records ? (
                  <Distribution total={activity.records} rows={[
                    ["Published to visitors", activity.publicVisible],
                    ["Staff-only / hidden", activity.hiddenStaffOnly],
                    ["Active records", activity.active],
                    ["Pending review", activity.pending],
                    ["Archived", activity.archived],
                  ]} />
                ) : <p className={styles.empty}>No interment records in this period and area.</p>}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Gardens and areas</CardTitle></CardHeader>
            <CardContent>
              {gardens.length > 0 ? (
                <div className={styles.scroll} role="region" aria-label="Garden reports table" tabIndex={0}>
                  <Table caption="Plot inventory, interment status, and visitor visibility by garden or area" className={styles.table}>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell scope="col">Garden or area</TableHeaderCell>
                        <TableHeaderCell scope="col">Total plots</TableHeaderCell>
                        <TableHeaderCell scope="col">Occupied</TableHeaderCell>
                        <TableHeaderCell scope="col">Available</TableHeaderCell>
                        <TableHeaderCell scope="col">Active records</TableHeaderCell>
                        <TableHeaderCell scope="col">Pending records</TableHeaderCell>
                        <TableHeaderCell scope="col">Public on site</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {gardens.map((garden) => (
                        <TableRow key={garden.id ?? "unassigned"}>
                          <TableHeaderCell scope="row">{garden.label}</TableHeaderCell>
                          <TableCell>{formatCount(garden.totalPlots)}</TableCell>
                          <TableCell>{formatCount(garden.occupiedPlots)}</TableCell>
                          <TableCell>{formatCount(garden.availablePlots)}</TableCell>
                          <TableCell>{formatCount(garden.activeRecords)}</TableCell>
                          <TableCell>{formatCount(garden.pendingRecords)}</TableCell>
                          <TableCell>{formatCount(garden.publicRecords)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : <p className={styles.empty}>No garden or area records are available.</p>}
            </CardContent>
          </Card>

          <Card className={styles.controls}>
            <CardHeader><CardTitle>Record summary CSV</CardTitle></CardHeader>
            <CardContent>
              <p className={styles.note}>
                Export a UTF-8 Excel-compatible spreadsheet with friendly plot references, interment dates, statuses, and visitor visibility.
              </p>
              <div className={styles.exports}>
                {year !== "all" ? (
                  <a className="button button--secondary button--md" href={csvHref(year)}>Export {year} CSV</a>
                ) : null}
                <a className="button button--primary button--md" href={csvHref("all")}>Export all records CSV</a>
              </div>
            </CardContent>
          </Card>
          <Link href="/admin" className={`subtle-link ${styles.controls}`}>Back to dashboard</Link>
        </AdminPageFrame>
      </div>
    </AdminShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div><dt>{label}</dt><dd>{formatCount(value)}</dd></div>;
}

function Distribution({ rows, total }: { rows: ReadonlyArray<readonly [string, number]>; total: number }) {
  return (
    <dl className={styles.distribution}>
      {rows.map(([label, count]) => (
        <div key={label}><dt>{label}</dt><dd><Bar count={count} max={total} /></dd></div>
      ))}
    </dl>
  );
}

function Bar({ count, max, pending = false }: { count: number; max: number; pending?: boolean }) {
  return (
    <div className={styles.barValue}>
      <span>{formatCount(count)}</span>
      <span aria-hidden="true" className={styles.barTrack}>
        <span className={pending ? styles.pendingBar : styles.bar} style={{ width: `${Math.min(100, (count / max) * 100)}%` }} />
      </span>
    </div>
  );
}
