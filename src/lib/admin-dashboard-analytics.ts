import type { AdminPhoto, AuditLogEntry, DashboardData } from "./supabase/types";

export type DashboardPeriod =
  | "all-time"
  | "last-12-months"
  | "this-year"
  | "last-90-days"
  | "last-30-days";

export type BurialTrendMetric = "interment_date" | "created_at";
export type BurialTrendMode = "period" | "cumulative";

export type DashboardBurialAnalyticsRow = {
  burialId: number;
  lotId: number | null;
  recordStatus: "active" | "pending" | "archived";
  publicDisplay: boolean;
  intermentDate: string | null;
  createdAt: string;
  areaId: number | null;
  areaName: string | null;
};

export type DashboardPhotoAnalyticsRow = {
  photoId: number;
  approvalStatus: "pending" | "approved" | "rejected";
  publicDisplay: boolean;
  uploadedBy: string | null;
  createdAt: string;
  burialActivePublic: boolean;
};

export type PeriodDelta =
  | { kind: "percent"; percent: number; current: number; previous: number; direction: "up" | "down" | "flat"; label: string }
  | { kind: "absolute"; delta: number; current: number; previous: number; direction: "up" | "down" | "flat"; label: string }
  | { kind: "no-baseline"; current: number; previous: number; direction: "flat"; label: string };

export type TrendPoint = {
  key: string;
  label: string;
  fullLabel: string;
  count: number;
  cumulative: number;
  previousBucketCount: number | null;
};

export type BurialTrendSeries = {
  period: DashboardPeriod;
  metric: BurialTrendMetric;
  interval: "year" | "month" | "week" | "day";
  rangeLabel: string;
  timezone: "Asia/Manila";
  points: TrendPoint[];
  totalInPeriod: number;
  excludedUndatedCount: number;
  peakPoint: TrendPoint | null;
  comparison: PeriodDelta | null;
};

export type SectionBurialBar = {
  areaId: number | null;
  areaName: string;
  burialCount: number;
  isUnassigned: boolean;
};

export type OccupancyMetrics = {
  occupied: number;
  available: number;
  booked: number;
  onHold: number;
  unknown: number;
  total: number;
  occupancyRate: number | null;
  rateDisplay: string;
  rateSubtext: string;
  availabilitySubtext: string;
  classificationIncomplete: boolean;
};

export type DashboardTaskType = "photo_review" | "record_review" | "account_approval" | "coordinate_review";

export type DashboardTaskItem = {
  id: string;
  type: DashboardTaskType;
  badgeLabel: string;
  tone: "warning" | "success" | "info" | "neutral";
  title: string;
  subtitle: string;
  href: string;
  createdAt: string | null;
  thumbnailUrl?: string | null;
};

export type DashboardActivityItem = {
  id: string;
  label: string;
  detail: string;
  createdAt: string;
  href: string | null;
  icon: "photos" | "records" | "grid" | "settings" | "users" | "verification";
};

export const DASHBOARD_TIMEZONE = "Asia/Manila" as const;

export const DASHBOARD_PERIOD_OPTIONS: { value: DashboardPeriod; label: string }[] = [
  { value: "all-time", label: "All Time" },
  { value: "last-12-months", label: "Last 12 Months" },
  { value: "this-year", label: "This Year" },
  { value: "last-90-days", label: "Last 90 Days" },
  { value: "last-30-days", label: "Last 30 Days" },
];

