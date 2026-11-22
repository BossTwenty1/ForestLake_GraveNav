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
import { readStaffReport, requireReportClient } from "@/lib/supabase/staff-reports";
import styles from "./reports.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports & Analytics | GraveNav", robots: { index: false, follow: false } };

const countFormat = new Intl.NumberFormat("en-PH");
const formatCount = (count: number) => countFormat.format(count);

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

  const { area, year, years, areaOptions, plots, plotStatuses, coordinates, activity, months, gardens } = report;
  const csvHref = (period: string) => "/admin/reports/export?" +
    new URLSearchParams({ area: area ? String(area.area_id) : "all", year: period });
  const monthMax = Math.max(1, ...months.flatMap((month) => [month.confirmed, month.pending]));
  const hasMonthlyActivity = activity.confirmed > 0 || activity.pending > 0;
  const hasDates = activity.records > 0;

  return (
    <AdminShell active="Reports">
      <div className={styles.report}>
        <AdminPageFrame
          title="Reports & Analytics"
          description="Review recorded interment activity and current cemetery inventory."
          actions={<div className={styles.controls}><ReportPrintButton /></div>}
        >
          <form action="/admin/reports" method="get" className={styles.filters}>
            <label className="input-field">
              <span className="input-label">Interment year</span>
              <select className="input-control" name="year" defaultValue={year}>
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
            <strong>{area?.area_name || "All gardens and areas"} · {year}</strong>
            {" "}· Activity uses the recorded interment date. Inventory and verification show current status.
          </p>

          <Card>
            <CardHeader><CardTitle>Cemetery summary</CardTitle></CardHeader>
            <CardContent>
              <dl className={styles.summary}>
                <Metric label="Physical lots" value={plots.physical} />
                <Metric label="Synthetic project plots" value={plots.synthetic} />
                <Metric label="Interment records in period" value={activity.records} />
                <Metric label="Confirmed physical interments" value={activity.confirmed} />
                <Metric label="Pending records in period" value={activity.pending} />
                <Metric label="Synthetic records in period" value={activity.synthetic} />
              </dl>
              <p className={styles.note}>
                Pending and synthetic records are tracked separately from confirmed physical burials.
                {activity.undated > 0 && ` Undated records in this area scope: ${formatCount(activity.undated)}.`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Monthly interment activity</CardTitle></CardHeader>
            <CardContent>
              <p className={styles.note}>
                Confirmed counts require an active record, explicit interment confirmation and a current physical lot.
                Pending counts include dated synthetic drafts.
              </p>
              {!hasMonthlyActivity ? (
                <p className={styles.empty}>
                  {hasDates
                    ? "Dated records exist, but none qualify as confirmed physical interments or pending records in this period."
                    : "No dated interment records match this period and area."}
                </p>
              ) : (
                <>
                  {activity.confirmed === 0 && (
                    <p className={styles.empty}>No explicitly confirmed physical interments in this period.</p>
                  )}
                  <Table caption={`Monthly interment activity for ${year}`} className={`${styles.table} ${styles.monthTable}`}>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell scope="col">Month</TableHeaderCell>
                        <TableHeaderCell scope="col">Confirmed physical</TableHeaderCell>
                        <TableHeaderCell scope="col">Pending records</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {months.map((month) => (
                        <TableRow key={month.label}>
                          <TableHeaderCell scope="row">{month.label}</TableHeaderCell>
                          <TableCell><Bar count={month.confirmed} max={monthMax} /></TableCell>
                          <TableCell><Bar count={month.pending} max={monthMax} pending /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>

          <div className={styles.inventory}>
            <Card>
              <CardHeader><CardTitle>Physical plot status</CardTitle></CardHeader>
              <CardContent>
                <p className={styles.note}>Stored administrative statuses. Surveyed vacancy and physical occupancy are unavailable here.</p>
                {plots.physical ? (
                  <Distribution total={plots.physical} rows={[
                    ["On hold", plotStatuses.hold], ["Booked", plotStatuses.booked],
                    ["Marked available", plotStatuses.available], ["Unknown", plotStatuses.unknown],
                    ...(plotStatuses.other ? [["Other status", plotStatuses.other] as const] : []),
                  ]} />
                ) : <p className={styles.empty}>No current physical lots in this area.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Coordinate verification</CardTitle></CardHeader>
              <CardContent>
                <p className={styles.note}>Current physical lots only. A verified coordinate represents the recorded review status.</p>
                {plots.physical ? (
                  <Distribution total={plots.physical} rows={[
                    ["Verified", coordinates.verified], ["Pending review", coordinates.pending],
                    ["Rejected", coordinates.rejected], ["Missing coordinates", coordinates.missing],
                  ]} />
                ) : <p className={styles.empty}>No physical lot coordinates to report in this area.</p>}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Gardens and areas</CardTitle></CardHeader>
            <CardContent>
              {gardens.length > 0 ? (
                <div className={styles.scroll} role="region" aria-label="Garden reports table" tabIndex={0}>
                  <Table caption="Inventory, coordinate verification and interment activity by garden or area" className={styles.table}>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell scope="col">Garden or area</TableHeaderCell>
                        <TableHeaderCell scope="col">Physical lots</TableHeaderCell>
                        <TableHeaderCell scope="col">Verified coordinates</TableHeaderCell>
                        <TableHeaderCell scope="col">Synthetic plots</TableHeaderCell>
                        <TableHeaderCell scope="col">Confirmed physical</TableHeaderCell>
                        <TableHeaderCell scope="col">Pending records</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {gardens.map((garden) => (
                        <TableRow key={garden.id ?? "unassigned"}>
                          <TableHeaderCell scope="row">{garden.label}</TableHeaderCell>
                          <TableCell>{formatCount(garden.physical)}</TableCell>
                          <TableCell>{formatCount(garden.verified)}</TableCell>
                          <TableCell>{formatCount(garden.synthetic)}</TableCell>
                          <TableCell>{formatCount(garden.confirmed)}</TableCell>
                          <TableCell>{formatCount(garden.pending)}</TableCell>
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
                Export the staff record summary for this area scope. The selected year includes dated records.
                All dates also includes undated records.
              </p>
              <div className={styles.exports}>
                <a className="button button--secondary button--md" href={csvHref(year)}>Export {year} CSV</a>
                <a className="button button--quiet button--md" href={csvHref("all")}>Export all dates CSV</a>
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
        <span className={pending ? styles.pendingBar : styles.bar} style={{ width: `${count / max * 100}%` }} />
      </span>
    </div>
  );
}
