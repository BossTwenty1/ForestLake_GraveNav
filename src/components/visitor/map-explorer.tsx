"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { PARK_NAME } from "@/lib/park-details";
import { visitorPlotDetails } from "@/lib/visitor-presentation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/icons";
import { subscribeToLocation, type GpsPosition } from "@/lib/navigation-geo";
import { ARRIVAL_DISTANCE_METERS, classifyParkGps } from "@/lib/phase2-gps-bridge";
import {
  buildLayoutWalkwayGraph,
  formatRouteDistance,
  layoutStartPoints,
  PARK_ENTRANCE_MAPS_URL,
  routeOnParkLayout,
  type LayoutStartPoint,
} from "@/lib/phase2-layout-routing";
import { featureLayer, initialVisibility, landmarkName, layerDefinitions, loadPlanningBundle, type CadFeature, type LayerKey, type PlanningBundle } from "@/lib/phase2-planning";
import type { PlanningMapActions } from "./phase2-planning-canvas";
import { PhaseTwoGeographicMap } from "./phase2-geographic-map";
import type { PhaseTwoResult } from "@/lib/phase2-geographic";
import type { PublicBurialRecord } from "@/lib/supabase/types";
import { PlotCoordinateDetails } from "./plot-coordinate-details";
import layout from "./map-explorer.module.css";

const PlanningCanvas = dynamic(() => import("./phase2-planning-canvas").then(module => module.PhaseTwoPlanningCanvas), {
  ssr: false,
  loading: () => <div className="map-loading"><span className="map-loading__spinner" />Loading cemetery layout…</div>,
});

interface MapExplorerProps {
  staffTools?: boolean;
  showHeading?: boolean;
  gardens?: string[];
  records?: PublicBurialRecord[];
  query?: string;
  section?: string;
  page?: number;
  total?: number;
  pageSize?: number;
  recordsError?: string;
  gardenListUnavailable?: boolean;
  view?: "planning" | "geographic";
  destination?: PublicBurialRecord | null;
  planningPlot?: string | null;
  geography?: PhaseTwoResult | null;
  requestedId?: string;
  returnTo?: string;
}