const PHASE2_HASH_RE = /^P2S-[0-9a-f]{64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseManilaDateParts(value: string | Date): { year: number; month: number; day: number } | null {
  if (typeof value === "string") {
    const dateOnly = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
      return {
        year: Number(dateOnly[1]),
        month: Number(dateOnly[2]),
        day: Number(dateOnly[3]),
      };
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DASHBOARD_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month, day };
}

function toUtcDayMs(parts: { year: number; month: number; day: number }) {
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function fromUtcDayMs(ms: number) {
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function monthShortName(month: number) {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1] || "";
}

function formatDayLabel(parts: { year: number; month: number; day: number }) {
  return `${monthShortName(parts.month)} ${parts.day}`;
}

function formatMonthYearLabel(parts: { year: number; month: number }) {
  return `${monthShortName(parts.month)} ${parts.year}`;
}

/**
 * Strict Section 4.2 change indicator formula:
 * ((current - previous) / previous) * 100 ONLY when previous > 0.
 * Never fabricates a percentage when previous is 0.
 */
export function computePeriodDelta(current: number, previous: number): PeriodDelta {
  if (previous > 0) {
    const raw = ((current - previous) / previous) * 100;
    const rounded = Number(raw.toFixed(1));
    const direction = rounded > 0 ? "up" : rounded < 0 ? "down" : "flat";
    const prefix = rounded > 0 ? "+" : "";
    return {
      kind: "percent",
      percent: rounded,
      current,
      previous,
      direction,
      label: `${prefix}${rounded}% vs. prior period`,
    };
  }
  if (current > 0) {
    return {
      kind: "absolute",
      delta: current,
      current,
      previous: 0,
      direction: "up",
      label: `+${current.toLocaleString()} vs. 0 prior`,
    };
  }
  return {
    kind: "no-baseline",
    current: 0,
    previous: 0,
    direction: "flat",
    label: "No comparable prior baseline",
  };
}

export function chooseDefaultDashboardPeriod(
  rows: DashboardBurialAnalyticsRow[],
  now: Date = new Date(),
): DashboardPeriod {
  const recent = buildBurialTrendSeries(rows, "last-12-months", "interment_date", now);
  if (recent.totalInPeriod > 0) return "last-12-months";
  const allTime = buildBurialTrendSeries(rows, "all-time", "interment_date", now);
  if (allTime.totalInPeriod > 0) return "all-time";
  return "last-12-months";
}

export function buildBurialTrendSeries(
  rows: DashboardBurialAnalyticsRow[],
  period: DashboardPeriod,
  metric: BurialTrendMetric,
  now: Date = new Date(),
): BurialTrendSeries {
  const today = parseManilaDateParts(now) ?? { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() };
  const todayMs = toUtcDayMs(today);

  const parsedEvents: { parts: { year: number; month: number; day: number }; ms: number }[] = [];
  let excludedUndatedCount = 0;

  for (const row of rows) {
    const rawDate = metric === "interment_date" ? row.intermentDate : row.createdAt;
    if (!rawDate) {
      excludedUndatedCount += 1;
      continue;
    }
    const parts = parseManilaDateParts(rawDate);
    if (!parts) {
      excludedUndatedCount += 1;
      continue;
    }
    parsedEvents.push({ parts, ms: toUtcDayMs(parts) });
  }

  let interval: BurialTrendSeries["interval"] = "month";
  let rangeLabel = "";
  const buckets: { key: string; label: string; fullLabel: string; startMs: number; endMs: number }[] = [];
  let prevWindowStartMs: number | null = null;
  let prevWindowEndMs: number | null = null;

  if (period === "last-12-months") {
    interval = "month";
    for (let offset = 11; offset >= 0; offset -= 1) {
      const target = new Date(Date.UTC(today.year, today.month - 1 - offset, 1));
      const y = target.getUTCFullYear();
      const m = target.getUTCMonth() + 1;
      const startMs = Date.UTC(y, m - 1, 1);
      const endMs = Date.UTC(y, m, 0);
      buckets.push({
        key: `${y}-${String(m).padStart(2, "0")}`,
        label: monthShortName(m),
        fullLabel: formatMonthYearLabel({ year: y, month: m }),
        startMs,
        endMs,
      });
    }
    const first = buckets[0];
    const last = buckets[buckets.length - 1];
    rangeLabel = `${first.fullLabel} – ${last.fullLabel}`;
    const prevStart = new Date(Date.UTC(today.year, today.month - 1 - 23, 1));
    prevWindowStartMs = prevStart.getTime();
    prevWindowEndMs = first.startMs - 86_400_000;
  } else if (period === "this-year") {
    interval = "month";
    for (let m = 1; m <= today.month; m += 1) {
      buckets.push({
        key: `${today.year}-${String(m).padStart(2, "0")}`,
        label: monthShortName(m),
        fullLabel: formatMonthYearLabel({ year: today.year, month: m }),
        startMs: Date.UTC(today.year, m - 1, 1),
        endMs: Date.UTC(today.year, m, 0),
      });
    }
    rangeLabel = `Jan ${today.year} – ${formatMonthYearLabel(today)}`;
    prevWindowStartMs = Date.UTC(today.year - 1, 0, 1);
    prevWindowEndMs = Date.UTC(today.year - 1, today.month, 0);
  } else if (period === "last-90-days") {
    interval = "week";
    const startMs = todayMs - 89 * 86_400_000;
    const weekSpan = 7 * 86_400_000;
    for (let cursor = startMs; cursor <= todayMs; cursor += weekSpan) {
      const endMs = Math.min(cursor + 6 * 86_400_000, todayMs);
      const s = fromUtcDayMs(cursor);
      const e = fromUtcDayMs(endMs);
      buckets.push({
        key: `${s.year}-${String(s.month).padStart(2, "0")}-${String(s.day).padStart(2, "0")}`,
        label: formatDayLabel(s),
        fullLabel: `${formatDayLabel(s)} – ${formatDayLabel(e)}, ${e.year}`,
        startMs: cursor,
        endMs,
      });
    }
    const s0 = fromUtcDayMs(startMs);
    rangeLabel = `${formatDayLabel(s0)}, ${s0.year} – ${formatDayLabel(today)}, ${today.year}`;
    prevWindowStartMs = startMs - 90 * 86_400_000;
    prevWindowEndMs = startMs - 86_400_000;
  } else if (period === "last-30-days") {
    interval = "day";
    const startMs = todayMs - 29 * 86_400_000;
    for (let cursor = startMs; cursor <= todayMs; cursor += 86_400_000) {
      const d = fromUtcDayMs(cursor);
      buckets.push({
        key: `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`,
        label: formatDayLabel(d),
        fullLabel: `${formatDayLabel(d)}, ${d.year}`,
        startMs: cursor,
        endMs: cursor,
      });
    }
    const s0 = fromUtcDayMs(startMs);
    rangeLabel = `${formatDayLabel(s0)}, ${s0.year} – ${formatDayLabel(today)}, ${today.year}`;
    prevWindowStartMs = startMs - 30 * 86_400_000;
    prevWindowEndMs = startMs - 86_400_000;
  } else {
    // All Time: group by year if spanning > 1 year, or by month if single year
    if (parsedEvents.length === 0) {
      interval = "year";
      rangeLabel = "All recorded dates";
    } else {
      const years = parsedEvents.map((e) => e.parts.year);
      const minYear = Math.min(...years);
      const maxYear = Math.max(...years);
      if (maxYear - minYear >= 1) {
        interval = "year";
        for (let y = minYear; y <= maxYear; y += 1) {
          buckets.push({
            key: String(y),
            label: String(y),
            fullLabel: `Year ${y}`,
            startMs: Date.UTC(y, 0, 1),
            endMs: Date.UTC(y, 11, 31),
          });
        }
        rangeLabel = `${minYear} – ${maxYear}`;
      } else {
        interval = "month";
        for (let m = 1; m <= 12; m += 1) {
          buckets.push({
            key: `${minYear}-${String(m).padStart(2, "0")}`,
            label: monthShortName(m),
            fullLabel: formatMonthYearLabel({ year: minYear, month: m }),
            startMs: Date.UTC(minYear, m - 1, 1),
            endMs: Date.UTC(minYear, m, 0),
          });
        }
        rangeLabel = `Jan – Dec ${minYear}`;
      }
    }
  }

  let cumulative = 0;
  let totalInPeriod = 0;
  const points: TrendPoint[] = buckets.map((bucket, index) => {
    const count = parsedEvents.filter((event) => event.ms >= bucket.startMs && event.ms <= bucket.endMs).length;
    cumulative += count;
    totalInPeriod += count;
    return {
      key: bucket.key,
      label: bucket.label,
      fullLabel: bucket.fullLabel,
      count,
      cumulative,
      previousBucketCount: index > 0 ? 0 : null,
    };
  });

  for (let i = 1; i < points.length; i += 1) {
    points[i].previousBucketCount = points[i - 1].count;
  }

  let peakPoint: TrendPoint | null = null;
  for (const point of points) {
    if (point.count > 0 && (!peakPoint || point.count > peakPoint.count)) {
      peakPoint = point;
    }
  }

  let comparison: PeriodDelta | null = null;
  if (prevWindowStartMs !== null && prevWindowEndMs !== null) {
    const prevCount = parsedEvents.filter(
      (event) => event.ms >= prevWindowStartMs && event.ms <= prevWindowEndMs,
    ).length;
    comparison = computePeriodDelta(totalInPeriod, prevCount);
  }

  return {
    period,
    metric,
    interval,
    rangeLabel,
    timezone: DASHBOARD_TIMEZONE,
    points,
    totalInPeriod,
    excludedUndatedCount,
    peakPoint,
    comparison,
  };
}

export function buildSectionBurialBars(
  rows: DashboardBurialAnalyticsRow[],
  fallbackSections: DashboardData["burialsBySection"] = [],
): SectionBurialBar[] {
  if (rows.length === 0) {
    return fallbackSections.map((section) => ({
      areaId: section.areaId,
      areaName: section.areaName,
      burialCount: section.burialCount,
      isUnassigned: false,
    }));
  }

  const byArea = new Map<string, SectionBurialBar>();
  for (const row of rows) {
    const hasArea = typeof row.areaId === "number" && Boolean(row.areaName?.trim());
    const key = hasArea ? `area:${row.areaId}` : "unassigned";
    const existing = byArea.get(key);
    if (existing) {
      existing.burialCount += 1;
    } else {
      byArea.set(key, {
        areaId: hasArea ? row.areaId : null,
        areaName: hasArea ? row.areaName!.trim() : "Unassigned / unknown section",
        burialCount: 1,
        isUnassigned: !hasArea,
      });
    }
  }

  return Array.from(byArea.values()).sort((a, b) => {
    if (a.isUnassigned !== b.isUnassigned) return a.isUnassigned ? 1 : -1;
    return b.burialCount - a.burialCount || a.areaName.localeCompare(b.areaName);
  });
}

export function computeOccupancyMetrics(occupancy: DashboardData["occupancy"]): OccupancyMetrics {
  const occupied = Math.max(0, occupancy.occupied);
  const available = Math.max(0, occupancy.available);
  const booked = Math.max(0, occupancy.booked);
  const onHold = Math.max(0, occupancy.onHold);
  const unknown = Math.max(0, occupancy.unknown);
  const total = occupied + available + booked + onHold + unknown;

  const classificationIncomplete = total === 0 || (occupied === 0 && available === 0 && booked === 0 && (onHold + unknown) === total);

  let occupancyRate: number | null = null;
  let rateDisplay = "N/A";
  let rateSubtext = "Classification incomplete";

  if (total === 0) {
    rateSubtext = "No registered plots";
  } else if (classificationIncomplete) {
    rateSubtext = `${(onHold + unknown).toLocaleString()} unclassified / on hold`;
  } else {
    const raw = (occupied / total) * 100;
    occupancyRate = raw > 0 && raw < 100 ? Number(raw.toFixed(1)) : Math.round(raw);
    rateDisplay = `${occupancyRate}%`;
    rateSubtext = onHold > 0
      ? `${occupied.toLocaleString()} of ${total.toLocaleString()} (${onHold.toLocaleString()} on hold)`
      : `${occupied.toLocaleString()} of ${total.toLocaleString()} plots`;
  }

  let availabilitySubtext = "Explicitly classified available";
  if (total === 0) {
    availabilitySubtext = "No registered plots";
  } else if (available === 0 && onHold > 0) {
    availabilitySubtext = `0 classified · ${onHold.toLocaleString()} on hold`;
  } else if (available === 0) {
    availabilitySubtext = "None currently classified available";
  }

  return {
    occupied,
    available,
    booked,
    onHold,
    unknown,
    total,
    occupancyRate,
    rateDisplay,
    rateSubtext,
    availabilitySubtext,
    classificationIncomplete,
  };
}

export function summarizePublishedPhotos(rows: DashboardPhotoAnalyticsRow[]) {
  let pending = 0;
  let visitorPending = 0;
  let approvedTotal = 0;
  let publishedEligible = 0;
  let visitorTotal = 0;

  for (const row of rows) {
    if (row.uploadedBy === null) visitorTotal += 1;
    if (row.approvalStatus === "pending") {
      pending += 1;
      if (row.uploadedBy === null) visitorPending += 1;
    } else if (row.approvalStatus === "approved") {
      approvedTotal += 1;
      if (row.publicDisplay && row.burialActivePublic) {
        publishedEligible += 1;
      }
    }
  }

  return {
    pending,
    visitorPending,
    approvedTotal,
    publishedEligible,
    visitorTotal,
    usesApprovedLabel: approvedTotal > 0 && publishedEligible !== approvedTotal && publishedEligible === 0,
  };
}

export function sanitizeAuditEntityText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (PHASE2_HASH_RE.test(trimmed)) return "Phase 2 plot";
  if (UUID_RE.test(trimmed)) return "Protected record";
  return trimmed;
}

export function buildRecentActivityItems(
  dashboardChanges: DashboardData["recentChanges"],
  auditEntries: AuditLogEntry[],
  canAdmin: boolean,
  limit = 6,
): DashboardActivityItem[] {
  const seen = new Set<string>();
  const merged: DashboardActivityItem[] = [];

  for (const entry of auditEntries) {
    if (!canAdmin && entry.table_name === "account") continue;
    const mapped = mapAuditEntryToActivity(entry, dashboardChanges);
    if (!mapped) continue;
    if (seen.has(mapped.id)) continue;
    seen.add(mapped.id);
    merged.push(mapped);
  }

  for (const change of dashboardChanges) {
    const id = `audit-${change.auditId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const subject = sanitizeAuditEntityText(change.subject);
    const plot = sanitizeAuditEntityText(change.plotCode);
    merged.push({
      id,
      label: change.label,
      detail: [subject, plot].filter(Boolean).join(" · ") || "Cemetery record",
      createdAt: change.createdAt,
      href: "/admin/audit-log",
      icon: change.label.toLowerCase().includes("coordinate") ? "verification" : change.label.toLowerCase().includes("plot") ? "grid" : "records",
    });
  }

  merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return merged.slice(0, limit);
}

function mapAuditEntryToActivity(
  entry: AuditLogEntry,
  dashboardChanges: DashboardData["recentChanges"],
): DashboardActivityItem | null {
  const fromRpc = dashboardChanges.find((item) => item.auditId === entry.audit_id);
  if (fromRpc) {
    const subject = sanitizeAuditEntityText(fromRpc.subject);
    const plot = sanitizeAuditEntityText(fromRpc.plotCode);
    return {
      id: `audit-${entry.audit_id}`,
      label: fromRpc.label,
      detail: [subject, plot].filter(Boolean).join(" · ") || "Cemetery record",
      createdAt: entry.created_at,
      href: entry.table_name === "burial_record" && /^\d+$/.test(entry.record_id)
        ? `/admin/burial-records/${entry.record_id}`
        : "/admin/audit-log",
      icon: fromRpc.label.toLowerCase().includes("coordinate") ? "verification" : fromRpc.label.toLowerCase().includes("plot") ? "grid" : "records",
    };
  }

  const action = entry.action.toLowerCase();
  const table = entry.table_name.toLowerCase();
  const newVals = entry.new_values && typeof entry.new_values === "object" ? entry.new_values : null;

  if (table === "photo") {
    const status = typeof newVals?.approval_status === "string" ? newVals.approval_status : null;
    const label = action === "insert"
      ? "Photo uploaded"
      : status === "approved"
        ? "Photo approved for site"
        : status === "rejected"
          ? "Photo rejected"
          : "Photo moderated";
    const fileName = typeof newVals?.file_name === "string" ? newVals.file_name : null;
    return {
      id: `audit-${entry.audit_id}`,
      label,
      detail: sanitizeAuditEntityText(fileName) || "Memorial photo record",
      createdAt: entry.created_at,
      href: "/admin/photos",
      icon: "photos",
    };
  }

  if (table === "site_settings") {
    return {
      id: `audit-${entry.audit_id}`,
      label: "Visitor site settings updated",
      detail: "Park info, announcements, or contribution controls",
      createdAt: entry.created_at,
      href: "/admin/site-settings",
      icon: "settings",
    };
  }

  if (table === "account") {
    const username = typeof newVals?.username === "string" ? newVals.username : null;
    return {
      id: `audit-${entry.audit_id}`,
      label: action === "insert" ? "Staff account created" : "Staff account updated",
      detail: sanitizeAuditEntityText(username) || "Account permissions & status",
      createdAt: entry.created_at,
      href: "/admin/accounts",
      icon: "users",
    };
  }

  if (table === "burial_record") {
    const label = action === "insert" ? "Burial record added" : action === "status_change" ? "Burial status changed" : "Burial record updated";
    return {
      id: `audit-${entry.audit_id}`,
      label,
      detail: /^\d+$/.test(entry.record_id) ? `Burial record #${entry.record_id}` : "Interment record",
      createdAt: entry.created_at,
      href: /^\d+$/.test(entry.record_id) ? `/admin/burial-records/${entry.record_id}` : "/admin/burial-records",
      icon: "records",
    };
  }

  if (table === "lot") {
    const lotCode = typeof newVals?.lot_code === "string" ? sanitizeAuditEntityText(newVals.lot_code) : null;
    return {
      id: `audit-${entry.audit_id}`,
      label: action === "insert" ? "Plot registered" : action === "status_change" ? "Plot status changed" : "Plot updated",
      detail: lotCode || (/^\d+$/.test(entry.record_id) ? `Plot #${entry.record_id}` : "Cemetery plot"),
      createdAt: entry.created_at,
      href: "/admin/plot-management",
      icon: "grid",
    };
  }

  return null;
}

