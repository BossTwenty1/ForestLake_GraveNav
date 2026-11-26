"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui/icons";
import { PARK_NAME } from "@/lib/park-details";
import { planningPlaces, type ParkPlace } from "@/lib/park-explorer-features";
import {
  initialVisibility,
  loadPlanningBundle,
  type CadFeature,
  type PlanningBundle,
} from "@/lib/phase2-planning";
import type { PlanningMapActions } from "./phase2-planning-canvas";
import styles from "./homepage-park-map.module.css";

const PlanningCanvas = dynamic(
  () => import("./phase2-planning-canvas").then((module) => module.PhaseTwoPlanningCanvas),
  { ssr: false },
);

const landscapeRoot = "/phase2-viewer/landscape/";

type SectionItem = {
  id: string;
  name: string;
  description: string;
  area: string;
  icon: IconName;
  matchName?: string;
  isPathways?: boolean;
};

const sections: SectionItem[] = [
  {
    id: "butterfly-palm-garden",
    name: "Butterfly Palm Garden",
    description: "Lawns A and B",
    area: "Garden lawns",
    icon: "tree",
    matchName: "Butterfly Palm Garden",
  },
  {
    id: "majestic-palm-garden",
    name: "Majestic Palm Garden",
    description: "Lawns A, C and D",
    area: "Garden lawns",
    icon: "tree",
    matchName: "Majestic Palm Garden",
  },
  {
    id: "majestic-palm-court-c",
    name: "Majestic Palm Court C",
    description: "Estate lots",
    area: "Estate section",
    icon: "location",
    matchName: "Majestic Palm Court C",
  },
  {
    id: "park-pathways",
    name: "Park pathways",
    description: "Roads, paths and landmarks",
    area: "Park layout",
    icon: "walk",
    isPathways: true,
  },
];