export function MapExplorer({
  staffTools = false,
  showHeading = true, gardens = [], records = [], query: memorialQuery = "", section = "all",
  page = 1, total = 0, pageSize = 20, recordsError = "", gardenListUnavailable = false,
  view: requestedView = "planning", destination = null, geography = null, planningPlot = null, requestedId = "", returnTo,
}: MapExplorerProps) {
  // Keep the first six useState calls in this exact order for test harness compatibility.
  const [bundle, setBundle] = useState<PlanningBundle | null>(null);
  const cachedBundle = useRef<PlanningBundle | null>(null);
  const [error, setError] = useState("");
  const [assetError, setAssetError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(initialVisibility);
  const [chosen, setSelected] = useState<CadFeature | null | undefined>(undefined);
  const [popupClosed, setPopupClosed] = useState(Boolean(planningPlot && !staffTools));
  const [query, setQuery] = useState("");
  const [showPlaces, setShowPlaces] = useState(true);
  const [showTrees, setShowTrees] = useState(true);
  const [showProtection, setShowProtection] = useState(true);
  const [showDetails, setShowDetails] = useState(true);
  const [panelOpen, setPanelOpen] = useState(Boolean(memorialQuery || destination || records.length || recordsError));
  const [mapOptionsOpen, setMapOptionsOpen] = useState(false);
  const [showRoute, setShowRoute] = useState(Boolean(planningPlot && !staffTools));
  const [startPointId, setStartPointId] = useState("entrance");
  const [routeMode, setRouteMode] = useState<"gps" | "landmark">("landmark");
  const [gpsRequested, setGpsRequested] = useState(false);
  const [gpsAttempt, setGpsAttempt] = useState(0);
  const [gpsPosition, setGpsPosition] = useState<GpsPosition | null>(null);
  const [gpsError, setGpsError] = useState("");
  const [gpsDenied, setGpsDenied] = useState(false);
  const [guidanceActive, setGuidanceActive] = useState(false);
  const [preferPaved, setPreferPaved] = useState(false);
  const [routeCardOpen, setRouteCardOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapStyle, setMapStyle] = useState<"illustrated" | "satellite">("illustrated");
  const [satelliteTileError, setSatelliteTileError] = useState(false);

  const planningFallback = !staffTools && requestedView === "geographic" && Boolean(destination) && !geography?.data;
  const view = planningFallback ? "planning" : requestedView;
  const assigned = view === "planning" && planningPlot && bundle
    ? [...bundle.data.layers.lawn, ...bundle.data.layers.estates].find(feature => feature.id === planningPlot) ?? null : null;
  const selected = chosen === undefined ? assigned : chosen;
  const showLotPopup = Boolean(selected && !popupClosed);
  const memorial = (requestedView === "geographic" && !assigned) || !selected || selected.id === assigned?.id ? destination : null;
  const memorialPlot = memorial ? visitorPlotDetails(memorial) : null;
  const mapUrl = (mode: "planning" | "geographic", id = requestedId, resultPage = page) => "/map?" + new URLSearchParams({
    query: memorialQuery, section, page: String(resultPage), view: mode, ...(id ? { id } : {}),
    ...(returnTo && id === requestedId ? { returnTo } : {}),
  });
  const pageUrl = (next: number) => mapUrl(view, requestedId, next);
  const geographicUnavailable = !staffTools && !requestedId ? {
    title: "Gravesite map unavailable",
    detail: "You can still search memorial records or explore the park map.",
  } : {
    title: "Gravesite location unavailable",
    detail: "Please ask cemetery staff for help locating this gravesite. You can still explore the park map.",
  };

  const initialRouteFitted = useRef(false);
  const gpsRouteFitted = useRef(false);
  const latestRoute = useRef<ReturnType<typeof routeOnParkLayout>>(null);
  const searchPanel = useRef<HTMLDetailsElement | null>(null);
  const memorialSearchPanel = useRef<HTMLDetailsElement | null>(null);
  const mapStage = useRef<HTMLDivElement | null>(null);
  const actions = useRef<PlanningMapActions | null>(null);
  const ready = useCallback((next: PlanningMapActions) => {
    actions.current = next;
    if (latestRoute.current && !initialRouteFitted.current && next.fitRoute) {
      initialRouteFitted.current = true;
      next.fitRoute([...latestRoute.current.path, ...latestRoute.current.approach]);
    }
  }, []);

  useEffect(() => {
    if (staffTools) return;
    const desktop = window.matchMedia("(min-width: 960px)");
    const syncLayout = () => {
      if (desktop.matches) setPanelOpen(true);
      else setRouteCardOpen(false);
    };
    syncLayout();
    desktop.addEventListener("change", syncLayout);
    return () => desktop.removeEventListener("change", syncLayout);
  }, [staffTools]);

  useEffect(() => {
    if (!isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const refit = () => {
      actions.current?.invalidateSize?.();
      if (latestRoute.current) {
        actions.current?.fitRoute?.([...latestRoute.current.path, ...latestRoute.current.approach]);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    const frame = requestAnimationFrame(refit);
    const timer = window.setTimeout(refit, 160);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => actions.current?.invalidateSize?.());
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (view !== "planning" || cachedBundle.current) return;
    const controller = new AbortController();
    loadPlanningBundle(controller.signal, {
      includeCoordinates: staffTools,
      bypassCache: attempt > 0,
    }).then(value => {
      if (!controller.signal.aborted) { cachedBundle.current = value; setBundle(value); }
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "The map could not be loaded.");
    });
    return () => { controller.abort(); actions.current = null; };
  }, [attempt, view, staffTools]);

  useEffect(() => {
    if (staffTools || view !== "planning" || routeMode !== "gps" || !gpsRequested) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }
    let active = true;
    const stop = subscribeToLocation(
      navigator.geolocation,
      next => {
        if (!active) return;
        setGpsPosition(next);
        setGpsError("");
        setGpsDenied(false);
      },
      err => {
        if (!active) return;
        setGpsPosition(null);
        setGpsDenied(err.code === 1);
        setGpsError(
          err.code === 1
            ? "Location permission was blocked. Allow location access or choose a park landmark."
            : "Current location is temporarily unavailable. Try again or choose a park landmark.",
        );
      },
    );
    return () => {
      active = false;
      stop();
    };
  }, [staffTools, view, routeMode, gpsRequested, gpsAttempt]);

  const candidates = bundle ? [...bundle.data.layers.lawn, ...bundle.data.layers.estates] : [];
  const walkwayGraph = useMemo(() => (bundle && !staffTools ? buildLayoutWalkwayGraph(bundle) : null), [bundle, staffTools]);
  const startPoints = useMemo(() => (bundle ? layoutStartPoints(bundle) : []), [bundle]);
  const selectedLandmark = startPoints.find(point => point.id === startPointId) ?? startPoints[0] ?? null;

  const gpsClassification = useMemo(() => {
    if (routeMode !== "gps" || !gpsPosition || !bundle) return null;
    return classifyParkGps(gpsPosition, bundle.data.bounds);
  }, [routeMode, gpsPosition, bundle]);

  const liveGpsStart: LayoutStartPoint | null = useMemo(() => {
    if (routeMode !== "gps" || gpsClassification?.status !== "inside") return null;
    return {
      id: "live-gps",
      label: "Your current location",
      position: gpsClassification.cadXY,
    };
  }, [routeMode, gpsClassification]);

  const activeStart = liveGpsStart ?? selectedLandmark;
  const usingLiveGps = Boolean(liveGpsStart);
  const routeSurfaceMode = preferPaved ? "paved" : "shortest";

  const activeRoute = useMemo(() => {
    if (!showRoute || staffTools || view !== "planning" || !walkwayGraph || !activeStart || !selected) return null;
    return routeOnParkLayout(walkwayGraph, activeStart, selected, { mode: routeSurfaceMode });
  }, [showRoute, staffTools, view, walkwayGraph, activeStart, selected, routeSurfaceMode]);

  useEffect(() => {
    latestRoute.current = activeRoute;
    if (!activeRoute || !actions.current?.fitRoute) return;
    if (!initialRouteFitted.current) {
      initialRouteFitted.current = true;
      actions.current.fitRoute([...activeRoute.path, ...activeRoute.approach]);
    } else if (usingLiveGps && !gpsRouteFitted.current) {
      gpsRouteFitted.current = true;
      actions.current.fitRoute([...activeRoute.path, ...activeRoute.approach]);
    }
  }, [activeRoute, usingLiveGps]);

  const term = query.trim().toUpperCase();
  const matches = term ? candidates.filter(feature => feature.id.toUpperCase().includes(term) ||
    feature.properties.instance_path?.toUpperCase().includes(term)) : [];
  const mapAmenities = ["Parking", "Walkway"].map(name => bundle?.details.labels.find(label => label.name === name));

  function retry() {
    cachedBundle.current = null;
    setBundle(null);
    setError("");
    setAssetError("");
    setSelected(undefined);
    setPopupClosed(false);
    setAttempt(current => current + 1);
  }
  function select(feature: CadFeature | null) {
    if (feature) {
      setPopupClosed(false);
      setVisible(current => ({ ...current, [featureLayer(feature)]: true }));
      actions.current?.focus(feature);
      setSelected(feature);
      setPanelOpen(true);
      return;
    }
    setSelected(null);
    setShowRoute(false);
    setGuidanceActive(false);
  }
  function handleCanvasSelect(feature: CadFeature | null) {
    if (feature) {
      select(feature);
      return;
    }
    if (staffTools) {
      select(null);
      return;
    }
    setPopupClosed(true);
    if (assigned) {
      setSelected(undefined);
      return;
    }
    if (!showRoute && !guidanceActive) {
      setSelected(null);
    }
  }
  function activateGpsMode() {
    setRouteMode("gps");
    setShowRoute(true);
    setPopupClosed(true);
    setGpsDenied(false);
    gpsRouteFitted.current = false;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsRequested(false);
      setGpsError("Location is not supported by this browser. Choose a park landmark instead.");
      return;
    }
    setGpsError("");
    setGpsRequested(true);
    setGpsAttempt(current => current + 1);
  }
  function activateLandmarkMode(nextId = startPointId) {
    setRouteMode("landmark");
    setGpsRequested(false);
    setGpsError("");
    setGpsDenied(false);
    setStartPointId(nextId);
    setShowRoute(true);
    setPopupClosed(true);
    if (selected && walkwayGraph) {
      const nextStart = startPoints.find(point => point.id === nextId) ?? startPoints[0];
      const computed = nextStart ? routeOnParkLayout(walkwayGraph, nextStart, selected, { mode: routeSurfaceMode }) : null;
      if (computed) actions.current?.fitRoute?.([...computed.path, ...computed.approach]);
    }
  }
  function toggleGuidance() {
    if (guidanceActive) {
      setGuidanceActive(false);
      return;
    }
    setGuidanceActive(true);
    setShowRoute(true);
    setPopupClosed(true);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 959px)").matches) {
      setRouteCardOpen(false);
      setIsFullscreen(true);
    }
    if (routeMode === "gps" && !gpsRequested) {
      activateGpsMode();
    }
    if (activeRoute) {
      actions.current?.fitRoute?.([...activeRoute.path, ...activeRoute.approach]);
    }
  }
  function toggle(key: LayerKey) {
    if (selected && featureLayer(selected) === key && visible[key]) setSelected(null);
    setVisible(current => ({ ...current, [key]: !current[key] }));
  }
  function changeMapStyle(next: "illustrated" | "satellite") {
    if (next === mapStyle) return;
    setSatelliteTileError(false);
    initialRouteFitted.current = false;
    setMapStyle(next);
  }
  function search(event: FormEvent) {
    event.preventDefault();
    if (matches.length) select(matches.find(feature => feature.id.toUpperCase() === term ||
      feature.properties.instance_path?.toUpperCase() === term) ?? matches[0]);
  }

  if (!staffTools && view === "geographic" && destination && geography?.data) {
    return <PhaseTwoGeographicMap key={[geography.data.releaseId, geography.data.scopeRevision, destination.id].join(":")}
      data={geography.data} burialId={destination.id} memorial={{
        name: destination.name, dates: destination.dates, reference: visitorPlotDetails(destination).reference,
        profileHref: "/gravesite?" + new URLSearchParams({ id: destination.id, ...(returnTo ? { returnTo } : {}) }),
        parkHref: mapUrl("planning", destination.id),
      }} />;
  }

  const hasFeaturedBanner = Boolean(!staffTools && view === "planning" && memorial && selected && startPoints.length > 0);
  const arrivedByGps = Boolean(usingLiveGps && activeRoute && activeRoute.distanceMeters <= ARRIVAL_DISTANCE_METERS);
  const memorialProfileHref = memorial
    ? "/gravesite?" + new URLSearchParams({ id: memorial.id, ...(returnTo ? { returnTo } : {}) })
    : "";

  const gpsStatusContent = routeMode === "gps" ? (
    gpsError ? (
      <div className={layout.gpsFeedback + " " + layout.gpsFeedbackWarn} role="status">
        <span>{gpsError}</span>
        <div className={layout.gpsFeedbackActions}>
          {gpsDenied ? <button type="button" className={layout.inlineAction} onClick={activateGpsMode}>Try Again</button> : null}
          <button type="button" className={layout.inlineAction} onClick={() => activateLandmarkMode()}>Switch to Landmark</button>
        </div>
      </div>
    ) : !gpsPosition ? (
      <div className={layout.gpsFeedback} role="status">
        <span>Finding your current location… Allow browser location access if prompted.</span>
      </div>
    ) : gpsClassification?.status === "outside" ? (
      <div className={layout.gpsFeedback + " " + layout.gpsFeedbackWarn} role="status">
        <span>
          You appear to be outside {PARK_NAME} ({formatRouteDistance(gpsClassification.distanceMeters).replace(/^Approx\.\s*/, "~")} away). Showing preview from {selectedLandmark?.id === "entrance" ? "Main Entrance" : selectedLandmark?.label ?? "park entrance"}.
        </span>
        <div className={layout.gpsFeedbackActions}>
          <a className={layout.inlineAction} href={PARK_ENTRANCE_MAPS_URL} rel="noopener noreferrer" target="_blank">Directions to Entrance</a>
          <button type="button" className={layout.inlineAction} onClick={() => activateLandmarkMode("entrance")}>Use Main Entrance</button>
        </div>
      </div>
    ) : gpsClassification?.status === "inside" ? (
      <div className={layout.gpsFeedback + (gpsClassification.weakSignal ? " " + layout.gpsFeedbackWarn : " " + layout.gpsFeedbackLive)} role="status">
        <span>
          {arrivedByGps
            ? "You are near this gravesite. Check the name on the grave marker."
            : gpsClassification.weakSignal
              ? `Live GPS active (±${gpsClassification.accuracyMeters} m — weak signal). You can switch to a landmark anytime.`
              : `Live GPS active (±${gpsClassification.accuracyMeters} m) · Route updates as you walk.`}
        </span>
        {gpsClassification.weakSignal ? (
          <div className={layout.gpsFeedbackActions}>
            <button type="button" className={layout.inlineAction} onClick={() => activateLandmarkMode()}>Use Landmark</button>
          </div>
        ) : null}
      </div>
    ) : (
      <div className={layout.gpsFeedback} role="status">
        <span>Refreshing your current location…</span>
      </div>
    )
  ) : null;

  const routeGuide = !staffTools && view === "planning" && selected && startPoints.length > 0 ? (
    <section
      aria-label="Gravesite guide"
      className={"map-destination-card " + layout.routeCard + (hasFeaturedBanner ? " " + layout.featuredBanner : "")}
    >
      <div className={layout.bannerGrid}>
        <div className={layout.bannerIntro}>
          <div className={layout.bannerIntroHead}>
            <h2>{memorial ? "Guide to " + memorial.name : "Park Layout Guide"}</h2>
            {hasFeaturedBanner && memorialProfileHref ? (
              <Link className={layout.mobileMemorialChip} href={memorialProfileHref}>View Memorial</Link>
            ) : null}
          </div>
          {memorialPlot ? (
            <p className={layout.bannerRef}><Icon name="location" size={14} />{memorialPlot.reference}</p>
          ) : null}
          <p className={layout.bannerSubcopy}>Get walking directions to this gravesite.</p>
          <details className={layout.routeDetails} open={guidanceActive || undefined}>
            <summary>{activeRoute ? "View route steps" : "Route controls"}<Icon name="chevronDown" size={16} /></summary>
            {activeRoute ? (
              <ol className={layout.routeSteps}>
                {activeRoute.steps.map((step, index) => (
                  <li key={index}>
                    <span className={layout.routeStepIndex}>{index + 1}</span>
                    <span>{step.instruction}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={layout.routeNote}>Choose your location or a starting landmark to display walking steps.</p>
            )}
            <div className={layout.routeActions}>
              <div className={layout.routeActionRow}>
                {activeRoute ? (
                  <button type="button" className="button button--secondary" onClick={() => actions.current?.fitRoute?.([...activeRoute.path, ...activeRoute.approach])}>
                    <Icon name="map" size={15} />Fit Route
                  </button>
                ) : null}
                <button type="button" className="button button--secondary" onClick={() => actions.current?.focus(selected)}>
                  <Icon name="target" size={15} />Zoom to Plot
                </button>
              </div>
              <a className="button button--secondary" href={PARK_ENTRANCE_MAPS_URL} rel="noopener noreferrer" target="_blank">
                <Icon name="navigation" size={16} />Directions to Park Entrance
              </a>
            </div>
          </details>
        </div>

        <div className={layout.routeChooser}>
          <div className={layout.routeChooserHeader}>
            <div className={layout.routeChooserTitle}>
              <Icon name="route" size={16} />
              <span>Find Route to Gravesite</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={preferPaved}
              className={layout.pavedToggle + (preferPaved ? " " + layout.pavedToggleActive : "")}
              onClick={() => {
                const nextPaved = !preferPaved;
                setPreferPaved(nextPaved);
                if (showRoute && selected && walkwayGraph && activeStart) {
                  const computed = routeOnParkLayout(walkwayGraph, activeStart, selected, { mode: nextPaved ? "paved" : "shortest" });
                  if (computed) actions.current?.fitRoute?.([...computed.path, ...computed.approach]);
                }
              }}
            >
              <span className={layout.pavedToggleTrack} aria-hidden="true">
                <span className={layout.pavedToggleThumb} />
              </span>
              <span>Paved / Accessible</span>
            </button>
          </div>
          <div className={layout.routeModeGrid} role="radiogroup" aria-label="Choose how to start walking directions">
            <div
              className={layout.modeOption + (routeMode === "gps" ? " " + layout.modeOptionActive : "")}
              onClick={() => { if (routeMode !== "gps" || !gpsRequested) activateGpsMode(); }}
            >
              <button
                type="button"
                role="radio"
                aria-checked={routeMode === "gps"}
                className={layout.modeOptionTrigger}
                onClick={event => { event.stopPropagation(); activateGpsMode(); }}
              >
                <span className={layout.radioDot} aria-hidden="true" />
                <span className={layout.modeOptionBody}>
                  <span className={layout.modeOptionHeader}>
                    <Icon name="navigation" size={15} />
                    <strong>Use My Current Location</strong>
                    <span className={layout.recommendedBadge}>Recommended</span>
                  </span>
                  <span className={layout.modeOptionDesc}>
                    Automatically find the easiest route from where I am now.
                  </span>
                </span>
              </button>
            </div>

            <div
              className={layout.modeOption + (routeMode === "landmark" ? " " + layout.modeOptionActive : "")}
              onClick={() => { if (routeMode !== "landmark") activateLandmarkMode(); }}
            >
              <button
                type="button"
                role="radio"
                aria-checked={routeMode === "landmark"}
                className={layout.modeOptionTrigger}
                onClick={event => { event.stopPropagation(); activateLandmarkMode(); }}
              >
                <span className={layout.radioDot} aria-hidden="true" />
                <span className={layout.modeOptionBody}>
                  <span className={layout.modeOptionHeader}>
                    <Icon name="location" size={15} />
                    <strong>Choose a Starting Point</strong>
                  </span>
                  <span className={layout.modeOptionDesc}>
                    Select a park entrance or landmark as your starting point.
                  </span>
                </span>
              </button>
            </div>
          </div>
          {routeMode === "gps" ? gpsStatusContent : (
            <div className={layout.landmarkControls} onClick={event => event.stopPropagation()}>
              <select
                aria-label="Choose a starting point landmark"
                className={layout.routeSelect}
                value={selectedLandmark?.id ?? ""}
                onChange={event => activateLandmarkMode(event.target.value)}
              >
                {startPoints.map(point => (
                  <option key={point.id} value={point.id}>
                    {point.id === "entrance" ? "Main Entrance" : point.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={"button button--primary " + layout.landmarkGoButton}
                onClick={() => {
                  activateLandmarkMode(selectedLandmark?.id ?? "entrance");
                  if (window.matchMedia("(max-width: 959px)").matches) {
                    mapStage.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                  }
                }}
              >
                <span>Get Directions</span>
                <Icon name="chevronRight" size={15} />
              </button>
            </div>
          )}
        </div>

        {hasFeaturedBanner && memorial && memorialPlot ? (
          <div className={layout.bannerSummary} data-selected-candidate={selected?.id ?? ""}>
            <dl className={layout.bannerPlotMeta}>
              <div><dt>Garden</dt><dd>{memorialPlot.garden}</dd></div>
              <div><dt>Gravesite</dt><dd>{memorialPlot.reference}</dd></div>
            </dl>
            {assigned ? (
              <p className={layout.bannerAssigned}>
                <span className={layout.assignedCheck}><Icon name="check" size={12} /></span>
                Assigned on the park layout
              </p>
            ) : null}
            <div className={layout.bannerSummaryActions}>
              {assigned ? (
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => {
                    select(assigned);
                    if (window.matchMedia("(max-width: 959px)").matches) {
                      mapStage.current?.scrollIntoView({ block: "start" });
                      mapStage.current?.focus({ preventScroll: true });
                    }
                  }}
                >
                  <Icon name="target" size={15} />Focus on Plot
                </button>
              ) : null}
              <Link className="button button--secondary" href={memorialProfileHref}>View Memorial</Link>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  ) : null;

  return <div className={"public-map-experience" + (staffTools ? "" : " " + layout.experience)} onKeyDown={event => {
    if (event.key !== "Escape") return;
    if (isFullscreen) setIsFullscreen(false);
    else if (showLotPopup) setPopupClosed(true);
    else if (staffTools || (!assigned && !showRoute)) setSelected(null);
  }}>
    {showHeading ? <header className="public-map-heading">
      <div><h1>Cemetery Map</h1>
        <span>{view === "geographic" ? "View a gravesite location and check available walking directions." : "Explore the park, find gardens and amenities, or search for a memorial."}</span>
      </div>
      <span className="map-source-badge"><Icon name="map" size={15} />{PARK_NAME} · Phase 2</span>
      {!staffTools ? (
        <button
          className={"button button--secondary " + layout.mobileSearch}
          type="button"
          aria-label="Search memorials"
          onClick={() => {
            if (!searchPanel.current || !memorialSearchPanel.current) return;
            searchPanel.current.open = true;
            setPanelOpen(true);
            memorialSearchPanel.current.open = true;
            memorialSearchPanel.current.querySelector<HTMLInputElement>('input[name="query"]')?.focus();
          }}
        >
          <Icon name="search" size={17} />Search
        </button>
      ) : null}
    </header> : null}

    {memorial && view === "planning" && !staffTools ? routeGuide ?? (
      <div className={"map-destination-card " + layout.routeHeading + " " + layout.featuredBanner} role="status">
        <h2>{!planningPlot ? "Gravesite location unavailable" : error || assetError
          ? "Gravesite guide unavailable"
          : "Loading gravesite guide…"}</h2>
        <p>{planningPlot && !error && !assetError
          ? "Finding the assigned plot on the park layout."
          : "Please ask cemetery staff for help. You can still explore the park map."}</p>
      </div>
    ) : null}

    <div className="public-map-workspace">
      <section aria-label="Interactive cemetery map" className="public-map-canvas-column">
        <nav aria-label="Map views" className={"phase-two-layer-options " + layout.viewSwitch}>
          {!staffTools ? (
            <div className={layout.viewTabs}>
              <Link
                className={"button button--" + (view === "planning" ? "primary" : "secondary")}
                aria-current={view === "planning" ? "page" : undefined}
                href={mapUrl("planning")}
                prefetch={false}
              >
                Park map
              </Link>
              <Link
                className={"button button--" + (view === "geographic" ? "primary" : "secondary")}
                aria-current={view === "geographic" ? "page" : undefined}
                href={mapUrl("geographic")}
                prefetch={false}
              >
                Gravesite &amp; directions
              </Link>
            </div>
          ) : <div className={layout.viewTabs} />}
          {view === "planning" ? (
            <button
              className={"button button--secondary " + layout.optionsButton}
              type="button"
              aria-label="Map options"
              title="Map options"
              aria-expanded={mapOptionsOpen}
              aria-controls="visitor-map-options"
              onClick={() => setMapOptionsOpen(open => !open)}
            >
              <Icon name="sliders" size={18} />
              <span>Map options</span>
            </button>
          ) : null}
        </nav>
        {view === "planning" && mapOptionsOpen ? <div id="visitor-map-options" className={layout.options}>
          <div className={layout.mapStyleGroup} role="radiogroup" aria-label="Map background style">
            <span className={layout.mapStyleLabel}>Map style</span>
            <div className={layout.mapStyleSwitch}>
              <button
                type="button"
                role="radio"
                aria-checked={mapStyle === "illustrated"}
                className={layout.mapStyleOption + (mapStyle === "illustrated" ? " " + layout.mapStyleOptionActive : "")}
                onClick={() => changeMapStyle("illustrated")}
              >
                <Icon name="map" size={14} />Park Map
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mapStyle === "satellite"}
                className={layout.mapStyleOption + (mapStyle === "satellite" ? " " + layout.mapStyleOptionActive : "")}
                onClick={() => changeMapStyle("satellite")}
              >
                <Icon name="layers" size={14} />Satellite
              </button>
            </div>
          </div>
          <label><input type="checkbox" checked={visible.paths} onChange={() => toggle("paths")} />Show pathways</label>
          <label><input type="checkbox" checked={showPlaces} onChange={event => setShowPlaces(event.target.checked)} />Show place labels</label>
          {mapStyle === "satellite" ? (
            <p className={layout.satelliteNote}>Satellite imagery (Esri) is for visual reference and may vary ~1–3 m from ground markers.</p>
          ) : null}
        </div> : null}
        <div ref={mapStage} tabIndex={assigned ? -1 : undefined} role={assigned ? "group" : undefined}
          aria-label={assigned ? "Assigned gravesite map" : undefined}
          className={
            "map-stage map-stage--leaflet public-map-stage"
            + (view === "geographic" ? " map-stage--geographic" : "")
            + (isFullscreen ? " " + layout.mapStageFullscreen : "")
            + (view === "planning" && !staffTools && activeRoute ? " " + layout.mapStageWithRoute : "")
            + (view === "planning" && !staffTools && activeRoute && !routeCardOpen ? " " + layout.mapStageWithPill : "")
          }>
          {view === "geographic" ? geography?.data ? <PhaseTwoGeographicMap
            key={[geography.data.releaseId, geography.data.scopeRevision, requestedId].join(":")}
            data={geography.data} burialId={requestedId || undefined} /> :
            <div className="map-loading">
              <div role="status"><strong>{geographicUnavailable.title}</strong>
                <p>{staffTools ? geography?.message || "Approved geographic information is required before GPS can be displayed." : geographicUnavailable.detail}</p></div>
              <Link className="button button--secondary" href={staffTools ? "/admin/cemetery-map" : mapUrl("planning")} prefetch={false}>Back to park map</Link>
            </div> : bundle ? <PlanningCanvas key={`${attempt}:${mapStyle}`} bundle={bundle} visible={visible} selected={selected} focusOnLoad={selected ?? assigned}
            mapStyle={mapStyle}
            onTileError={setSatelliteTileError}
            layoutRoute={activeRoute ? {
              path: activeRoute.path,
              approach: activeRoute.approach,
              startLabel: activeRoute.start.label,
              destinationLabel: memorial?.name,
              destinationReference: memorialPlot?.reference,
              isLiveGps: usingLiveGps,
              gpsPosition: gpsClassification?.status === "inside" ? gpsClassification.cadXY : null,
              gpsAccuracyMeters: gpsClassification?.status === "inside" ? gpsClassification.accuracyMeters : null,
            } : null}
            lotPopup={showLotPopup ? { preferredId: selected?.id === assigned?.id ? destination?.id : undefined, returnTo, staffMode: staffTools, onClose: () => setPopupClosed(true) } : undefined}
            places={showPlaces} trees={showTrees} protection={showProtection} details={showDetails} attempt={attempt}
            reviewMode={staffTools} actions={actions} onTogglePaths={() => toggle("paths")} onSelect={handleCanvasSelect} onReady={ready} onError={setAssetError} />
            : error ? null : <div className="map-loading" role="status"><span className="map-loading__spinner" />Loading cemetery layout…</div>}

          {view === "planning" && isFullscreen ? (
            <div className={layout.fullscreenBar}>
              <button
                type="button"
                className={layout.fullscreenExitButton}
                aria-label="Exit full screen map"
                onClick={() => setIsFullscreen(false)}
              >
                <Icon name="arrowLeft" size={16} />
                <span>Exit</span>
              </button>
              {memorial ? (
                <div className={layout.fullscreenDest}>
                  <strong>{memorial.name}</strong>
                  {memorialPlot ? <span>{memorialPlot.reference}</span> : null}
                </div>
              ) : (
                <div className={layout.fullscreenDest}>
                  <strong>{PARK_NAME}</strong>
                  <span>{staffTools ? "Staff Cemetery Map" : "Phase 2 Park Map"}</span>
                </div>
              )}
            </div>
          ) : null}

          {view === "planning" && bundle ? (
            <>
              <button
                type="button"
                className={layout.fullscreenToggle}
                aria-pressed={isFullscreen}
                aria-label={isFullscreen ? "Exit full screen map" : "Open full screen map"}
                onClick={() => setIsFullscreen(open => !open)}
              >
                <Icon name={isFullscreen ? "minimize" : "maximize"} size={15} />
                <span>{isFullscreen ? "Exit full screen" : "Full screen"}</span>
              </button>
              {isFullscreen ? (
                <button
                  type="button"
                  className={layout.fullscreenStyleToggle}
                  aria-pressed={mapStyle === "satellite"}
                  aria-label={mapStyle === "satellite" ? "Switch to illustrated Park Map" : "Switch to Satellite view"}
                  onClick={() => changeMapStyle(mapStyle === "satellite" ? "illustrated" : "satellite")}
                >
                  <Icon name={mapStyle === "satellite" ? "map" : "layers"} size={15} />
                  <span>{mapStyle === "satellite" ? "Park Map" : "Satellite"}</span>
                </button>
              ) : null}
            </>
          ) : null}

          {view === "planning" && mapStyle === "satellite" && satelliteTileError ? (
            <div className={layout.satelliteFallback} role="status">
              <span>Satellite imagery is temporarily unavailable.</span>
              <button type="button" className={layout.inlineAction} onClick={() => changeMapStyle("illustrated")}>
                Use Park Map
              </button>
            </div>
          ) : null}

          {view === "planning" && !staffTools && activeRoute ? (
            routeCardOpen ? (
              <aside aria-label="Route preview" className={layout.routePreviewCard + (isFullscreen ? " " + layout.routePreviewCardFullscreen : "")}>
                <div className={layout.routePreviewHeader}>
                  <span className={layout.routePreviewTitle}>
                    <Icon name="route" size={16} />
                    <strong>{guidanceActive ? (usingLiveGps ? "Live Guidance" : "Guided Route") : "Route Preview"}</strong>
                  </span>
                  <button
                    type="button"
                    className={layout.routePreviewClose}
                    aria-label="Minimize route preview"
                    aria-expanded={true}
                    title="Minimize route card (keeps route on map)"
                    onClick={() => setRouteCardOpen(false)}
                  >
                    <Icon name="chevronDown" size={15} />
                  </button>
                </div>
                <div className={layout.routePreviewMetric}>
                  <span className={layout.routePreviewWalkIcon}><Icon name="walk" size={20} /></span>
                  <div>
                    <strong>{formatRouteDistance(activeRoute.distanceMeters)}</strong>
                    <span>
                      {arrivedByGps
                        ? "Arrived near gravesite"
                        : usingLiveGps
                          ? `~${activeRoute.estimatedMinutes} min walk · ${preferPaved ? "Paved" : "Live GPS"}`
                          : preferPaved
                            ? "Paved / accessible route"
                            : "Shortest walking route"}
                    </span>
                  </div>
                </div>
                <div className={layout.routePreviewEndpoints}>
                  <div className={layout.routePreviewPoint}>
                    <span className={layout.originDot} aria-hidden="true" />
                    <span>
                      <strong>From:</strong> {usingLiveGps ? "Your current location" : activeRoute.start.id === "entrance" ? "Main Entrance" : activeRoute.start.label}
                    </span>
                  </div>
                  <div className={layout.routePreviewPoint}>
                    <span className={layout.destDot} aria-hidden="true"><Icon name="location" size={13} /></span>
                    <span>
                      <strong>To:</strong> {memorial ? memorial.name : "Selected plot"}
                      {memorialPlot ? <small>{memorialPlot.reference}</small> : null}
                    </span>
                  </div>
                </div>
                {guidanceActive && activeRoute.steps[0] ? (
                  <p className={layout.routePreviewNextStep} role="status">
                    {activeRoute.steps[0].instruction}
                  </p>
                ) : null}
                <button
                  type="button"
                  className={"button button--" + (guidanceActive ? "secondary" : "primary") + " " + layout.routePreviewCta}
                  onClick={toggleGuidance}
                >
                  <Icon name={guidanceActive ? "stop" : "play"} size={14} />
                  {guidanceActive ? "Stop Guidance" : "Start Guidance"}
                </button>
                <div className={layout.routePreviewSecondaryRow}>
                  <button
                    type="button"
                    className={layout.routePreviewSecondaryBtn}
                    onClick={() => actions.current?.fitRoute?.([...activeRoute.path, ...activeRoute.approach])}
                  >
                    <Icon name="map" size={13} />Fit route
                  </button>
                  <button
                    type="button"
                    className={layout.routePreviewSecondaryBtn}
                    onClick={() => { setShowRoute(false); setGuidanceActive(false); }}
                  >
                    <Icon name="close" size={13} />Clear route
                  </button>
                </div>
              </aside>
            ) : (
              <aside aria-label="Route preview" className={layout.routePreviewPill + (isFullscreen ? " " + layout.routePreviewPillFullscreen : "")}>
                <button
                  type="button"
                  className={layout.routePreviewPillToggle}
                  aria-expanded={false}
                  aria-label="Expand route preview"
                  onClick={() => setRouteCardOpen(true)}
                >
                  <span className={layout.routePreviewPillIcon} aria-hidden="true">
                    <Icon name={guidanceActive ? "navigation" : "walk"} size={16} />
                  </span>
                  <span className={layout.routePreviewPillText}>
                    <strong>
                      {arrivedByGps ? "Arrived" : formatRouteDistance(activeRoute.distanceMeters)}
                      {guidanceActive ? <em className={layout.pillLiveDot} aria-hidden="true" /> : null}
                    </strong>
                    <span>
                      {guidanceActive && activeRoute.steps[0]
                        ? activeRoute.steps[0].instruction
                        : memorial
                          ? `To ${memorial.name}`
                          : "Route details"}
                    </span>
                  </span>
                  <span className={layout.pillChevron} aria-hidden="true">
                    <Icon name="chevronUp" size={16} />
                  </span>
                </button>
                <div className={layout.pillActions}>
                  <button
                    type="button"
                    className={layout.pillFitBtn}
                    aria-label="Fit route on map"
                    title="Fit route on map"
                    onClick={() => actions.current?.fitRoute?.([...activeRoute.path, ...activeRoute.approach])}
                  >
                    <Icon name="target" size={15} />
                  </button>
                  <button
                    type="button"
                    className={"button button--" + (guidanceActive ? "secondary" : "primary") + " " + layout.pillGuideBtn}
                    onClick={toggleGuidance}
                  >
                    <Icon name={guidanceActive ? "stop" : "play"} size={13} />
                    <span>{guidanceActive ? "Stop" : "Start"}</span>
                  </button>
                </div>
              </aside>
            )
          ) : null}

          {view === "planning" && (error || assetError) ? <div className="map-layer-state map-layer-state--error" role="alert">
            <strong>Map unavailable</strong><span>{staffTools ? error || assetError : "The park map could not be loaded. Please try again."}</span>
            <button className="button button--secondary" type="button" onClick={retry}>Retry map</button>
          </div> : null}
          {view === "planning" ? <div className="map-stage-caption"><Icon name="map" size={16} /><span>{PARK_NAME} · Phase 2</span></div> : null}
        </div>
        <div className="public-map-context">
          {staffTools ? <div className="map-disclaimer" role="note"><Icon name="info" size={18} /><div>
            <strong>{view === "geographic" ? "Approved geographic coverage" : "CAD planning reference"}</strong>
            <span>{view === "geographic" ? "Only published geographic data is used for gravesites and GPS. The full CAD planning layout remains available in the other map view." : "Landscape materials and terrain are illustrative. Official plot matches and walking access require cemetery and field verification."}</span>
          </div></div> : null}
          <div aria-label="Map legend" className="map-legend">
            <span><i className="legend-dot legend-dot--reference" />Lawn plot</span>
            <span><i className="legend-line legend-line--road" />Road or path</span>
            <span><i className="legend-dot legend-dot--selected" />Selected plot</span>
            {!staffTools && view === "planning" ? <span><i className={"legend-line " + layout.legendRouteLine} />Route to gravesite</span> : null}
          </div>
        </div>
      </section>

      <aside aria-label="Map search and selected destination" className="public-map-sidebar">
        <details
          ref={searchPanel}
          className={layout.searchPanel + (hasFeaturedBanner && !staffTools ? " " + layout.searchPanelFlat : "")}
          open={staffTools || hasFeaturedBanner || panelOpen}
          onToggle={event => { if (!staffTools) setPanelOpen(event.currentTarget.open); }}
        >
          <summary>
            <Icon name={staffTools ? "map" : memorial || selected ? "walk" : "search"} size={18} />
            {staffTools ? "Staff Map Tools & Plot Details" : memorial ? "Memorial Details & Search" : selected ? "Walking Guide & Plot" : "Find a Loved One"}
            <Icon name="chevronDown" className={layout.panelChevron} size={16} />
          </summary>
          <div className={layout.panelContent}>

        {!memorial ? routeGuide : null}
        {memorial && memorialPlot && !hasFeaturedBanner ? (
          <section aria-label="Selected memorial" aria-live="polite" className={"map-destination-card " + layout.memorialCard}
            data-selected-candidate={view === "planning" ? selected?.id ?? "" : ""}>
            <div className={layout.memorialIdentity}>
              <span className={layout.memorialIcon}><Icon name="tree" size={20} /></span>
              <div><h2>{memorial.name}</h2>{memorial.dates ? <p>{memorial.dates}</p> : null}</div>
            </div>
            <dl className={layout.memorialPlot}>
              <div><dt>Garden</dt><dd>{memorialPlot.garden}</dd></div>
              <div><dt>Gravesite</dt><dd>{memorialPlot.reference}</dd></div>
            </dl>
            {assigned ? <p className={layout.memorialStatus}><Icon name="location" size={16} />Assigned on the park layout</p> : null}
            {view === "geographic" ? <p>{geography?.data?.target
              ? "The highlighted plot is the gravesite recorded for this memorial."
              : "This memorial’s map location is unavailable. Please ask cemetery staff for assistance."}</p> : null}
            {view === "geographic" && !(geography?.data?.target && geography.data.accessPoint && geography.data.navigationPolicy)
              ? <p>Walking directions are unavailable for this gravesite.</p> : null}
            <div className={layout.memorialButtons}>
              {assigned ? <button type="button" className="button button--primary" onClick={() => {
                select(assigned);
                if (window.matchMedia("(max-width: 959px)").matches) {
                  mapStage.current?.scrollIntoView({ block: "start" });
                  mapStage.current?.focus({ preventScroll: true });
                }
              }}><Icon name="target" size={16} />Focus on Plot</button>
                : view === "geographic" && geography?.data?.target && geography.data.accessPoint && geography.data.navigationPolicy
                  ? <a className="button button--primary" href="#walking-guidance">Get Directions</a>
                  : view === "planning" && !planningFallback && !planningPlot
                    ? <Link className="button button--secondary" href={mapUrl("geographic")}>Check Map</Link> : null}
              <Link className="button button--secondary" href={memorialProfileHref}>View Memorial</Link>
            </div>
          </section>
        ) : !memorial && (staffTools || selected) ? <section aria-live="polite" className="map-destination-card" data-selected-candidate={view === "planning" ? selected?.id ?? "" : ""}>
          <div className="map-panel-heading"><div><p>Selected plot</p><h2>{view === "planning" && selected
            ? staffTools ? selected.id : featureLayer(selected) === "lawn" ? "Lawn plot" : "Estate lot"
            : "No plot selected"}</h2></div>
            <span className="map-destination-status map-destination-status--unavailable"><Icon name="info" size={14} />{staffTools ? "CAD reference" : "Park map"}</span>
          </div>
          {selected && view === "planning" ? <>
            {staffTools ? <><dl><div><dt>Category</dt><dd>{featureLayer(selected) === "lawn" ? "Lawn plot" : "Estate lot"}</dd></div>
              <div><dt>Source reference</dt><dd>{selected.properties.instance_path}</dd></div></dl>
            {selected.review?.overlapReviewFids.length ? <p>This outline has an overlap review. Each source candidate remains separately selectable.</p> : null}
            <p>Click a plot to inspect assigned memorials or review CAD coordinate references.</p>
            {bundle?.coordinates.entries[selected.id] ? <PlotCoordinateDetails reference={bundle.coordinates.entries[selected.id]} /> : null}
            <button type="button" className="button button--secondary" onClick={() => setPopupClosed(false)}>Show assigned memorials</button></> :
              <button type="button" className="button button--secondary" onClick={() => setPopupClosed(false)}>Show memorial details</button>}
            <button type="button" className="button button--secondary" onClick={() => select(null)}>Clear selection</button>
          </> : <p>{staffTools ? "Select any plot on the Phase 2 map to inspect assigned memorials, coordinates, and CAD references." : "Select a plot to explore the park, or search for a memorial."}</p>}
          {staffTools ? (
            <p>
              <Link href="/admin/burial-records">Open Deceased &amp; Interments</Link>
              {" · "}
              <Link href="/admin/plot-management">Open Plot Management</Link>
            </p>
          ) : (
            <p><Link href="/search">Search memorial records</Link></p>
          )}
        </section> : null}

        {!staffTools ? <details
          ref={memorialSearchPanel}
          className={layout.nestedSearch}
          open={Boolean(memorialQuery || records.length || recordsError) || (!memorial && !selected)}
        >
          <summary>
            <Icon name="search" size={16} />
            {memorial || selected ? "Search Another Memorial" : "Find a Loved One"}
            <Icon name="chevronDown" className={layout.panelChevron} size={16} />
          </summary>
        <section className="map-search-panel">
          <div className="map-panel-heading"><div><h2>Find a Loved One</h2></div><Icon name="search" size={21} /></div>
          <form action="/map" className="map-search-form">
            <input type="hidden" name="view" value={view} />
            <label><span>Search by Name or Plot Number</span><span className="map-search-control">
              <Icon name="search" size={18} /><input autoComplete="off" defaultValue={memorialQuery} enterKeyHint="search"
                maxLength={160} name="query" placeholder="Name or plot number…" />
            </span></label>
            <label><span>Garden</span><span className="map-search-control"><Icon name="map" size={18} />
              <select aria-describedby={gardenListUnavailable ? "map-garden-status" : undefined} defaultValue={section} name="section"><option value="all">All gardens</option>
                {section !== "all" && !gardens.includes(section) ? <option value={section}>{section}</option> : null}
                {gardens.map(garden => <option key={garden} value={garden}>{garden}</option>)}
              </select>
            </span></label>
            <button className="button button--primary" type="submit"><Icon name="search" size={17} />Find on map</button>
          </form>
          {gardenListUnavailable ? <p id="map-garden-status" className="map-result-summary" role="status">The garden list is temporarily unavailable. You can still search by name or plot number.</p> : null}
          <p aria-live="polite" className="map-result-summary" role="status">
            {recordsError || (total ? total + " matching memorial records." : memorialQuery || section !== "all" ? "No matching memorial records. Try another name, plot number, or garden." : "Enter a name or plot number to find a memorial.")}
          </p>
          {records.length ? <div className="map-record-list" aria-label="Public records on this page">
            {records.map(record => <Link key={record.id} href={mapUrl("geographic", record.id)} prefetch={false}
              className={"map-record-option" + (destination?.id === record.id ? " map-record-option--selected" : "")}
              aria-current={destination?.id === record.id ? "page" : undefined}>
              <span className="map-record-option__marker"><Icon name="records" size={17} /></span>
              <span>
                <strong>{record.name}</strong>
                <small>Gravesite Reference: {visitorPlotDetails(record).reference}</small>
              </span>
            </Link>)}
          </div> : null}
          {total > pageSize ? <nav aria-label="Map record pages" className="map-pagination">
            {page > 1 ? <Link href={pageUrl(page - 1)}>Previous</Link> : <span aria-disabled="true">Previous</span>}
            <strong>Page {page}</strong>
            {page * pageSize < total ? <Link href={pageUrl(page + 1)}>Next</Link> : <span aria-disabled="true">Next</span>}
          </nav> : null}
        </section>
        </details> : null}

            {view === "planning" ? (staffTools ? <section className="map-record-panel">
              <details><summary>Find a CAD candidate</summary>          <div className="map-panel-heading"><div><p>Find a plot</p><h2>CAD plot reference</h2></div><Icon name="search" size={21} /></div>
                <form className="map-search-form phase-two-candidate-search" onSubmit={search}>
                  <label><span>CAD reference or candidate ID</span><span className="map-search-control">
                    <Icon name="search" size={18} /><input aria-label="CAD reference or candidate ID" autoComplete="off"
                      enterKeyHint="search" maxLength={160} placeholder="Reference or candidate ID…" value={query} onChange={event => setQuery(event.target.value)} />
                  </span></label>
                  <button className="button button--primary" type="submit" disabled={!matches.length}><Icon name="search" size={17} />Find on map</button>
                </form>
                <p aria-live="polite" className="map-result-summary" role="status">
                  {bundle ? term ? matches.length + " matching CAD candidates." : "4,494 selectable CAD candidates." : "Loading plot references…"}
                </p>
                {term && matches.length ? <div className="map-record-list">
                  {matches.slice(0, 8).map(feature => <button className={"map-record-option" + (selected?.id === feature.id ? " map-record-option--selected" : "")}
                    key={feature.id} type="button" aria-pressed={selected?.id === feature.id} onClick={() => select(feature)}>
                    <span className="map-record-option__marker"><Icon name="map" size={17} /></span>
                    <span><strong>{feature.id}</strong><small>{feature.properties.instance_path}</small></span>
                  </button>)}
                </div> : null}</details>
                <details><summary>Map layers</summary>
                  <div className="phase-two-layer-options">
                    {layerDefinitions.map(layer => <label key={layer.key}><input type="checkbox" checked={visible[layer.key]} onChange={() => toggle(layer.key)} />{layer.name}</label>)}
                    <label><input type="checkbox" checked={showDetails} onChange={event => setShowDetails(event.target.checked)} />CAD buildings, parking &amp; site details</label>
                    <label><input type="checkbox" checked={showPlaces} onChange={event => setShowPlaces(event.target.checked)} />Garden, section &amp; landmark labels</label>
                    <label><input type="checkbox" checked={showTrees} onChange={event => setShowTrees(event.target.checked)} />Illustrative exterior trees</label>
                    <label><input type="checkbox" checked={showProtection} onChange={event => setShowProtection(event.target.checked)} />Protection &amp; edge concepts</label>
                    <label><input type="checkbox" checked={visible.overlaps} onChange={() => toggle("overlaps")} />Overlap review</label>
                  </div>
                </details>
              <details><summary>Gardens &amp; amenities</summary><div className="phase-two-layer-options">
                {bundle?.places.landmarks.map(place => <button key={place.id} type="button" className="button button--secondary"
                  onClick={() => { setShowPlaces(true); actions.current?.place(place.cadXY); }}>{landmarkName(place.name)} · CAD {place.id}</button>)}
                {mapAmenities.map(place => place ? <button key={place.id} type="button" className="button button--secondary"
                  onClick={() => { setShowPlaces(true); actions.current?.place(place.cadXY); }}>{place.name}</button> : null)}
              </div></details>
            </section> : (
              <details className={layout.nestedSearch}>
                <summary>
                  <Icon name="tree" size={16} />
                  Gardens &amp; amenities
                  <Icon name="chevronDown" className={layout.panelChevron} size={16} />
                </summary>
                <div className={layout.amenitiesPanel}>
                  <div className="phase-two-layer-options">
                    {bundle?.places.landmarks.map(place => <button key={place.id} type="button" className="button button--secondary"
                      onClick={() => { setShowPlaces(true); actions.current?.place(place.cadXY); }}>{landmarkName(place.name)}</button>)}
                    {mapAmenities.map(place => place ? <button key={place.id} type="button" className="button button--secondary"
                      onClick={() => { setShowPlaces(true); actions.current?.place(place.cadXY); }}>{place.name}</button> : null)}
                  </div>
                </div>
              </details>
            )) : null}
          </div>
        </details>
      </aside>
    </div>
  </div>;
}