export function buildPendingTasksQueue(input: {
  pendingPhotos: AdminPhoto[];
  photoThumbnails: Record<number, string>;
  pendingPhotoTotal: number;
  pendingBurialsCount: number;
  pendingAccountsCount: number;
  canAdmin: boolean;
}): { total: number; items: DashboardTaskItem[] } {
  const items: DashboardTaskItem[] = [];

  for (const photo of input.pendingPhotos.slice(0, 3)) {
    const kindLabel = photo.photoKind === "tribute" ? "Gallery tribute" : "Memorial portrait";
    const subject = photo.deceasedName || `Burial #${photo.burialId}`;
    const plotRef = sanitizeAuditEntityText(photo.lotCode);
    items.push({
      id: `photo-${photo.photoId}`,
      type: "photo_review",
      badgeLabel: "Photo Review",
      tone: "warning",
      title: `Photo review: ${subject}`,
      subtitle: [kindLabel, plotRef].filter(Boolean).join(" · "),
      href: "/admin/photos",
      createdAt: photo.createdAt,
      thumbnailUrl: input.photoThumbnails[photo.photoId] ?? null,
    });
  }

  if (input.pendingBurialsCount > 0) {
    items.push({
      id: "pending-burials",
      type: "record_review",
      badgeLabel: "Record Review",
      tone: "success",
      title: `${input.pendingBurialsCount.toLocaleString()} pending burial ${input.pendingBurialsCount === 1 ? "record" : "records"}`,
      subtitle: "Review record details and confirm readiness before activation",
      href: "/admin/burial-records?status=pending",
      createdAt: null,
    });
  }

  if (input.canAdmin && input.pendingAccountsCount > 0) {
    items.push({
      id: "pending-accounts",
      type: "account_approval",
      badgeLabel: "Account",
      tone: "info",
      title: `${input.pendingAccountsCount.toLocaleString()} staff ${input.pendingAccountsCount === 1 ? "account" : "accounts"} awaiting approval`,
      subtitle: "Approve or review pending staff access requests",
      href: "/admin/accounts",
      createdAt: null,
    });
  }

  const total =
    input.pendingPhotoTotal +
    input.pendingBurialsCount +
    (input.canAdmin ? input.pendingAccountsCount : 0);

  return { total, items };
}
