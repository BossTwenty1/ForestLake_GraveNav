import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { localSupabaseConfig } from "@/lib/supabase/config";
import { getStaffGisReadiness } from "@/lib/supabase/gis-data";
import { getStaffVisitorPreview } from "@/lib/supabase/staff-visitor-preview";
import {
  assertLocalRequest, verifyPugi, assertClearance, executeBoundedBatch,
  HOSTED_WRITES_ENABLED, ImportBlocked,
} from "@/lib/phase2-import";
import {
  loadFixedPlan, loadJournal, loadClearance, persistJournal,
  persistVerification, withJournalLock,
} from "@/lib/phase2-import-storage";

export const runtime = "nodejs";
const responseHeaders = {
  "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex, nofollow",
};

export async function POST(request: Request) {
  try {
    assertLocalRequest(request);
    const raw = await request.text();
    if (raw.length > 64) throw new ImportBlocked("Only the fixed readiness/continue action is accepted.", 400);
    let body;
    try { body = JSON.parse(raw); }
    catch { throw new ImportBlocked("A fixed JSON action is required.", 400); }
    if (!body || Object.keys(body).length !== 1 || !["readiness", "continue"].includes(body.action)) {
      throw new ImportBlocked("No dataset, identity, credentials or save payload may be supplied.", 400);
    }
    const client = await getServerSupabase();
    if (!client) throw new ImportBlocked("Supabase Auth is not configured.", 503);
    const identity = await verifyPugi(client, localSupabaseConfig.url);
    // The original server guard and all subsequent RPCs use this exact cookie-bound client.
    await requireStaff("ADMIN", client);
    if (body.action === "continue") {
      if (!HOSTED_WRITES_ENABLED) throw new ImportBlocked(
        "Hosted writes are hard-disabled. Separate SQL and full-import execution approval is required.");
      const plan = await loadFixedPlan();
      const clearance = await loadClearance();
      assertClearance(clearance);
      const progress = await withJournalLock(async () => executeBoundedBatch(
        client, plan, await loadJournal(plan), persistJournal, clearance, request.signal,
      ));
      return NextResponse.json({ identity, progress, writesEnabled: HOSTED_WRITES_ENABLED,
        executionStatus: progress.completed === 235 ? "COMPLETE" : "READY", holds: [],
      }, { headers: responseHeaders });
    }
    const verification = { ...identity, accountStatus: "ACTIVE",
      requestBound: true, authChecks: ["auth.getUser", "get_my_account", "requireStaff"],
      writesEnabled: HOSTED_WRITES_ENABLED, origin: request.headers.get("origin") };
    await persistVerification(verification);
    const plan = await loadFixedPlan();
    const journal = await loadJournal(plan);
    const { data, error } = await client.rpc("staff_dashboard_data");
    const dashboard = data as {
      summary?: { syntheticPlots?: unknown }; occupancy?: unknown;
    } | null;
    const inventoryReady = !error && typeof dashboard?.summary?.syntheticPlots === "number";
    if (inventoryReady) {
      const [counts, plots, coordinates, gis] = await Promise.all([
        client.rpc("staff_dashboard_counts"),
        client.rpc("staff_plot_management", { p_page_size: 10 }),
        client.rpc("staff_coordinate_verification", { p_state: "all", p_page_size: 10 }),
        Promise.all(["5", "6"].map((areaId) => getStaffGisReadiness(client, {
          siteId: "1", areaId, pageSize: 1,
        }))),
      ]);
      if (counts.error || plots.error || coordinates.error) {
        throw new ImportBlocked("Read-only staff reader verification failed; no import was attempted.");
      }
      const pageSummary = (value: unknown) => {
        const page = value as { total?: unknown; totalAll?: unknown; summary?: unknown } | null;
        return { total: page?.total, totalAll: page?.totalAll, summary: page?.summary };
      };
      let postImportChecks;
      if (journal.completed.length === 235 && !journal.pending) {
        const [owners, records, recordsNext, samplePlots, samplePlotsNext] = await Promise.all([
          client.from("lot_owner").select("lot_owner_id", { count: "exact" }),
          client.rpc("staff_burial_records", { p_page_size: 50 }),
          client.rpc("staff_burial_records", { p_page_size: 50, p_page: 2 }),
          client.rpc("staff_plot_management", { p_query: "P2S-", p_page_size: 50 }),
          client.rpc("staff_plot_management", { p_query: "P2S-", p_page_size: 50, p_page: 2 }),
        ]);
        if (owners.error || records.error || recordsNext.error || samplePlots.error || samplePlotsNext.error) {
          throw new ImportBlocked("Post-import staff directory checks failed; writes remain disabled.");
        }
        const directory = records.data as { total: number; items: unknown[] };
        const directoryNext = recordsNext.data as { total: number; items: unknown[] };
        const first = samplePlots.data as { total: number; items: unknown[] };
        const second = samplePlotsNext.data as { total: number; items: unknown[] };
        const examples = [
          plan.assignments.find((group) => group.owner && group.interments.length === 1),
          plan.assignments.find((group) => !group.owner),
          plan.assignments.find((group) => group.interments.length === 2),
        ];
        const previews = await Promise.all(examples.map(async (group) => {
          const entry = group?.interments[0];
          const saved = journal.completed.find((item) => item.requestId === entry?.request_id);
          const preview = saved ? await getStaffVisitorPreview(saved.receipt.id) : null;
          if (!preview || preview.visible || preview.record.name !== entry?.values.display_name ||
            preview.record.locationVerified || preview.record.location) {
            throw new ImportBlocked("A staff visitor preview failed its privacy or location check.");
          }
          return { id: saved!.receipt.id, retrieved: true, visible: false, verifiedLocation: false };
        }));
        if (owners.count !== 45 || directory.total !== 100 || directoryNext.total !== 100 ||
          directory.items.length + directoryNext.items.length !== 100 ||
          first.total !== 90 || second.total !== 90 || first.items.length + second.items.length !== 90) {
          throw new ImportBlocked("Post-import directory totals differ from the approved dataset.");
        }
        postImportChecks = { owners: owners.count, records: directory.total,
          syntheticPlots: first.total, previews, checkedAt: new Date().toISOString() };
      }
      await persistVerification({ ...verification, postImportChecks, readerChecks: {
        checkedAt: new Date().toISOString(),
        staff_dashboard_data: { summary: dashboard?.summary, occupancy: dashboard?.occupancy },
        staff_dashboard_counts: counts.data,
        staff_plot_management: pageSummary(plots.data),
        staff_coordinate_verification: pageSummary(coordinates.data),
        staff_gis_readiness: gis.map(({ areaId, total, counts, releaseId }) => ({
          areaId, total, counts, releaseId,
        })),
      } });
    }
    const holds: string[] = [];
    if (!HOSTED_WRITES_ENABLED) holds.push(
      "Hosted writes are hard-disabled pending separate final execution approval.");
    if (!inventoryReady) holds.push("The reviewed synthetic inventory SQL is not yet confirmed applied.");
    const readinessClearance = await loadClearance();
    try { assertClearance(readinessClearance); }
    catch (reason) { holds.push(reason instanceof ImportBlocked ? reason.message : "Execution clearance is unavailable."); }
    return NextResponse.json({ identity, executionStatus: holds.length ? "BLOCKED" : "READY", holds,
      approvedStartAt: readinessClearance?.resumeFrom ?? 0,
      fixedDataset: { owners: 45, plots: 90, deceasedIntermentPairs: 100, protectedRequests: 235,
        intentionallyUnowned: 45, sharedGroups: 10, pendingHiddenUnconfirmed: 100 },
      progress: { completed: journal.completed.length, total: 235, pending: Boolean(journal.pending) },
      inventoryReady, writesEnabled: HOSTED_WRITES_ENABLED,
    }, { headers: responseHeaders });
  } catch (reason) {
    const blocked = reason instanceof ImportBlocked;
    return NextResponse.json({ identity: { status: "BLOCKED" },
      reason: blocked ? reason.message : "The local request stopped. No replacement request IDs were allocated.",
      writesEnabled: false,
    }, { status: blocked ? reason.status : 503, headers: responseHeaders });
  }
}
