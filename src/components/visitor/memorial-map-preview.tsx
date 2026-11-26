"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { PARK_NAME } from "@/lib/park-details";
import { planningPlaces } from "@/lib/park-explorer-features";
import { buildLayoutWalkwayGraph, layoutStartPoints, routeOnParkLayout } from "@/lib/phase2-layout-routing";
import {
  initialVisibility,
  loadPlanningBundle,
  type CadFeature,
  type PlanningBundle,
} from "@/lib/phase2-planning";
import type { PlanningMapActions } from "./phase2-planning-canvas";
import styles from "./memorial-map-preview.module.css";

const PlanningCanvas = dynamic(
  () => import("./phase2-planning-canvas").then((module) => module.PhaseTwoPlanningCanvas),
  { ssr: false },
);

export function MemorialMapPreview({
  planningPlot,
  garden,
  plotReference,
}: {
  planningPlot?: string | null;
  garden: string;
  plotReference: string;
}) {
  const [bundle, setBundle] = useState<PlanningBundle | null>(null);
  const [failed, setFailed] = useState(false);
  const [showTrees, setShowTrees] = useState(true);
  const [showRoute, setShowRoute] = useState(true);
  const attempt = 0;
  const actions = useRef<PlanningMapActions | null>(null);

  useEffect(() => {
    if (bundle || failed) return;
    const controller = new AbortController();
    loadPlanningBundle(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setBundle(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [bundle, failed, attempt]);

  const targetFeature = useMemo<CadFeature | null>(() => {
    if (!bundle || !planningPlot) return null;
    return (
      bundle.data.layers.lawn.find((feature) => feature.id === planningPlot) ??
      bundle.data.layers.estates.find((feature) => feature.id === planningPlot) ??
      null
    );
  }, [bundle, planningPlot]);

  const gardenPlace = useMemo(() => {
    if (!bundle || !garden || garden === "Not recorded") return null;
    const places = planningPlaces(bundle);
    const normalized = garden.trim().toLowerCase();
    return (
      places.find((place) => place.name.toLowerCase() === normalized) ??
      places.find((place) => normalized.includes(place.name.toLowerCase())) ??
      null
    );
  }, [bundle, garden]);

  const focusTarget = useCallback(
    (mapActions: PlanningMapActions | null) => {
      if (!mapActions) return;
      if (targetFeature) {
        mapActions.focus(targetFeature);
      } else if (gardenPlace?.points.length === 1) {
        mapActions.place(gardenPlace.points[0]);
      } else if (gardenPlace && gardenPlace.points.length > 1) {
        mapActions.focusPlaces(gardenPlace.points);
      } else {
        mapActions.reset();
      }
    },
    [targetFeature, gardenPlace],
  );

  const onReady = useCallback(
    (value: PlanningMapActions) => {
      actions.current = value;
      if (!targetFeature && gardenPlace) {
        if (gardenPlace.points.length === 1) value.place(gardenPlace.points[0]);
        else if (gardenPlace.points.length > 1) value.focusPlaces(gardenPlace.points);
      }
    },
    [targetFeature, gardenPlace],
  );

  const visible = useMemo(
    () => ({
      ...initialVisibility,
      paths: true,
      lawn: true,
      estates: true,
    }),
    [],
  );

  const places = useMemo(() => (bundle ? planningPlaces(bundle) : []), [bundle]);
  const entranceRoute = useMemo(() => {
    if (!bundle || !targetFeature) return null;
    const starts = layoutStartPoints(bundle);
    if (!starts.length) return null;
    const graph = buildLayoutWalkwayGraph(bundle);
    return routeOnParkLayout(graph, starts[0], targetFeature);
  }, [bundle, targetFeature]);
  const badgeText =
    garden && garden !== "Not recorded"
      ? plotReference && plotReference !== "Not recorded"
        ? plotReference
        : garden
      : PARK_NAME;

  if (failed) {
    return (
      <div className="memorial-map-surface">
        <Icon name="map" size={32} />
        <span>{badgeText}</span>
      </div>
    );
  }

  return (
    <div
      className={styles.preview}
      aria-label={`Interactive park layout preview for ${badgeText}`}
    >
      <div className={styles.topBar}>
        <span className={styles.badge}>
          <span className={styles.pinDot} aria-hidden="true" />
          <span className={styles.badgeLabel}>{badgeText}</span>
        </span>
        {bundle ? (
          <div className={styles.controls}>
            {entranceRoute ? (
              <button
                type="button"
                className={styles.chip}
                aria-pressed={showRoute}
                title={showRoute ? "Hide entrance route" : "Show route from entrance"}
                onClick={() => {
                  const next = !showRoute;
                  setShowRoute(next);
                  if (next) actions.current?.fitRoute?.([...entranceRoute.path, ...entranceRoute.approach]);
                  else focusTarget(actions.current);
                }}
              >
                Route
              </button>
            ) : null}
            <button
              type="button"
              className={styles.chip}
              aria-pressed={showTrees}
              title={showTrees ? "Hide tree canopy" : "Show tree canopy"}
              onClick={() => setShowTrees((value) => !value)}
            >
              Canopy
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              aria-label={targetFeature ? "Focus assigned gravesite" : "Recenter map"}
              title={targetFeature ? "Focus assigned gravesite" : "Recenter map"}
              onClick={() => focusTarget(actions.current)}
            >
              <Icon name="target" size={14} />
            </button>
          </div>
        ) : null}
      </div>

      {bundle ? (
        <PlanningCanvas
          key={attempt}
          bundle={bundle}
          visible={visible}
          selected={targetFeature}
          focusOnLoad={targetFeature}
          layoutRoute={showRoute && entranceRoute ? { path: entranceRoute.path, approach: entranceRoute.approach, startLabel: entranceRoute.start.label } : null}
          places={false}
          trees={showTrees}
          protection
          details
          scrollWheelZoom={false}
          zoomPosition="bottomright"
          attempt={attempt}
          onReady={onReady}
          actions={actions}
          onTogglePaths={() => {}}
          onError={() => setFailed(true)}
          onSelect={() => {}}
          explorer={{
            places,
            showLabels: true,
            category: "gardens",
            selectedId: gardenPlace?.id,
            onSelect: (place) => {
              if (place.points.length === 1) actions.current?.place(place.points[0]);
              else if (place.points.length > 1) actions.current?.focusPlaces(place.points);
            },
          }}
        />
      ) : (
        <div className={styles.loading} role="status">
          <Icon name="map" size={26} />
          <span>Loading park layout…</span>
        </div>
      )}

      {bundle ? (
        <div className={styles.bottomHint}>
          <Icon name="location" size={13} />
          <span>
            {targetFeature
              ? "Highlighted plot · Drag or zoom to inspect"
              : "Park layout · Drag or zoom to explore"}
          </span>
        </div>
      ) : null}
    </div>
  );
}