export function HomepageParkMap({
  gardenNames,
  hasParkPreview,
}: {
  gardenNames: string[];
  hasParkPreview: boolean;
}) {
  const [bundle, setBundle] = useState<PlanningBundle | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [assetError, setAssetError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<ParkPlace | null>(null);
  const [selectedPlot, setSelectedPlot] = useState<CadFeature | null>(null);
  const [plotPopupOpen, setPlotPopupOpen] = useState(false);

  const [showPlots, setShowPlots] = useState(true);
  const [showTrees, setShowTrees] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showPaths, setShowPaths] = useState(true);

  const actions = useRef<PlanningMapActions | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const onReady = useCallback((value: PlanningMapActions) => {
    actions.current = value;
  }, []);

  useEffect(() => {
    if (bundle || loadFailed) return;
    const controller = new AbortController();
    loadPlanningBundle(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setBundle(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true);
      });
    return () => controller.abort();
  }, [bundle, loadFailed, attempt]);

  const places = useMemo(() => (bundle ? planningPlaces(bundle) : []), [bundle]);

  const visible = useMemo(
    () => ({
      ...initialVisibility,
      paths: showPaths,
      lawn: showPlots,
      estates: showPlots,
    }),
    [showPaths, showPlots],
  );

  function resetView() {
    setActiveSectionId(null);
    setSelectedPlace(null);
    setSelectedPlot(null);
    setPlotPopupOpen(false);
    actions.current?.reset();
  }

  function handleSectionClick(item: SectionItem) {
    if (activeSectionId === item.id) {
      resetView();
      return;
    }

    setActiveSectionId(item.id);
    setSelectedPlot(null);
    setPlotPopupOpen(false);

    if (item.isPathways) {
      setShowPaths(true);
      setShowLabels(true);
      const pathwayPlaces = places.filter(
        (place) => place.category === "pathways" || place.category === "landmarks",
      );
      const walkway = places.find((place) => place.category === "pathways") ?? null;
      setSelectedPlace(walkway);
      const allPoints = pathwayPlaces.flatMap((place) => place.points);
      if (allPoints.length > 0) {
        actions.current?.focusPlaces(allPoints);
      } else {
        actions.current?.reset();
      }
      return;
    }

    setShowLabels(true);
    const match = places.find(
      (place) => place.name.toLowerCase() === (item.matchName ?? item.name).toLowerCase(),
    );
    if (match) {
      setSelectedPlace(match);
      if (match.points.length === 1) {
        actions.current?.place(match.points[0]);
      } else if (match.points.length > 1) {
        actions.current?.focusPlaces(match.points);
      }
    } else {
      setSelectedPlace(null);
      actions.current?.reset();
    }
  }

  const handlePlaceSelect = useCallback((place: ParkPlace) => {
    setSelectedPlot(null);
    setPlotPopupOpen(false);
    setSelectedPlace(place);
    const matchingSection = sections.find(
      (item) => item.matchName?.toLowerCase() === place.name.toLowerCase(),
    );
    setActiveSectionId(
      matchingSection?.id ?? (place.category === "pathways" ? "park-pathways" : null),
    );
    if (place.points.length === 1) {
      actions.current?.place(place.points[0]);
    } else if (place.points.length > 1) {
      actions.current?.focusPlaces(place.points);
    }
  }, []);

  const handlePlotSelect = useCallback((feature: CadFeature | null) => {
    if (!feature) {
      setSelectedPlot(null);
      setPlotPopupOpen(false);
      return;
    }
    setActiveSectionId(null);
    setSelectedPlace(null);
    setSelectedPlot(feature);
    setPlotPopupOpen(true);
  }, []);

  const activeSection = sections.find((item) => item.id === activeSectionId) ?? null;
  const searchGardenQuery =
    selectedPlace?.kind === "Garden"
      ? selectedPlace.name
      : activeSection && !activeSection.isPathways
        ? activeSection.name
        : null;

  return (
    <div
      className={styles.mapCard}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        if (plotPopupOpen) setPlotPopupOpen(false);
        else if (selectedPlace || activeSectionId || selectedPlot) resetView();
      }}
    >
      <div className={styles.gardenLegend}>
        <div className={styles.legendTop}>
          <p className={styles.legendLabel}>Park Layout</p>
          {activeSectionId || selectedPlace || selectedPlot ? (
            <button type="button" className={styles.legendReset} onClick={resetView}>
              <Icon name="target" size={14} />
              Reset view
            </button>
          ) : null}
        </div>
        <h3>Designated Garden Sections</h3>
        <p>Select a garden section or pathway to focus the map, or click any plot outline to inspect.</p>

        <ul className={styles.sectionList}>
          {sections.map((item, index) => {
            const isActive = activeSectionId === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={styles.sectionButton}
                  aria-pressed={isActive}
                  onClick={() => handleSectionClick(item)}
                >
                  <span className={styles.legendIndex} aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className={styles.sectionText}>
                    <strong>{item.name}</strong>
                    <small>{item.description}</small>
                  </span>
                  <span className={styles.sectionMeta}>
                    <span className={styles.legendArea}>{item.area}</span>
                    <Icon name="chevronRight" size={15} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {gardenNames.length > 0 ? (
          <nav className={styles.gardenLinks} aria-label="Quick garden searches">
            {gardenNames.map((garden) => (
              <Link href={"/results?section=" + encodeURIComponent(garden)} key={garden}>
                {garden}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      <div
        ref={stageRef}
        className={styles.mapStage}
        aria-label={`${PARK_NAME} interactive park layout`}
      >
        <div className={styles.mapTopBar}>
          <div className={styles.mapBadge}>
            <span className={styles.liveDot} aria-hidden="true" />
            <span>{PARK_NAME} · Interactive Layout</span>
          </div>

          {bundle ? (
            <div className={styles.layerBar} role="group" aria-label="Map layer toggles">
              <button
                type="button"
                className={styles.layerChip}
                aria-pressed={showPlots}
                onClick={() => setShowPlots((value) => !value)}
              >
                Plots
              </button>
              <button
                type="button"
                className={styles.layerChip}
                aria-pressed={showTrees}
                onClick={() => setShowTrees((value) => !value)}
              >
                Canopy
              </button>
              <button
                type="button"
                className={styles.layerChip}
                aria-pressed={showLabels}
                onClick={() => setShowLabels((value) => !value)}
              >
                Labels
              </button>
              <button
                type="button"
                className={styles.resetChip}
                aria-label="Reset map view"
                title="Reset map view"
                onClick={resetView}
              >
                <Icon name="target" size={15} />
              </button>
            </div>
          ) : null}
        </div>

        {bundle ? (
          <PlanningCanvas
            key={attempt}
            bundle={bundle}
            visible={visible}
            selected={showPlots ? selectedPlot : null}
            places={false}
            trees={showTrees}
            protection
            details
            scrollWheelZoom={false}
            zoomPosition="bottomright"
            attempt={attempt}
            onReady={onReady}
            actions={actions}
            onTogglePaths={() => setShowPaths((value) => !value)}
            onError={() => setAssetError(true)}
            lotPopup={
              showPlots && selectedPlot && plotPopupOpen
                ? { onClose: () => setPlotPopupOpen(false) }
                : undefined
            }
            onSelect={handlePlotSelect}
            explorer={{
              places,
              showLabels,
              category: activeSectionId === "park-pathways" ? "pathways" : "gardens",
              selectedId: selectedPlace?.id,
              onSelect: handlePlaceSelect,
            }}
          />
        ) : hasParkPreview ? (
          <div className={styles.fallbackStage}>
            <div className={styles.fallbackLayers} role="img" aria-label="Preview of the Phase 2 park layout">
              {["base.png", "roads.png", "paths.png", "trees.png"].map((file) => (
                <Image
                  src={landscapeRoot + file}
                  alt=""
                  fill
                  key={file}
                  sizes="(max-width: 1023px) 100vw, 60vw"
                  unoptimized
                />
              ))}
            </div>
            {!loadFailed ? (
              <div className={styles.loadingPill} role="status">
                Loading interactive map…
              </div>
            ) : null}
          </div>
        ) : (
          <div className={styles.mapPlaceholder}>
            <Icon name="map" size={40} />
            <p>Open the full park map to explore sections, pathways, and landmarks.</p>
            <Link href="/map" className={styles.placeholderLink}>
              Open Park Map <Icon name="navigation" size={16} />
            </Link>
          </div>
        )}

        {assetError ? (
          <div className={styles.errorToast} role="alert">
            <span>Some map layers could not load.</span>
            <button
              type="button"
              onClick={() => {
                setBundle(null);
                setLoadFailed(false);
                setAssetError(false);
                setAttempt((value) => value + 1);
              }}
            >
              Retry
            </button>
          </div>
        ) : null}

        {bundle && (selectedPlace || activeSection) && !plotPopupOpen ? (
          <div className={styles.selectionCard} role="region" aria-label="Selected park area">
            <div className={styles.selectionHeader}>
              <span className={styles.selectionIcon} aria-hidden="true">
                <Icon
                  name={
                    selectedPlace?.category === "pathways" || activeSection?.isPathways
                      ? "walk"
                      : selectedPlace?.category === "landmarks"
                        ? "location"
                        : "tree"
                  }
                  size={18}
                />
              </span>
              <div className={styles.selectionCopy}>
                <span className={styles.selectionKind}>
                  {selectedPlace?.kind ?? activeSection?.area ?? "Park area"}
                </span>
                <strong>{selectedPlace?.name ?? activeSection?.name}</strong>
              </div>
              <button
                type="button"
                className={styles.selectionClose}
                aria-label="Clear selection"
                onClick={resetView}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
            <p className={styles.selectionNote}>
              {activeSection
                ? `${activeSection.description}. Drag to explore or click any plot outline to view details.`
                : "Shown on the interactive park layout. Click any nearby plot outline to view details."}
            </p>
            <div className={styles.selectionActions}>
              {searchGardenQuery ? (
                <Link
                  href={"/results?section=" + encodeURIComponent(searchGardenQuery)}
                  className={styles.selectionPrimary}
                >
                  <Icon name="search" size={14} />
                  Search this garden
                </Link>
              ) : null}
              <Link href="/map" className={styles.selectionSecondary}>
                Full map
                <Icon name="arrowUpRight" size={14} />
              </Link>
            </div>
          </div>
        ) : bundle && !plotPopupOpen ? (
          <div className={styles.hintPill}>
            <Icon name="navigation" size={14} />
            <span>Drag to pan · Click any garden or plot to inspect</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
