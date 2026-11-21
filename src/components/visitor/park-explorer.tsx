"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui/icons";
import { PARK_NAME } from "@/lib/park-details";
import { usablePosition, type GpsPosition } from "@/lib/navigation-geo";
import type { PhaseTwoGeography } from "@/lib/phase2-geographic";
import { featureLayer, initialVisibility, loadPlanningBundle, type CadFeature, type PlanningBundle } from "@/lib/phase2-planning";
import { planningPlaces, publishedPlaces, type ParkCategory, type ParkPlace } from "@/lib/park-explorer-features";
import type { PlanningMapActions } from "./phase2-planning-canvas";
import styles from "./park-explorer.module.css";

const PlanningCanvas = dynamic(() => import("./phase2-planning-canvas").then(module => module.PhaseTwoPlanningCanvas), { ssr: false });
const GeographicCanvas = dynamic(() => import("./phase2-geographic-canvas"), { ssr: false });
const categories: { key: ParkCategory; title: string; icon: IconName }[] = [
  { key: "gardens", title: "Gardens & sections", icon: "tree" },
  { key: "landmarks", title: "Landmarks", icon: "location" },
  { key: "pathways", title: "Pathways", icon: "walk" },
];

export function ParkExplorer({ geography, startPublished }: { geography: PhaseTwoGeography | null; startPublished: boolean }) {
  const [bundle, setBundle] = useState<PlanningBundle | null>(null);
  const [published, setPublished] = useState(startPublished && Boolean(geography));
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState(false);
  const [assetError, setAssetError] = useState(false);
  const [category, setCategory] = useState<ParkCategory | "all">("all");
  const [filter, setFilter] = useState("");
  const [pick, setPick] = useState<ParkPlace | null>(null);
  const [plot, setPlot] = useState<CadFeature | null>(null);
  const [plotPopupOpen, setPlotPopupOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [paths, setPaths] = useState(true);
  const [labels, setLabels] = useState(true);
  const [plots, setPlots] = useState(true);
  const [trees, setTrees] = useState(true);
  const [position, setPosition] = useState<GpsPosition | null>(null);
  const [locationStatus, setLocationStatus] = useState(startPublished && !geography ? "Published geographic coverage is unavailable." : "");
  const [mapRequest, setMapRequest] = useState({ count: 0, kind: "park" as "park" | "place" | "location" });
  const requestId = useRef(0);
  const actions = useRef<PlanningMapActions | null>(null);
  const layerPanel = useRef<HTMLDetailsElement>(null);
  const mapPanel = useRef<HTMLElement>(null);
  const selectedHeading = useRef<HTMLHeadingElement>(null);
  const listOpener = useRef<HTMLElement | null>(null);
  const ready = useCallback((value: PlanningMapActions) => { actions.current = value; }, []);

  useEffect(() => {
    if (published || bundle) return;
    const controller = new AbortController();
    loadPlanningBundle(controller.signal).then(value => {
      if (!controller.signal.aborted) setBundle(value);
    }).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, [published, bundle, attempt]);

  const places = useMemo(() => published && geography ? publishedPlaces(geography) : bundle ? planningPlaces(bundle) : [], [bundle, published, geography]);
  const visible = useMemo(() => ({ ...initialVisibility, paths, lawn: plots, estates: plots }), [paths, plots]);
  const filtered = places.filter(place => place.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const mapReady = published ? Boolean(geography) : Boolean(bundle);
  const selectedName = pick?.name ?? (plot ? featureLayer(plot) === "lawn" ? "Lawn plot outline" : "Estate lot outline" : "");
  const requestMap = (kind: typeof mapRequest.kind) => setMapRequest(current => ({ count: current.count + 1, kind }));

  function selectPlace(place: ParkPlace | null) {
    setPlot(null);
    setPlotPopupOpen(false);
    setPick(place);
  }

  function closeSelection() {
    setPick(null);
    setPlot(null);
    setPlotPopupOpen(false);
    if (listOpener.current?.isConnected) listOpener.current.focus();
    listOpener.current = null;
  }

  function chooseSource(usePublished: boolean) {
    requestId.current++;
    listOpener.current = null;
    actions.current = null;
    setPosition(null);
    setLocationStatus("");
    setPick(null);
    setPlot(null);
    setPlotPopupOpen(false);
    setPublished(usePublished);
  }

  function focusSelection() {
    mapPanel.current?.scrollIntoView({ block: "nearest" });
    if (pick) {
      if (pick.category === "pathways") setPaths(true);
      else setLabels(true);
      if (published) requestMap("place");
      else actions.current?.focusPlaces(pick.points);
    } else if (plot) {
      setPlots(true);
      actions.current?.focus(plot);
    }
  }

  function fitPark(clear = false) {
    if (clear) closeSelection();
    if (published) requestMap("park");
    else actions.current?.reset();
  }

  function locate() {
    if (!published || !geography) return;
    if (!navigator.geolocation) {
      setLocationStatus("This browser cannot provide device location.");
      return;
    }
    const id = ++requestId.current;
    setPosition(null);
    setLocationStatus("Requesting your location…");
    navigator.geolocation.getCurrentPosition(result => {
      if (requestId.current !== id) return;
      const { longitude, latitude, accuracy } = result.coords;
      const fix = { longitude, latitude, accuracy, timestamp: result.timestamp };
      if (!usablePosition(fix)) {
        setLocationStatus("A recent device location is unavailable. Try again.");
        return;
      }
      setPosition(fix);
      setLocationStatus("Last reported device location shown.");
      requestMap("location");
    }, reason => {
      if (requestId.current !== id) return;
      setLocationStatus(reason.code === 1 ? "Location permission was denied. Allow it in your browser and try again." : "Device location is unavailable. Try again.");
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
  }

  return <article className={styles.explorer} data-source={published ? "published" : "layout"}
    data-collapsed={collapsed} data-expanded={expanded} onKeyDown={event => {
      if (event.key !== "Escape") return;
      if (plotPopupOpen) setPlotPopupOpen(false);
      else if (selectedName) closeSelection();
    }}>
    <header className={styles.heading}>
      <Icon name="navigation" />
      <div><h1>Explore the Park</h1><p>{PARK_NAME}</p></div>
      <button type="button" className={styles.sidebarToggle} aria-label={collapsed ? "Expand Park Explorer" : "Collapse Park Explorer"}
        aria-expanded={!collapsed} aria-controls="park-explorer" onClick={() => setCollapsed(value => !value)}><Icon name="panelLeft" size={21} /></button>
    </header>
    <nav className={styles.categories} aria-label="Park categories">
      <button type="button" aria-pressed={category === "all"} onClick={() => { setCategory("all"); setFilter(""); fitPark(true); }}>All areas</button>
      {categories.map(item => <button key={item.key} type="button" aria-pressed={category === item.key} onClick={() => {
        setCategory(item.key); setExpanded(true);
      }}><Icon name={item.icon} size={15} />{item.title}</button>)}
    </nav>
    <section ref={mapPanel} className={styles.stage} aria-label="Interactive park map">
      <div className={styles.mapSource}><Icon name="map" size={16} />{published ? "Published coverage" : "Park overview"}</div>
      {published && geography ? <GeographicCanvas key={geography.releaseId} data={geography} position={position}
        explorer={{ plots, paths, labels, selectedId: pick?.id, places, request: mapRequest, onSelect: selectPlace }} />
        : bundle ? <PlanningCanvas key={attempt} bundle={bundle} visible={visible} selected={plots ? plot : null}
          places={false} trees={trees} protection details attempt={attempt} onReady={ready}
          actions={actions} onTogglePaths={() => setPaths(value => !value)} onError={() => setAssetError(true)}
          lotPopup={plots && plot && plotPopupOpen ? { onClose: () => setPlotPopupOpen(false) } : undefined}
          onSelect={feature => { if (feature) { setPick(null); setPlot(feature); setPlotPopupOpen(true); } }}
          explorer={{ places, showLabels: labels, showPaths: paths, category, selectedId: pick?.id, onSelect: selectPlace }} />
        : <div className={styles.mapMessage} role={error ? "alert" : "status"}>{error ? "Park map data is temporarily unavailable." : "Loading the park map…"}</div>}
      {!published && (error || assetError) ? <div className={styles.retry} role="alert">
        {assetError ? "Some map layers could not load." : "The local map could not be loaded."}
        <button type="button" onClick={() => { setBundle(null); setError(false); setAssetError(false); setAttempt(value => value + 1); }}>Retry map</button>
      </div> : null}
      <div className={styles.mapControls}>
        {published ? <button type="button" aria-label="Use my location" title="Use my location" onClick={locate}><Icon name="location" size={21} /></button> : null}
        <button type="button" aria-label="Recenter map" title="Recenter map" disabled={!mapReady} onClick={() => {
          if (published && position) requestMap("location"); else fitPark();
        }}><Icon name="target" size={21} /></button>
        <button type="button" aria-label="Fit to park" title="Fit to park" disabled={!mapReady} onClick={() => { fitPark(true); setCategory("all"); setFilter(""); }}><Icon name="map" size={21} /></button>
        <button type="button" aria-label="Map layers" title="Map layers" aria-controls="park-layers" onClick={() => {
          setExpanded(true); setCollapsed(false);
          if (layerPanel.current) layerPanel.current.open = true;
          requestAnimationFrame(() => { layerPanel.current?.scrollIntoView({ block: "nearest" }); layerPanel.current?.querySelector("summary")?.focus(); });
        }}><Icon name="layers" size={20} /></button>
      </div>
      {locationStatus ? <p className={styles.location} role="status">{locationStatus}</p> : null}
    </section>

    {selectedName && (!plot || !plotPopupOpen) ? <section className={styles.selection} aria-labelledby="park-selection-name">
      <div className={styles.selectionTitle}>
        <span><Icon name={pick?.category === "gardens" ? "tree" : "location"} size={21} /></span>
        <div><p>{pick?.kind ?? "Plot outline"}</p><h2 id="park-selection-name" tabIndex={-1} ref={selectedHeading}>{selectedName}</h2></div>
        <button type="button" aria-label="Close details" title="Close details" onClick={closeSelection}><Icon name="close" size={18} /></button>
      </div>
      <p>{plot ? "Shown on the park layout." : published
        ? "Shown in the published park coverage."
        : `Shown in the park layout${pick && pick.points.length > 1 ? " at " + pick.points.length + " marked locations" : ""}.`}</p>
      <div className={styles.selectionActions}>
        {plot && plots ? <button type="button" onClick={() => setPlotPopupOpen(true)}>Show memorial details</button> : null}
        <button type="button" className={styles.primary} onClick={focusSelection}><Icon name="target" size={18} />Focus on map</button>
        <button type="button" onClick={closeSelection}>Close details</button>
      </div>
    </section> : null}

    <aside className={styles.sidebar} id="park-explorer" data-expanded={expanded} aria-label="Park Explorer">
      <button className={styles.sheetToggle} type="button" aria-expanded={expanded} aria-controls="park-explorer-content"
        onClick={() => setExpanded(value => !value)}><span><strong>Park Explorer</strong><small>{category === "all" ? "Gardens, sections and landmarks" : categories.find(item => item.key === category)?.title}</small></span>
        <Icon name="chevronDown" size={20} /></button>
      <div className={styles.sidebarContent} id="park-explorer-content">
        <label className={styles.search}><Icon name="search" size={18} /><input type="search" aria-label="Search park places" placeholder="Search places…" value={filter}
          onChange={event => setFilter(event.target.value)} /></label>
        {!filtered.some(place => category === "all" || place.category === category) ?
          <p className={styles.empty}>{mapReady ? "No places match this view." : "Park places appear when the map is ready."}</p> : null}
        {categories.filter(item => category === "all" || item.key === category).map(item => {
          const entries = filtered.filter(place => place.category === item.key);
          return entries.length ? <section key={item.key} className={styles.list} aria-label={item.title}>
            <h2>{item.title}</h2>
            {entries.map(place => <button key={place.id} type="button" aria-pressed={pick?.id === place.id} onClick={event => {
              listOpener.current = event.currentTarget;
              selectPlace(place);
              requestAnimationFrame(() => selectedHeading.current?.focus({ preventScroll: true }));
            }}><Icon name={item.icon} size={17} /><span>{place.name}</span><Icon name="chevronRight" size={16} /></button>)}
          </section> : null;
        })}
        <details className={styles.layers} ref={layerPanel} id="park-layers" open>
          <summary><Icon name="layers" size={17} />Map layers<Icon name="chevronDown" size={16} /></summary>
          <label><span>Pathways</span><input type="checkbox" checked={paths} onChange={event => setPaths(event.target.checked)} /></label>
          <label><span>{published ? "Landmark markers" : "Place markers"}</span><input type="checkbox" checked={labels} onChange={event => setLabels(event.target.checked)} /></label>
          <label><span>Plot outlines</span><input type="checkbox" checked={plots} onChange={event => setPlots(event.target.checked)} /></label>
          {!published ? <label><span>Tree canopy</span><input type="checkbox" checked={trees} onChange={event => setTrees(event.target.checked)} /></label> : null}
        </details>
        {geography ? <div className={styles.sources} aria-label="Map sources">
          <button type="button" aria-pressed={!published} onClick={() => { if (published) chooseSource(false); }}>Park layout</button>
          <button type="button" aria-pressed={published} onClick={() => { if (!published) chooseSource(true); }}>Published map</button>
        </div> : null}
        <Link href="/search" className={styles.memorialSearch}>Find a memorial <Icon name="arrowUpRight" size={15} /></Link>
      </div>
    </aside>
  </article>;
}
