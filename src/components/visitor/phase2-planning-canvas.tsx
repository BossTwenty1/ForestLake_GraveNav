"use client";

import L from "leaflet";
import { useEffect, useRef, type MutableRefObject } from "react";
import { MapContainer, ZoomControl, useMap } from "react-leaflet";
import { Icon } from "@/components/ui/icons";
import { cadDetailRoles, cadDetailsAssetRoot, type CadDetailRole } from "@/lib/phase2-cad-details";
import detailStyles from "./phase2-planning-canvas.module.css";
import {
  cadToMap, landmarkName, mapBounds, planningAssetRoot,
  type CadFeature, type LandscapeRole, type LayerKey, type PlanningBundle, type Shape, type Visibility,
} from "@/lib/phase2-planning";

export interface PlanningMapActions {
  reset: () => void;
  focus: (feature: CadFeature) => void;
  place: (position: [number, number]) => void;
}
export interface PlanningMapProps {
  bundle: PlanningBundle;
  visible: Visibility;
  selected: CadFeature | null;
  places: boolean;
  trees: boolean;
  protection: boolean;
  details: boolean;
  reviewMode?: boolean;
  attempt: number;
  onSelect: (feature: CadFeature | null) => void;
  onReady: (actions: PlanningMapActions) => void;
  onError: (message: string) => void;
}
const styles: Record<LayerKey, L.PathOptions> = {
  lawn: { color: "#25492c", weight: 0.6, opacity: 0.7, fillOpacity: 0 },
  estates: { color: "#76613e", weight: 0.8, fillColor: "#eacb82", fillOpacity: 0.25 },
  blocks: { color: "#80683e", weight: 1.3, fill: false },
  boundary: { color: "#45654c", weight: 1.6, dashArray: "7 4", fill: false },
  roads: { color: "#777971", weight: 1.25, fill: false },
  paths: { color: "#a49d88", weight: 0.8, fill: false },
  context: { color: "#899087", weight: 0.65, opacity: 0.6, fill: false },
  overlaps: { color: "#af3862", weight: 1.5, fillColor: "#f5d7e2", fillOpacity: 0.4 },
};
function shapeLayer(shape: Shape, options: L.PathOptions): L.Layer {
  if (shape.kind === "polygon") return L.polygon(shape.positions.map(ring => ring.map(cadToMap)), { ...options, smoothFactor: 0, fillRule: "evenodd" });
  if (shape.kind === "line") return L.polyline(shape.positions.map(cadToMap), { ...options, smoothFactor: 0 });
  if (shape.kind === "point") return L.circleMarker(cadToMap(shape.positions), { ...options, radius: 5 });
  return L.layerGroup(shape.parts.map(part => shapeLayer(part, options)));
}
function PlanningLayers(props: PlanningMapProps) {
  const { bundle, visible, selected, places, trees, protection, onReady, attempt } = props;
  const map = useMap();
  const latest = useRef(props);
  const groups = useRef<Partial<Record<LayerKey, L.LayerGroup>>>({});
  const images = useRef<Partial<Record<LandscapeRole, L.ImageOverlay>>>({});
  const detailImages = useRef<Partial<Record<CadDetailRole, L.ImageOverlay>>>({});
  useEffect(() => { latest.current = props; });

  useEffect(() => {
    const node = map.getContainer();
    const paths: Partial<Record<LayerKey, L.LayerGroup>> = {};
    const overlays: Partial<Record<LandscapeRole, L.ImageOverlay>> = {};
    const detailOverlays: Partial<Record<CadDetailRole, L.ImageOverlay>> = {};
    const roles = ["base", "roads", "protection", "paths", "trees"] as const;
    let active = true;
    const loaded = new Set<string>();
    let failed = false;
    for (const [index, role] of roles.entries()) {
      const name = "planning-image-" + role;
      const pane = map.getPane(name) ?? map.createPane(name);
      pane.style.zIndex = String(210 + index * 10);
      pane.style.pointerEvents = "none";
      const image = L.imageOverlay(planningAssetRoot + "landscape/" + bundle.landscape.layers[role].image + "?attempt=" + attempt,
        mapBounds(bundle.landscape.bounds), { pane: name, interactive: false, alt: "Phase 2 " + role + " map layer" });
      image.on("load", () => {
        if (!active) return;
        loaded.add(role);
        if (loaded.size === roles.length && !failed) node.dataset.landscapeStatus = "ready";
      });
      image.on("error", () => {
        if (!active) return;
        failed = true;
        node.dataset.landscapeStatus = "error";
        image.getElement()?.style.setProperty("display", "none");
        latest.current.onError("A landscape image could not be loaded. Retry to restore the full map.");
      });
      overlays[role] = image;
    }
    const detailLoaded = new Set<CadDetailRole>();
    const requiredDetailRoles = cadDetailRoles.filter(role => props.reviewMode || role !== "paths");
    const detailOrder = { roads: 225, paths: 245, edges: 255, site: 270 };
    node.dataset.cadDetailsStatus = "loading";
    for (const role of cadDetailRoles) {
      const paneName = "planning-cad-detail-" + role;
      const pane = map.getPane(paneName) ?? map.createPane(paneName);
      pane.style.zIndex = String(detailOrder[role]);
      pane.style.pointerEvents = "none";
      const image = L.imageOverlay(cadDetailsAssetRoot + bundle.details.layers[role].image,
        mapBounds(bundle.details.bounds), { pane: paneName, interactive: false, alt: "Phase 2 " + role + " map details" });
      image.on("load", () => {
        if (!active) return;
        detailLoaded.add(role);
        if (requiredDetailRoles.every(required => detailLoaded.has(required))) node.dataset.cadDetailsStatus = "ready";
      });
      image.on("error", () => {
        if (!active) return;
        node.dataset.cadDetailsStatus = "error";
        image.getElement()?.style.setProperty("display", "none");
        latest.current.onError("Part of the park map could not be loaded. Please retry the map.");
      });
      detailOverlays[role] = image;
    }
    for (const [name, zIndex] of [["planning-lines", 300], ["planning-plots", 340], ["planning-labels", 355], ["planning-review", 370], ["planning-selection", 380]] as const) {
      const pane = map.getPane(name) ?? map.createPane(name);
      pane.style.zIndex = String(zIndex);
      pane.style.pointerEvents = name === "planning-plots" ? "auto" : "none";
    }
    // One map-owned canvas serves both plot groups. Selection uses a persistent named pane.
    for (const key of Object.keys(bundle.data.layers) as LayerKey[]) {
      const group = L.layerGroup();
      const plot = key === "lawn" || key === "estates";
      for (const feature of bundle.data.layers[key]) {
        const layer = shapeLayer(feature.shape, {
          ...styles[key], pane: plot ? "planning-plots" : "planning-lines", interactive: plot, bubblingMouseEvents: false,
        });
        if (plot) layer.on("click", (event: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(event);
          latest.current.onSelect(feature);
        });
        group.addLayer(layer);
      }
      paths[key] = group;
    }
    groups.current = paths;
    images.current = overlays;
    detailImages.current = detailOverlays;
    const reset = () => map.fitBounds(mapBounds(bundle.data.bounds), { padding: [28, 54], animate: false });
    onReady({
      reset,
      focus: feature => map.fitBounds(mapBounds(feature.bounds), { padding: [70, 70], maxZoom: 5.5, animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches }),
      place: position => map.setView(cadToMap(position), 3.3, { animate: false }),
    });
    reset();
    const clear = () => latest.current.onSelect(null);
    map.on("click", clear);
    const updateView = () => {
      const center = map.getCenter();
      node.dataset.center = center.lng + "," + center.lat;
      node.dataset.zoom = String(map.getZoom());
    };
    updateView();
    map.on("moveend zoomend", updateView);
    const resize = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    resize.observe(node);
    node.dataset.plotCount = "4494";
    node.dataset.landscapeStatus = "loading";
    return () => {
      active = false;
      resize.disconnect();
      map.off("click", clear);
      map.off("moveend zoomend", updateView);
      Object.values(paths).forEach(group => group.remove());
      Object.values(overlays).forEach(image => image.remove());
      Object.values(detailOverlays).forEach(image => image.remove());
      groups.current = {};
      images.current = {};
      detailImages.current = {};
    };
  }, [map, bundle, onReady, attempt, props.reviewMode]);

  useEffect(() => {
    for (const key of Object.keys(visible) as LayerKey[]) {
      const group = groups.current[key];
      if (group) { if (visible[key] && (props.reviewMode || key !== "paths")) group.addTo(map); else group.remove(); }
    }
    for (const role of ["base", "roads", "paths", "trees", "protection"] as const) {
      const image = images.current[role];
      const show = role === "base" || (role === "trees" ? trees : role === "protection" ? protection : visible[role]);
      if (image) { if (show) image.addTo(map); else image.remove(); }
      map.getContainer().dataset["landscape" + role[0].toUpperCase() + role.slice(1)] = show ? "visible" : "hidden";
    }
    for (const role of cadDetailRoles) {
      const image = detailImages.current[role];
      const show = props.details && (role === "site" || (role === "edges" ? protection : visible[role])) && (props.reviewMode || role !== "paths");
      if (image) { if (show) image.addTo(map); else image.remove(); }
    }
    map.getContainer().dataset.cadDetails = props.details ? "visible" : "hidden";
  }, [map, bundle, visible, trees, protection, props.details, props.reviewMode, attempt]);

  useEffect(() => {
    map.getContainer().dataset.selected = selected?.id ?? "";
    if (!selected) return;
    const highlight = L.layerGroup([
      shapeLayer(selected.shape, { pane: "planning-selection", interactive: false, color: "#453617", weight: 7, fill: false }),
      shapeLayer(selected.shape, { pane: "planning-selection", interactive: false, color: "#ffce32", weight: 4, fillColor: "#ffe890", fillOpacity: 0.15 }),
    ]).addTo(map);
    return () => { highlight.remove(); };
  }, [map, selected]);

  useEffect(() => {
    if (!places) return;
    let labels: L.Tooltip[] = [];
    let frame = 0;
    const update = () => {
      labels.forEach(label => label.remove());
      labels = [];
      const zoom = map.getZoom();
      if (zoom > 4.6 || (map.getSize().x < 600 && zoom < 1.5)) return;
      for (const place of bundle.places.landmarks) {
        if (place.kind === "facility" && zoom < 2.4) continue;
        const text = document.createElement("span");
        text.textContent = landmarkName(place.name);
        text.dataset.cadPlace = place.id;
        labels.push(L.tooltip({
          permanent: true, interactive: false, pane: "planning-labels",
          className: "phase-two-place-label",
          direction: place.kind === "facility" ? "right" : "top",
          offset: place.kind === "facility" ? L.point(0, 0) : L.point(0, -16),
        }).setLatLng(cadToMap(place.cadXY)).setContent(text).addTo(map));
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    schedule();
    map.on("zoomend", schedule);
    map.on("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      map.off("zoomend", schedule);
      map.off("resize", schedule);
      labels.forEach(label => label.remove());
    };
  }, [map, bundle, places]);

  useEffect(() => {
    if (!places || !props.details) return;
    let annotations: L.Tooltip[] = [];
    let frame = 0;
    const update = () => {
      annotations.forEach(label => label.remove());
      annotations = [];
      const zoom = map.getZoom();
      if (zoom > 5.2) return;
      for (const label of bundle.details.labels) {
        if (label.kind === "edge" && (!protection || zoom < 2.5)) continue;
        if (label.kind === "amenity" && zoom < 2.4) continue;
        const text = document.createElement("span");
        text.textContent = label.name;
        text.dataset.cadDetailLabel = label.id;
        text.setAttribute("aria-label", label.kind === "section" ? "Section " + label.name : label.name);
        annotations.push(L.tooltip({ permanent: true, interactive: false, pane: "planning-labels",
          className: label.kind === "section" ? detailStyles.sectionLabel : detailStyles.edgeLabel,
          direction: label.kind === "section" ? "center" : "right" })
          .setLatLng(cadToMap(label.cadXY)).setContent(text).addTo(map));
      }
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    schedule();
    map.on("zoomend", schedule);
    return () => { cancelAnimationFrame(frame); map.off("zoomend", schedule); annotations.forEach(label => label.remove()); };
  }, [map, bundle, places, props.details, protection]);

  useEffect(() => {
    if (!props.reviewMode) return;
    const annotations: L.Layer[] = [];
    const line = (positions: number[][]) => annotations.push(L.polyline(positions.map(p => L.latLng(p[1], p[0])), {
      pane: "planning-review", interactive: false, color: "#9c672d", weight: 2, dashArray: "4 4",
    }).addTo(map));
    if (visible.roads) line(bundle.landscape.roadEvidence.closure);
    if (visible.paths) bundle.landscape.pathways.forEach(path => path.provisionalEnds.forEach(line));
    return () => { annotations.forEach(layer => layer.remove()); };
  }, [map, bundle, visible.roads, visible.paths, props.reviewMode]);
  return null;
}
function MapControls({ actions, paths, onToggle, showPathsControl }: { actions: MutableRefObject<PlanningMapActions | null>; paths: boolean; onToggle: () => void; showPathsControl: boolean }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (element.current) {
      L.DomEvent.disableClickPropagation(element.current);
      L.DomEvent.disableScrollPropagation(element.current);
    }
  }, []);
  return <div ref={element} className="phase-two-map-controls">
    {showPathsControl ? <button className="phase-one-map-toggle" type="button" aria-pressed={paths} onClick={onToggle}><Icon name="map" size={16} />{paths ? "Hide paths" : "Show paths"}</button> : null}
    <button className="schematic-map-reset" type="button" aria-label="Reset map view" onClick={() => actions.current?.reset()}><Icon name="target" size={16} />Reset view</button>
  </div>;
}
export function PhaseTwoPlanningCanvas(props: PlanningMapProps & { actions: MutableRefObject<PlanningMapActions | null>; onTogglePaths: () => void }) {
  return <MapContainer className="cemetery-leaflet-canvas phase-two-planning-canvas" aria-label="Forest Lake Phase 2 park map"
    crs={L.CRS.Simple} center={[110, 145]} zoom={1} minZoom={-2} maxZoom={7} zoomSnap={0.1} zoomDelta={0.5}
    zoomControl={false} preferCanvas scrollWheelZoom>
    <ZoomControl position="bottomright" />
    <PlanningLayers {...props} />
    <MapControls actions={props.actions} paths={props.visible.paths} onToggle={props.onTogglePaths} showPathsControl={!!props.reviewMode} />
  </MapContainer>;
}
