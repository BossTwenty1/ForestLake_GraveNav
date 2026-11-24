import { buildReport } from "@/lib/admin-reports";
import { csvCell } from "@/lib/csv";
import { getAuthorizedReportClient, readStaffReport } from "@/lib/supabase/staff-reports";

const privateHeaders = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, noarchive" };

export async function GET(request: Request) {
  const auth = await getAuthorizedReportClient();
  if (!auth) {
    return new Response("Administrator sign-in is required to export reports.", {
      status: 401,
      headers: privateHeaders,
    });
  }
  const params = new URL(request.url).searchParams;
  const year = params.get("year");
  const area = params.get("area");
  try {
    const report = buildReport(await readStaffReport(auth.client), { year, area });
    if ((year && year !== "all" && year !== report.year) ||
        (area && area !== "all" && area !== String(report.area?.area_id))) {
      return new Response("The export filters are no longer valid. Return to Reports and select them again.", {
        status: 400, headers: privateHeaders,
      });
    }
    const header = "burial_id,name,plot_reference,garden,interment_date,record_status,interment_confirmed,remains_type,visitor_visibility";
    const rows = report.exportRows.map((row) => row.map(csvCell).join(","));
    const period = report.year;
    const csvBody = "\uFEFF" + [header, ...rows].join("\r\n");
    return new Response(csvBody, {
      headers: {
        ...privateHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="gravenav-record-summary-${period}.csv"`,
      },
    });
  } catch {
    return new Response("Reports could not be loaded. Return to Reports and try again.", {
      status: 503,
      headers: privateHeaders,
    });
  }
}
