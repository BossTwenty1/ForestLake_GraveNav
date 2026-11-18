"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { visitorPlotDetails } from "@/lib/visitor-presentation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/icons";
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
  view?: "planning" | "geographic";
  destination?: PublicBurialRecord | null;
  geography?: PhaseTwoResult | null;
  requestedId?: string;
}
export function MapExplorer({
  staffTools = false,
  showHeading = true, gardens = [], records = [], query: memorialQuery = "", section = "all",
  page = 1, total = 0, pageSize = 20, recordsError = "",
  view = "planning", destination = null, geography = null, requestedId = "",
}: MapExplorerProps) {
  const [bundle, setBundle] = useState<PlanningBundle | null>(null);
  const cachedBundle = useRef<PlanningBundle | null>(null);
  const [error, setError] = useState("");
  const [assetError, setAssetError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(initialVisibility);
  const [selected, setSelected] = useState<CadFeature | null>(null);
  const [query, setQuery] = useState("");
  const memorial = view === "geographic" || !selected ? destination : null;
  const mapUrl = (mode: "planning" | "geographic", id = requestedId) => "/map?" + new URLSearchParams({
    query: memorialQuery, section, page: String(page), view: mode, ...(id ? { id } : {}),
  });
  const pageUrl = (next: number) => "/map?" + new URLSearchParams({ query: memorialQuery, section, page: String(next) });
  const [showPlaces, setShowPlaces] = useState(true);
  const [showTrees, setShowTrees] = useState(true);
  const [showProtection, setShowProtection] = useState(true);
  const [showDetails, setShowDetails] = useState(true);
  const [panelOpen, setPanelOpen] = useState(Boolean(memorialQuery || destination || records.length || recordsError));
  const [mapOptionsOpen, setMapOptionsOpen] = useState(false);
  const searchPanel = useRef<HTMLDetailsElement | null>(null);
  const actions = useRef<PlanningMapActions | null>(null);
  const ready = useCallback((next: PlanningMapActions) => { actions.current = next; }, []);

  useEffect(() => {
    if (staffTools) return;
    const desktop = window.matchMedia("(min-width: 960px)");
    const expand = () => { if (desktop.matches) setPanelOpen(true); };
    expand();
    desktop.addEventListener("change", expand);
    return () => desktop.removeEventListener("change", expand);
  }, [staffTools]);

  useEffect(() => {
    if (view !== "planning" || cachedBundle.current) return;
    const controller = new AbortController();
    loadPlanningBundle(controller.signal).then(value => {
      if (!controller.signal.aborted) { cachedBundle.current = value; setBundle(value); }
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "The map could not be loaded.");
    });
    return () => { controller.abort(); actions.current = null; };
  }, [attempt, view]);

  const candidates = bundle ? [...bundle.data.layers.lawn, ...bundle.data.layers.estates] : [];
  const term = query.trim().toUpperCase();
  const matches = term ? candidates.filter(feature => feature.id.toUpperCase().includes(term) ||
    feature.properties.instance_path?.toUpperCase().includes(term)) : [];
  const mapAmenities = ["Parking", "Walkway"].map(name => bundle?.details.labels.find(label => label.name === name));

  function retry() {
    cachedBundle.current = null;
    setBundle(null);
    setError("");
    setAssetError("");
    setSelected(null);
    setAttempt(current => current + 1);
  }
  function select(feature: CadFeature | null) {
    if (feature) {
      setVisible(current => ({ ...current, [featureLayer(feature)]: true }));
      actions.current?.focus(feature);
    }
    setSelected(feature);
    if (feature) setPanelOpen(true);
  }
  function toggle(key: LayerKey) {
    if (selected && featureLayer(selected) === key && visible[key]) setSelected(null);
    setVisible(current => ({ ...current, [key]: !current[key] }));
  }
  function search(event: FormEvent) {
    event.preventDefault();
    if (matches.length) select(matches.find(feature => feature.id.toUpperCase() === term ||
      feature.properties.instance_path?.toUpperCase() === term) ?? matches[0]);
  }

  return <div className={"public-map-experience" + (staffTools ? "" : " " + layout.experience)} onKeyDown={event => { if (event.key === "Escape") setSelected(null); }}>
    {showHeading ? <header className="public-map-heading">
      <div><h1>Cemetery Map</h1>
        <span>{view === "geographic" ? "View a gravesite location and check available walking directions." : "Explore the park, find gardens and amenities, or search for a memorial."}</span>
      </div>
      <span className="map-source-badge"><Icon name="map" size={15} />Forest Lake · Phase 2</span>
      {!staffTools ? <button className={"button button--secondary " + layout.mobileSearch} type="button" onClick={() => {
        setPanelOpen(true); searchPanel.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }}><Icon name="search" size={17} />Find a Loved One</button> : null}
    </header> : null}

    <div className="public-map-workspace">
      <section aria-label="Interactive cemetery map" className="public-map-canvas-column">
        <nav aria-label="Map views" className={"phase-two-layer-options " + layout.viewSwitch}>
          <Link className={"button button--" + (view === "planning" ? "primary" : "secondary")} aria-current={view === "planning" ? "page" : undefined} href={mapUrl("planning")} prefetch={false}>Park map</Link>
          <Link className={"button button--" + (view === "geographic" ? "primary" : "secondary")} aria-current={view === "geographic" ? "page" : undefined} href={mapUrl("geographic")} prefetch={false}>Gravesite &amp; directions</Link>
          {!staffTools && view === "planning" ? <button className={"button button--secondary " + layout.optionsButton} type="button" aria-expanded={mapOptionsOpen}
            aria-controls="visitor-map-options" onClick={() => setMapOptionsOpen(open => !open)}>Map options</button> : null}
        </nav>
        {!staffTools && view === "planning" && mapOptionsOpen ? <div id="visitor-map-options" className={layout.options}>
          <label><input type="checkbox" checked={visible.paths} onChange={() => toggle("paths")} />Show pathways</label>
          <label><input type="checkbox" checked={showPlaces} onChange={event => setShowPlaces(event.target.checked)} />Show place labels</label>
        </div> : null}
        <div className={"map-stage map-stage--leaflet public-map-stage" + (view === "geographic" ? " map-stage--geographic" : "")}>
          {view === "geographic" ? geography?.data ? <PhaseTwoGeographicMap
            key={[geography.data.releaseId, geography.data.scopeRevision, requestedId].join(":")}
            data={geography.data} burialId={requestedId || undefined} /> :
            <div className="map-loading" role="status"><strong>Gravesite location unavailable</strong>
              <span>{staffTools ? geography?.message || "Approved geographic information is required before GPS can be displayed." : "Please ask cemetery staff for help locating this gravesite. You can still explore the park map."}</span>
              <Link className="button button--secondary" href={mapUrl("planning")} prefetch={false}>Back to park map</Link>
            </div> : bundle ? <PlanningCanvas key={attempt} bundle={bundle} visible={visible} selected={selected}
            places={showPlaces} trees={showTrees} protection={showProtection} details={showDetails} attempt={attempt}
            reviewMode={staffTools} actions={actions} onTogglePaths={() => toggle("paths")} onSelect={select} onReady={ready} onError={setAssetError} />
            : error ? null : <div className="map-loading" role="status"><span className="map-loading__spinner" />Loading cemetery layout…</div>}
          {view === "planning" && (error || assetError) ? <div className="map-layer-state map-layer-state--error" role="alert">
            <strong>Map unavailable</strong><span>{staffTools ? error || assetError : "The park map could not be loaded. Please try again."}</span>
            <button className="button button--secondary" type="button" onClick={retry}>Retry map</button>
          </div> : null}
          {view === "planning" ? <div className="map-stage-caption"><Icon name="map" size={16} /><span>Forest Lake Phase 2</span></div> : null}
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
          </div>
        </div>
      </section>

      <aside aria-label="Map search and selected destination" className="public-map-sidebar">
        <details ref={searchPanel} className={layout.searchPanel} open={staffTools || panelOpen}
          onToggle={event => { if (!staffTools) setPanelOpen(event.currentTarget.open); }}>
          <summary><Icon name="search" size={18} />{memorial ? "Gravesite Details" : selected ? "Selected plot" : "Find a Loved One"}</summary>
          <div className={layout.panelContent}>
        <section className="map-search-panel">
          <div className="map-panel-heading"><div><h2>Find a Loved One</h2></div><Icon name="search" size={21} /></div>
          <form action="/map" className="map-search-form">
            <input type="hidden" name="view" value={view} />
            <label><span>Search by Name or Plot Number</span><span className="map-search-control">
              <Icon name="search" size={18} /><input autoComplete="off" defaultValue={memorialQuery} enterKeyHint="search"
                maxLength={160} name="query" placeholder="Name or plot number…" />
            </span></label>
            <label><span>Garden</span><span className="map-search-control"><Icon name="map" size={18} />
              <select defaultValue={section} name="section"><option value="all">All gardens</option>
                {gardens.map(garden => <option key={garden} value={garden}>{garden}</option>)}
              </select>
            </span></label>
            <button className="button button--primary" type="submit"><Icon name="search" size={17} />Find on map</button>
          </form>
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

        {staffTools || memorial || selected ? <section aria-live="polite" className="map-destination-card" data-selected-candidate={view === "planning" ? selected?.id ?? "" : ""}>
          <div className="map-panel-heading"><div><p>{memorial ? "Selected memorial" : "Selected plot"}</p><h2>{memorial ? visitorPlotDetails(memorial).reference : (view === "planning" && selected ? staffTools ? selected.id : featureLayer(selected) === "lawn" ? "Lawn plot" : "Estate lot" : "No plot selected")}</h2></div>
            <span className="map-destination-status map-destination-status--unavailable"><Icon name="info" size={14} />{memorial ? "Record details" : staffTools ? "CAD reference" : "Park map"}</span>
          </div>
          {memorial ? <>
            <div className="map-destination-person"><span className="map-destination-person__icon"><Icon name="tree" size={22} /></span>
              <div><strong>{memorial.name}</strong><span>{memorial.dates}</span></div>
            </div>
            <dl>
              <div><dt>Garden</dt><dd>{visitorPlotDetails(memorial).garden}</dd></div>
              <div><dt>Block</dt><dd>{visitorPlotDetails(memorial).block}</dd></div>
              <div><dt>Lot</dt><dd>{visitorPlotDetails(memorial).lot}</dd></div>
            </dl>
            <p>{geography?.data?.target ? "The highlighted plot is the gravesite recorded for this memorial." : "This memorial’s map location is unavailable. Please ask cemetery staff for assistance."}</p>
            {geography?.data?.target && geography.data.accessPoint && geography.data.navigationPolicy ? <a className="button button--primary button--lg" href="#walking-guidance">Get Directions</a> :
              <p>Walking directions are not available for this gravesite yet.</p>}
            <Link className="button button--secondary button--lg" href={"/gravesite?id=" + encodeURIComponent(memorial.id)}>View Memorial</Link>
          </> : selected && view === "planning" ? <>
            {staffTools ? <><dl><div><dt>Category</dt><dd>{featureLayer(selected) === "lawn" ? "Lawn plot" : "Estate lot"}</dd></div>
              <div><dt>Source reference</dt><dd>{selected.properties.instance_path}</dd></div></dl>
            {selected.review?.overlapReviewFids.length ? <p>This outline has an overlap review. Each source candidate remains separately selectable.</p> : null}
            <p>Official gravesite and burial correspondence awaits verification.</p>
            {bundle?.coordinates.entries[selected.id] ? <PlotCoordinateDetails reference={bundle.coordinates.entries[selected.id]} /> : null}</> :
              <p>This map selection has no confirmed memorial record. Search for a loved one to view their recorded gravesite.</p>}
            <button type="button" className="button button--secondary" onClick={() => select(null)}>Clear selection</button>
          </> : <p>Select a plot to explore the park, or search for a memorial.</p>}
          <p><Link href="/search">Search memorial records</Link></p>
        </section> : null}

        {view === "planning" ? <section className="map-record-panel">
          {staffTools ? <><details><summary>Find a CAD candidate</summary>          <div className="map-panel-heading"><div><p>Find a plot</p><h2>CAD plot reference</h2></div><Icon name="search" size={21} /></div>
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
          </> : null}
          <details><summary>Gardens &amp; amenities</summary><div className="phase-two-layer-options">
            {bundle?.places.landmarks.map(place => <button key={place.id} type="button" className="button button--secondary"
              onClick={() => { setShowPlaces(true); actions.current?.place(place.cadXY); }}>{landmarkName(place.name)}{staffTools ? " · CAD " + place.id : ""}</button>)}
            {mapAmenities.map(place => place ? <button key={place.id} type="button" className="button button--secondary"
              onClick={() => { setShowPlaces(true); actions.current?.place(place.cadXY); }}>{place.name}</button> : null)}
          </div></details>
        </section> : null}
          </div>
        </details>
      </aside>
    </div>
  </div>;
}
