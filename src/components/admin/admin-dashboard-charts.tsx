"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/icons";
import {
  computePeriodDelta,
  type BurialTrendMetric,
  type BurialTrendMode,
  type BurialTrendSeries,
  type OccupancyMetrics,
  type SectionBurialBar,
} from "@/lib/admin-dashboard-analytics";
import styles from "./admin-dashboard.module.css";

const SECTION_BAR_COLORS = [
  "var(--dash-green)",
  "var(--dash-green-mid)",
  "var(--dash-green-light)",
  "var(--dash-green-pale)",
  "var(--dash-green-faint)",
];

function buildSmoothPath(coords: { x: number; y: number }[], minY: number, maxY: number) {
  if (coords.length === 0) return "";
  if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;
  const clampY = (val: number) => Math.max(minY, Math.min(maxY, val));
  let path = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const p0 = coords[Math.max(0, i - 1)];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[Math.min(coords.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = clampY(p1.y + (p2.y - p0.y) / 6);
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = clampY(p2.y - (p3.y - p1.y) / 6);
    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return path;
}

export function BurialRecordsOverTimeCard({
  series,
  metric,
  mode,
  onMetricChange,
  onModeChange,
  onSwitchToAllTime,
  error,
}: {
  series: BurialTrendSeries;
  metric: BurialTrendMetric;
  mode: BurialTrendMode;
  onMetricChange: (metric: BurialTrendMetric) => void;
  onModeChange: (mode: BurialTrendMode) => void;
  onSwitchToAllTime: () => void;
  error?: string;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const values = useMemo(
    () => series.points.map((point) => (mode === "cumulative" ? point.cumulative : point.count)),
    [series.points, mode],
  );

  const maxValue = Math.max(...values, 0);
  const yMax = maxValue <= 5 ? Math.max(maxValue, 5) : Math.ceil(maxValue / 5) * 5;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(yMax * ratio));

  const chartWidth = 600;
  const chartHeight = 204;
  const padLeft = 34;
  const padRight = 18;
  const padTop = 28;
  const padBottom = 26;
  const plotW = chartWidth - padLeft - padRight;
  const plotH = chartHeight - padTop - padBottom;

  const coords = useMemo(() => {
    const count = series.points.length;
    if (count === 0) return [];
    return series.points.map((point, index) => {
      const val = mode === "cumulative" ? point.cumulative : point.count;
      const x = count === 1 ? padLeft + plotW / 2 : padLeft + (index / (count - 1)) * plotW;
      const y = padTop + plotH - (yMax > 0 ? (val / yMax) * plotH : 0);
      return { x, y, val, point };
    });
  }, [series.points, mode, plotW, plotH, yMax]);

  const activePointIndex = useMemo(() => {
    if (coords.length === 0) return -1;
    if (selectedKey) {
      const idx = coords.findIndex((c) => c.point.key === selectedKey);
      if (idx >= 0) return idx;
    }
    if (series.peakPoint) {
      const peakIdx = coords.findIndex((c) => c.point.key === series.peakPoint?.key);
      if (peakIdx >= 0) return peakIdx;
    }
    return coords.length - 1;
  }, [coords, selectedKey, series.peakPoint]);

  const activeEntry = activePointIndex >= 0 ? coords[activePointIndex] : null;
  const activeDelta = useMemo(() => {
    if (!activeEntry || mode === "cumulative") return null;
    if (activeEntry.point.previousBucketCount === null) return null;
    return computePeriodDelta(activeEntry.point.count, activeEntry.point.previousBucketCount);
  }, [activeEntry, mode]);

  const linePath = buildSmoothPath(coords, padTop, padTop + plotH);
  const areaPath = coords.length > 1
    ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`
    : "";

  const xLabelStep = series.points.length > 14 ? Math.ceil(series.points.length / 8) : 1;
  const metricSubtitle = metric === "interment_date"
    ? "Interments grouped by recorded interment date"
    : "Burial records grouped by system creation date";

  return (
    <section aria-labelledby="dash-trend-title" className={`${styles.panel} ${styles.trendPanel}`}>
      <header className={styles.panelHeader}>
        <div className={styles.panelTitleWrap}>
          <span className={styles.panelIcon}>
            <Icon name="memorial" size={16} />
          </span>
          <div>
            <h2 className={styles.panelTitle} id="dash-trend-title">Burial Records Over Time</h2>
            <p className={styles.panelSubtitle}>{metricSubtitle}</p>
          </div>
        </div>
        <div aria-label="Series display mode" className={styles.segmentedGroup} role="group">
          <button
            aria-pressed={mode === "period"}
            className={`${styles.segmentedBtn} ${mode === "period" ? styles.segmentedBtnActive : ""}`}
            onClick={() => onModeChange("period")}
            type="button"
          >
            Burials
          </button>
          <button
            aria-pressed={mode === "cumulative"}
            className={`${styles.segmentedBtn} ${mode === "cumulative" ? styles.segmentedBtnActive : ""}`}
            onClick={() => onModeChange("cumulative")}
            type="button"
          >
            Cumulative
          </button>
        </div>
      </header>

      <div className={styles.panelBody}>
        <div className={styles.chartToolbar}>
          <div aria-label="Date basis" className={styles.metricTabs} role="group">
            <button
              aria-pressed={metric === "interment_date"}
              className={`${styles.metricTab} ${metric === "interment_date" ? styles.metricTabActive : ""}`}
              onClick={() => { setSelectedKey(null); onMetricChange("interment_date"); }}
              type="button"
            >
              Interment date
            </button>
            <button
              aria-pressed={metric === "created_at"}
              className={`${styles.metricTab} ${metric === "created_at" ? styles.metricTabActive : ""}`}
              onClick={() => { setSelectedKey(null); onMetricChange("created_at"); }}
              type="button"
            >
              Record created
            </button>
          </div>
          <span className={styles.chartScopeNote}>
            {series.rangeLabel} · {series.timezone}
            {series.excludedUndatedCount > 0 ? ` · ${series.excludedUndatedCount} undated excluded` : ""}
          </span>
        </div>

        {error ? (
          <div className={styles.trendEmpty} role="status">
            <p className={styles.trendEmptyTitle}>Trend series unavailable</p>
            <p className={styles.trendEmptyDesc}>{error}</p>
          </div>
        ) : series.totalInPeriod === 0 ? (
          <div className={styles.trendEmpty} role="status">
            <p className={styles.trendEmptyTitle}>
              No {metric === "interment_date" ? "interment dates" : "record creations"} in {series.rangeLabel}
            </p>
            <p className={styles.trendEmptyDesc}>
              {metric === "interment_date"
                ? "Recorded interment dates fall outside the selected window. Switch to All Time to view historical interments, or view records by system creation date."
                : "No new burial records were created in the selected reporting window."}
            </p>
            <div className={styles.trendEmptyActions}>
              {series.period !== "all-time" ? (
                <button className={styles.metricTab} onClick={onSwitchToAllTime} type="button">
                  View All Time
                </button>
              ) : null}
              {metric === "interment_date" ? (
                <button className={styles.metricTab} onClick={() => onMetricChange("created_at")} type="button">
                  Switch to Record created
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <figure className={styles.trendChartWrap} style={{ margin: 0 }}>
            <svg
              aria-label={`Burial Records Over Time (${metric === "interment_date" ? "interment date" : "record creation date"}, ${mode}, ${series.totalInPeriod} total records across ${series.rangeLabel})`}
              className={`${styles.trendSvg} admin-trend-svg`}
              role="img"
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            >
              {yTicks.map((tick) => {
                const y = padTop + plotH - (yMax > 0 ? (tick / yMax) * plotH : 0);
                return (
                  <g key={tick}>
                    <line className={styles.trendGridLine} x1={padLeft} x2={chartWidth - padRight} y1={y} y2={y} />
                    <text className={styles.trendAxisText} textAnchor="end" x={padLeft - 8} y={y + 4}>
                      {tick}
                    </text>
                  </g>
                );
              })}

              {areaPath ? <path className={styles.trendArea} d={areaPath} /> : null}
              {linePath ? <path className={styles.trendLine} d={linePath} /> : null}

              {activeEntry ? (
                <>
                  <line
                    className={styles.trendGuideLine}
                    x1={activeEntry.x}
                    x2={activeEntry.x}
                    y1={padTop}
                    y2={padTop + plotH}
                  />
                  {(() => {
                    const boxW = 132;
                    const boxH = 34;
                    const bx = Math.max(padLeft, Math.min(chartWidth - padRight - boxW, activeEntry.x - boxW / 2));
                    const by = Math.max(2, activeEntry.y - boxH - 12);
                    return (
                      <g className={styles.trendTooltipSvg} pointerEvents="none">
                        <rect className={styles.trendTooltipRect} height={boxH} rx={7} width={boxW} x={bx} y={by} />
                        <text className={styles.trendTooltipSub} textAnchor="middle" x={bx + boxW / 2} y={by + 13}>
                          {activeEntry.point.fullLabel}
                        </text>
                        <text className={styles.trendTooltipVal} textAnchor="middle" x={bx + boxW / 2} y={by + 27}>
                          {activeEntry.val.toLocaleString()} {mode === "cumulative" ? "total" : activeEntry.val === 1 ? "burial" : "burials"}
                        </text>
                      </g>
                    );
                  })()}
                </>
              ) : null}

              {coords.map((entry, idx) => {
                const isActive = idx === activePointIndex;
                const showLabel = idx % xLabelStep === 0 || idx === coords.length - 1;
                return (
                  <g key={entry.point.key}>
                    {showLabel ? (
                      <text className={styles.trendAxisText} textAnchor="middle" x={entry.x} y={chartHeight - 6}>
                        {entry.point.label}
                      </text>
                    ) : null}
                    {isActive ? (
                      <circle className={styles.trendPointFocusRing} cx={entry.x} cy={entry.y} r={7.5} />
                    ) : null}
                    <circle
                      aria-label={`${entry.point.fullLabel}: ${entry.val} ${mode === "cumulative" ? "cumulative records" : "burial records"}`}
                      className={isActive ? styles.trendPointActive : styles.trendPoint}
                      cx={entry.x}
                      cy={entry.y}
                      onClick={() => setSelectedKey(entry.point.key)}
                      onFocus={() => setSelectedKey(entry.point.key)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedKey(entry.point.key);
                        }
                      }}
                      onMouseEnter={() => setSelectedKey(entry.point.key)}
                      r={isActive ? 4.8 : 3.6}
                      role="button"
                      tabIndex={0}
                    />
                  </g>
                );
              })}
            </svg>

            {activeEntry ? (
              <div className={styles.trendCallout}>
                <div className={styles.trendCalloutMain}>
                  <strong>{activeEntry.point.fullLabel}</strong>
                  <strong>
                    {activeEntry.val.toLocaleString()} {mode === "cumulative" ? "cumulative" : activeEntry.val === 1 ? "burial" : "burials"}
                  </strong>
                  {activeDelta && activeDelta.kind === "percent" ? (
                    <span className={`${styles.periodPill} ${activeDelta.direction === "up" ? styles.periodPillPositive : styles.periodPillNeutral}`}>
                      {activeDelta.percent > 0 ? "↑" : activeDelta.percent < 0 ? "↓" : "·"} {activeDelta.percent > 0 ? "+" : ""}{activeDelta.percent}% vs. prior
                    </span>
                  ) : null}
                </div>
                <Link className={styles.panelLink} href="/admin/burial-records">
                  View records
                  <Icon name="arrowUpRight" size={13} />
                </Link>
              </div>
            ) : null}

            <figcaption className="sr-only">
              {series.totalInPeriod} total burial records across {series.rangeLabel}, grouped by {series.interval}.
            </figcaption>
          </figure>
        )}
      </div>
    </section>
  );
}

export function BurialsBySectionCard({
  sections,
  totalBurialRecords,
}: {
  sections: SectionBurialBar[];
  totalBurialRecords: number;
}) {
  const [sortBy, setSortBy] = useState<"count" | "name">("count");

  const sorted = useMemo(() => {
    const copy = [...sections];
    if (sortBy === "name") {
      copy.sort((a, b) => {
        if (a.isUnassigned !== b.isUnassigned) return a.isUnassigned ? 1 : -1;
        return a.areaName.localeCompare(b.areaName);
      });
    } else {
      copy.sort((a, b) => {
        if (a.isUnassigned !== b.isUnassigned) return a.isUnassigned ? 1 : -1;
        return b.burialCount - a.burialCount || a.areaName.localeCompare(b.areaName);
      });
    }
    return copy;
  }, [sections, sortBy]);

  const maxCount = Math.max(...sorted.map((item) => item.burialCount), 1);

  return (
    <section aria-labelledby="dash-section-title" className={styles.panel}>
      <header className={styles.panelHeader}>
        <div className={styles.panelTitleWrap}>
          <span className={styles.panelIcon}>
            <Icon name="layers" size={16} />
          </span>
          <div>
            <h2 className={styles.panelTitle} id="dash-section-title">Burials by Cemetery Section</h2>
            <p className={styles.panelSubtitle}>Total burial records by plot section</p>
          </div>
        </div>
        {sorted.length > 1 ? (
          <button
            className={styles.sortToggleBtn}
            onClick={() => setSortBy((prev) => (prev === "count" ? "name" : "count"))}
            type="button"
          >
            Sort: {sortBy === "count" ? "Count" : "A–Z"}
          </button>
        ) : null}
      </header>

      <div className={styles.panelBody}>
        {sorted.length === 0 ? (
          <div className={styles.trendEmpty} role="status">
            <p className={styles.trendEmptyTitle}>No section assignments yet</p>
            <p className={styles.trendEmptyDesc}>
              Burial counts appear here once interment records are linked to a cemetery section.
            </p>
            <Link className={styles.panelLink} href="/admin/burial-records">
              Open Burial Records
              <Icon name="arrowUpRight" size={13} />
            </Link>
          </div>
        ) : (
          <>
            <ol className={styles.sectionList}>
              {sorted.slice(0, 7).map((section, index) => {
                const widthPct = Math.max(4, Math.round((section.burialCount / maxCount) * 100));
                const color = section.isUnassigned
                  ? "var(--dash-unknown)"
                  : SECTION_BAR_COLORS[Math.min(index, SECTION_BAR_COLORS.length - 1)];
                const href = section.isUnassigned
                  ? "/admin/burial-records"
                  : `/admin/burial-records?section=${encodeURIComponent(section.areaName)}`;
                return (
                  <li key={section.areaId ?? "unassigned"}>
                    <Link
                      className={styles.sectionRowLink}
                      href={href}
                      title={`${section.areaName}: ${section.burialCount.toLocaleString()} burial records (counts each interment, including shared gravesites)`}
                    >
                      <span className={styles.sectionName}>{section.areaName}</span>
                      <span aria-hidden="true" className={styles.sectionBarTrack}>
                        <span className={styles.sectionBarFill} style={{ width: `${widthPct}%`, background: color }} />
                      </span>
                      <strong className={styles.sectionCount}>{section.burialCount.toLocaleString()}</strong>
                    </Link>
                  </li>
                );
              })}
            </ol>
            <p className={styles.sectionFooterNote}>
              Counts all {totalBurialRecords.toLocaleString()} burial records (shared lots count each interment).
            </p>
          </>
        )}
      </div>
    </section>
  );
}

export function CemeteryOccupancyCard({
  metrics,
  asOfLabel,
  totalInterments,
}: {
  metrics: OccupancyMetrics;
  asOfLabel: string;
  totalInterments?: number;
}) {
  const radius = 56;
  const circumference = 2 * Math.PI * radius;

  const segments = [
    { key: "occupied", label: "Occupied", count: metrics.occupied, color: "var(--dash-green)", href: "/admin/plot-management?state=occupied" },
    { key: "available", label: "Available", count: metrics.available, color: "var(--dash-green-pale)", href: "/admin/plot-management?state=available" },
    { key: "hold", label: "On Hold", count: metrics.onHold, color: "var(--dash-hold)", href: "/admin/plot-management?state=hold" },
    { key: "booked", label: "Reserved", count: metrics.booked, color: "var(--dash-reserved)", href: "/admin/plot-management?state=booked" },
    ...(metrics.unknown > 0
      ? [{ key: "unknown", label: "Unassessed", count: metrics.unknown, color: "var(--dash-unknown)", href: "/admin/plot-management?state=unknown" }]
      : []),
  ];

  const nonZeroSegments = segments.filter((s) => s.count > 0);
  const arcs = nonZeroSegments.reduce<Array<{
    key: string;
    color: string;
    dashArray: string;
    dashOffset: number;
  }>>((acc, seg) => {
    const usedLength = acc.reduce((sum, item) => sum + Number(item.dashArray.split(" ")[0]), 0);
    const ratio = metrics.total > 0 ? seg.count / metrics.total : 0;
    const rawLen = ratio * circumference;
    const visibleLen = seg.count > 0 && rawLen < 6 ? 6 : rawLen;
    acc.push({
      key: seg.key,
      color: seg.color,
      dashArray: `${visibleLen.toFixed(2)} ${(circumference - visibleLen).toFixed(2)}`,
      dashOffset: -usedLength,
    });
    return acc;
  }, []);

  return (
    <section aria-labelledby="dash-occupancy-title" className={styles.panel}>
      <header className={styles.panelHeader}>
        <div className={styles.panelTitleWrap}>
          <span className={styles.panelIcon}>
            <Icon name="shield" size={16} />
          </span>
          <div>
            <h2 className={styles.panelTitle} id="dash-occupancy-title">Cemetery Occupancy</h2>
            <p className={styles.panelSubtitle}>Snapshot as of {asOfLabel}</p>
          </div>
        </div>
      </header>

      <div className={styles.panelBody}>
        <div className={styles.occupancyLayout}>
          <div className={styles.occupancyDonutWrap}>
            <svg
              aria-label={`Cemetery Occupancy: ${metrics.rateDisplay} occupied across ${metrics.total.toLocaleString()} plots (${metrics.occupied} occupied, ${metrics.available} available, ${metrics.onHold} on hold, ${metrics.booked} reserved)`}
              className={`${styles.occupancySvg} admin-occupancy-svg`}
              role="img"
              viewBox="0 0 144 144"
            >
              <circle
                cx="72"
                cy="72"
                fill="none"
                r={radius}
                stroke="var(--dash-card-deep)"
                strokeWidth="20"
              />
              {arcs.map((arc) => (
                <circle
                  cx="72"
                  cy="72"
                  fill="none"
                  key={arc.key}
                  r={radius}
                  stroke={arc.color}
                  strokeDasharray={arc.dashArray}
                  strokeDashoffset={arc.dashOffset}
                  strokeWidth="20"
                />
              ))}
            </svg>
            <div className={styles.occupancyCenter}>
              <strong>{metrics.rateDisplay}</strong>
              <span>{metrics.classificationIncomplete ? "Incomplete" : "Occupied"}</span>
            </div>
          </div>

          <ul className={styles.occupancyLegend}>
            {segments.map((seg) => (
              <li key={seg.key}>
                <Link className={styles.occupancyLegendLink} href={seg.href}>
                  <span className={styles.occupancyLegendLabel}>
                    <span aria-hidden="true" className={styles.occupancyDot} style={{ background: seg.color }} />
                    {seg.label}
                  </span>
                  <strong className={styles.occupancyLegendValue}>{seg.count.toLocaleString()}</strong>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <p className={styles.occupancyFooter}>
          {metrics.total.toLocaleString()} registered lots total
          {typeof totalInterments === "number" && totalInterments > metrics.occupied
            ? ` · ${metrics.occupied.toLocaleString()} occupied plots hold ${totalInterments.toLocaleString()} interments (shared lots counted once).`
            : ". Mutually exclusive plot states; shared gravesites count once per physical lot."}
        </p>
      </div>
    </section>
  );
}
