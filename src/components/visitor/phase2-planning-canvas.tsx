"use client";

import L from "leaflet";
import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { MapContainer, TileLayer, ZoomControl, useMap } from "react-leaflet";
import { PARK_NAME } from "@/lib/park-details";
import type { ParkCategory, ParkPlace } from "@/lib/park-explorer-features";
import { Icon } from "@/components/ui/icons";
import { cadDetailRoles, cadDetailsAssetRoot, type CadDetailRole } from "@/lib/phase2-cad-details";
import { PARK_CENTER_WGS84, parkLayoutToWgs84 } from "@/lib/phase2-gps-bridge";
import detailStyles from "./phase2-planning-canvas.module.css";
import { PlanningLotPopup, type PlanningLotPopupOptions } from "./planning-lot-popup";
import {
  landmarkName, mapBounds, planningAssetRoot,
  type Bounds, type CadFeature, type LandscapeRole, type LayerKey, type PlanningBundle, type Shape, type Visibility,
} from "@/lib/phase2-planning";

export type PlanningMapStyle = "illustrated" | "satellite";

const ESRI_WORLD_IMAGERY_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_WORLD_IMAGERY_ATTRIBUTION = "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics";

function cadToWgsLatLng(xy: readonly number[]): L.LatLng {
  const { latitude, longitude } = parkLayoutToWgs84([xy[0], xy[1]]);
  return L.latLng(latitude, longitude);
}

function projectPoint(xy: readonly number[], satellite: boolean): L.LatLng {
  return satellite ? cadToWgsLatLng(xy) : L.latLng(xy[1], xy[0]);
}

function projectBounds(bounds: Bounds, satellite: boolean): L.LatLngBounds {
  if (!satellite) return L.latLngBounds(mapBounds(bounds));
  const [minX, minY, maxX, maxY] = bounds;
  return L.latLngBounds([
    cadToWgsLatLng([minX, minY]),
    cadToWgsLatLng([maxX, minY]),
    cadToWgsLatLng([maxX, maxY]),
    cadToWgsLatLng([minX, maxY]),
  ]);
}

export interface PlanningMapActions {
  reset: () => void;
  focus: (feature: CadFeature) => void;
  place: (position: [number, number]) => void;
  focusPlaces: (positions: [number, number][]) => void;
  fitRoute?: (positions: [number, number][]) => void;
  invalidateSize?: () => void;
}
export interface PlanningRouteOverlay {
  path: [number, number][];
  approach: [number, number][];
  startLabel: string;
  destinationLabel?: string;
  destinationReference?: string;
  isLiveGps?: boolean;
  gpsPosition?: [number, number] | null;
  gpsAccuracyMeters?: number | null;
}
export interface PlanningMapProps {
  bundle: PlanningBundle;
  visible: Visibility;
  selected: CadFeature | null;
  focusOnLoad?: CadFeature | null;
  lotPopup?: PlanningLotPopupOptions;
  layoutRoute?: PlanningRouteOverlay | null;
  mapStyle?: PlanningMapStyle;
  onTileError?: (failed: boolean) => void;
  places: boolean;
  trees: boolean;
  protection: boolean;
  details: boolean;
  reviewMode?: boolean;
  scrollWheelZoom?: boolean;
  zoomPosition?: L.ControlPosition;
  attempt: number;
  onSelect: (feature: CadFeature | null) => void;
  onReady: (actions: PlanningMapActions) => void;
  onError: (message: string) => void;
  explorer?: { places: ParkPlace[]; showLabels: boolean; showPaths: boolean; category: ParkCategory | "all"; selectedId?: string; onSelect: (place: ParkPlace) => void };
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
const satelliteStyles: Record<LayerKey, L.PathOptions> = {
  lawn: { color: "#f8fafc", weight: 0.75, opacity: 0.58, fillColor: "#22c55e", fillOpacity: 0.06 },
  estates: { color: "#fde68a", weight: 1.1, opacity: 0.85, fillColor: "#f59e0b", fillOpacity: 0.22 },
  blocks: { color: "#fcd34d", weight: 1.4, opacity: 0.78, fill: false },
  boundary: { color: "#86efac", weight: 2, opacity: 0.9, dashArray: "7 5", fill: false },
  roads: { color: "#e2e8f0", weight: 1.5, opacity: 0.52, fill: false },
  paths: { color: "#fef08a", weight: 1.4, opacity: 0.78, fill: false },
  context: { color: "#cbd5e1", weight: 0.8, opacity: 0.45, fill: false },
  overlaps: { color: "#fb7185", weight: 1.7, fillColor: "#fda4af", fillOpacity: 0.42 },
};
function shapeLayer(shape: Shape, options: L.PathOptions, satellite = false): L.Layer {
  if (shape.kind === "polygon") return L.polygon(shape.positions.map(ring => ring.map(pt => projectPoint(pt, satellite))), { ...options, smoothFactor: 0, fillRule: "evenodd" });
  if (shape.kind === "line") return L.polyline(shape.positions.map(pt => projectPoint(pt, satellite)), { ...options, smoothFactor: 0 });
  if (shape.kind === "point") return L.circleMarker(projectPoint(shape.positions, satellite), { ...options, radius: 5 });
  return L.layerGroup(shape.parts.map(part => shapeLayer(part, options, satellite)));
}
function PlanningLayers(props: PlanningMapProps) {
  const { bundle, visible, selected, places, trees, protection, onReady, attempt } = props;
  const satellite = props.mapStyle === "satellite";
  const map = useMap();
  const latest = useRef(props);
  const initialFocus = useRef(props.focusOnLoad);
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
    if (!satellite) {
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
    } else {
      node.dataset.cadDetailsStatus = "ready";
    }
    for (const [name, zIndex] of [["planning-lines", 300], ["planning-plots", 340], ["planning-labels", 355], ["planning-review", 370], ["planning-route", 375], ["planning-selection", 380]] as const) {
      const pane = map.getPane(name) ?? map.createPane(name);
      pane.style.zIndex = String(zIndex);
      pane.style.pointerEvents = name === "planning-plots" ? "auto" : "none";
    }
    // One map-owned canvas serves both plot groups. Selection uses a persistent named pane.
    const palette = satellite ? satelliteStyles : styles;
    for (const key of Object.keys(bundle.data.layers) as LayerKey[]) {
      const group = L.layerGroup();
      const plot = key === "lawn" || key === "estates";
      for (const feature of bundle.data.layers[key]) {
        const layer = shapeLayer(feature.shape, {
          ...palette[key], pane: plot ? "planning-plots" : "planning-lines", interactive: plot, bubblingMouseEvents: false,
        }, satellite);
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
    const reset = () => map.fitBounds(projectBounds(bundle.data.bounds, satellite), { padding: [28, 54], animate: false });
    onReady({
      reset,
      focus: feature => map.fitBounds(projectBounds(feature.bounds, satellite), { padding: [70, 70], maxZoom: satellite ? 21.2 : 5.5, animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches }),
      place: position => map.setView(projectPoint(position, satellite), satellite ? 19.5 : 3.3, { animate: false }),
      focusPlaces: positions => map.fitBounds(L.latLngBounds(positions.map(pt => projectPoint(pt, satellite))), { padding: [62, 62], maxZoom: satellite ? 19.5 : 3.3, animate: false }),
      fitRoute: positions => {
        if (!positions.length) return;
        map.fitBounds(L.latLngBounds(positions.map(pt => projectPoint(pt, satellite))), {
          padding: [56, 56],
          maxZoom: satellite ? 20.2 : 4.2,
          animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        });
      },
      invalidateSize: () => map.invalidateSize({ animate: false }),
    });
    if (initialFocus.current) map.fitBounds(projectBounds(initialFocus.current.bounds, satellite), { padding: [70, 70], maxZoom: satellite ? 21.2 : 5.5, animate: false });
    else reset();
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
    node.dataset.mapStyle = satellite ? "satellite" : "illustrated";
    node.dataset.landscapeStatus = satellite ? "ready" : "loading";
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
  }, [map, bundle, onReady, attempt, props.reviewMode, satellite]);

  useEffect(() => {
    for (const key of Object.keys(visible) as LayerKey[]) {
      const group = groups.current[key];
      if (group) { if (visible[key] && (props.reviewMode || satellite || key !== "paths")) group.addTo(map); else group.remove(); }
    }
    if (!satellite) {
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
    }
    map.getContainer().dataset.cadDetails = !satellite && props.details ? "visible" : "hidden";
  }, [map, bundle, visible, trees, protection, props.details, props.reviewMode, attempt, satellite]);

  useEffect(() => {
    map.getContainer().dataset.selected = selected?.id ?? "";
    if (!selected) return;
    const highlight = L.layerGroup([
      shapeLayer(selected.shape, { pane: "planning-selection", interactive: false, color: "#453617", weight: 7, fill: false }, satellite),
      shapeLayer(selected.shape, { pane: "planning-selection", interactive: false, color: "#ffce32", weight: 4, fillColor: "#ffe890", fillOpacity: satellite ? 0.28 : 0.15 }, satellite),
    ]).addTo(map);
    return () => { highlight.remove(); };
  }, [map, selected, satellite]);

  useEffect(() => {
    const route = props.layoutRoute;
    if (!route || route.path.length < 2) return;
    const layers: L.Layer[] = [
      L.polyline(route.path.map(pt => projectPoint(pt, satellite)), {
        pane: "planning-route", interactive: false, color: "#ffffff", weight: 9, opacity: 0.96, lineCap: "round", lineJoin: "round",
      }),
      L.polyline(route.path.map(pt => projectPoint(pt, satellite)), {
        pane: "planning-route", interactive: false, color: "#2563eb", weight: 5, opacity: 1, lineCap: "round", lineJoin: "round",
      }),
    ];
    if (route.approach.length >= 2) {
      layers.push(L.polyline(route.approach.map(pt => projectPoint(pt, satellite)), {
        pane: "planning-route", interactive: false, color: "#ffffff", weight: 5.5, dashArray: "6 6", opacity: 0.9,
      }));
      layers.push(L.polyline(route.approach.map(pt => projectPoint(pt, satellite)), {
        pane: "planning-route", interactive: false, color: "#2563eb", weight: 3, dashArray: "6 6", opacity: 0.98,
      }));
      const destPoint = route.approach[route.approach.length - 1];
      if (route.destinationLabel) {
        const pinHtml = `<span class="${detailStyles.destinationPin}"><span class="${detailStyles.destinationPinCore}"></span></span>`;
        const destMarker = L.marker(projectPoint(destPoint, satellite), {
          pane: "planning-selection",
          interactive: false,
          icon: L.divIcon({
            className: detailStyles.destinationPinWrap,
            html: pinHtml,
            iconSize: [28, 28],
            iconAnchor: [14, 28],
          }),
        });
        const labelNode = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = route.destinationLabel;
        labelNode.appendChild(title);
        if (route.destinationReference) {
          const ref = document.createElement("span");
          ref.className = detailStyles.destinationTooltipRef;
          ref.textContent = route.destinationReference;
          labelNode.appendChild(ref);
        }
        destMarker.bindTooltip(labelNode, {
          permanent: true,
          direction: "right",
          offset: L.point(14, -14),
          className: detailStyles.destinationTooltip,
        });
        layers.push(destMarker);
      }
    }

    if (route.isLiveGps && route.gpsPosition) {
      const gpsLatLng = projectPoint(route.gpsPosition, satellite);
      if (typeof route.gpsAccuracyMeters === "number" && Number.isFinite(route.gpsAccuracyMeters)) {
        layers.push(L.circle(gpsLatLng, {
          pane: "planning-route",
          interactive: false,
          radius: Math.max(3, Math.min(route.gpsAccuracyMeters, 45)),
          color: "#2563eb",
          weight: 1.25,
          opacity: 0.55,
          fillColor: "#3b82f6",
          fillOpacity: 0.16,
        }));
      }
      const pulseMarker = L.marker(gpsLatLng, {
        pane: "planning-selection",
        interactive: false,
        icon: L.divIcon({
          className: detailStyles.gpsPulseWrap,
          html: `<span class="${detailStyles.gpsPulseRing}"></span><span class="${detailStyles.gpsPulseDot}"></span>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
      });
      const callout = document.createElement("div");
      callout.className = detailStyles.gpsCalloutInner;
      const arrow = document.createElement("span");
      arrow.className = detailStyles.gpsCalloutArrow;
      callout.appendChild(arrow);
      const copy = document.createElement("div");
      const heading = document.createElement("strong");
      heading.textContent = "Your Location";
      copy.appendChild(heading);
      if (typeof route.gpsAccuracyMeters === "number" && Number.isFinite(route.gpsAccuracyMeters)) {
        const meta = document.createElement("span");
        meta.className = detailStyles.gpsCalloutMeta;
        meta.textContent = `(±${Math.max(1, Math.round(route.gpsAccuracyMeters))} m)`;
        copy.appendChild(meta);
      }
      callout.appendChild(copy);
      pulseMarker.bindTooltip(callout, {
        permanent: true,
        direction: "top",
        offset: L.point(0, -14),
        className: detailStyles.gpsCalloutTooltip,
      });
      layers.push(pulseMarker);
    } else {
      const startMarker = L.circleMarker(projectPoint(route.path[0], satellite), {
        pane: "planning-route", interactive: false, radius: 7, color: "#ffffff", weight: 2.5, fillColor: "#2563eb", fillOpacity: 1,
      });
      startMarker.bindTooltip(route.startLabel, {
        permanent: true, direction: "top", offset: L.point(0, -10), className: "phase-two-place-label",
      });
      layers.push(startMarker);
    }
    const group = L.layerGroup(layers).addTo(map);
    return () => { group.remove(); };
  }, [map, props.layoutRoute, satellite]);

  useEffect(() => {
    if (!places) return;
    let labels: L.Tooltip[] = [];
    let frame = 0;
    const update = () => {
      labels.forEach(label => label.remove());
      labels = [];
      const zoom = map.getZoom();
      if (satellite
        ? (zoom > 21 || (map.getSize().x < 600 && zoom < 17.5))
        : (zoom > 4.6 || (map.getSize().x < 600 && zoom < 1.5))) return;
      for (const place of bundle.places.landmarks) {
        if (place.kind === "facility" && zoom < (satellite ? 18.8 : 2.4)) continue;
        const text = document.createElement("span");
        text.textContent = landmarkName(place.name);
        text.dataset.cadPlace = place.id;
        labels.push(L.tooltip({
          permanent: true, interactive: false, pane: "planning-labels",
          className: "phase-two-place-label",
          direction: place.kind === "facility" ? "right" : "top",
          offset: place.kind === "facility" ? L.point(0, 0) : L.point(0, -16),
        }).setLatLng(projectPoint(place.cadXY, satellite)).setContent(text).addTo(map));
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
  }, [map, bundle, places, satellite]);

  useEffect(() => {
    if (!places || !props.details) return;
    let annotations: L.Tooltip[] = [];
    let frame = 0;
    const update = () => {
      annotations.forEach(label => label.remove());
      annotations = [];
      const zoom = map.getZoom();
      if (zoom > (satellite ? 21.5 : 5.2)) return;
      for (const label of bundle.details.labels) {
        if (label.kind === "edge" && (!protection || zoom < (satellite ? 19 : 2.5))) continue;
        if (label.kind === "amenity" && zoom < (satellite ? 19 : 2.4)) continue;
        const text = document.createElement("span");
        text.textContent = label.name;
        text.dataset.cadDetailLabel = label.id;
        text.setAttribute("aria-label", label.kind === "section" ? "Section " + label.name : label.name);
        annotations.push(L.tooltip({
          permanent: true, interactive: false, pane: "planning-labels",
          className: label.kind === "section" ? detailStyles.sectionLabel : detailStyles.edgeLabel,
          direction: label.kind === "section" ? "center" : "right"
        })
          .setLatLng(projectPoint(label.cadXY, satellite)).setContent(text).addTo(map));
      }
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    schedule();
    map.on("zoomend", schedule);
    return () => { cancelAnimationFrame(frame); map.off("zoomend", schedule); annotations.forEach(label => label.remove()); };
  }, [map, bundle, places, props.details, protection, satellite]);

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
function ExplorerMarkers({ explorer, satellite }: { explorer: NonNullable<PlanningMapProps["explorer"]>; satellite: boolean }) {
  const map = useMap();
  const markers = useRef<{ place: ParkPlace; node: HTMLSpanElement }[]>([]);
  const select = useRef(explorer.onSelect);
  useEffect(() => { select.current = explorer.onSelect; }, [explorer.onSelect]);
  useEffect(() => {
    const layer = L.layerGroup().addTo(map);
    for (const place of explorer.places) {
      if (place.category === "pathways" ? !explorer.showPaths : !explorer.showLabels) continue;
      for (const point of place.points) {
        const node = document.createElement("span");
        node.textContent = place.name;
        node.dataset.category = place.category;
        node.dataset.kind = place.kind;
        markers.current.push({ place, node });
        const marker = L.marker(projectPoint(point, satellite), {
          icon: L.divIcon({ className: "park-place-marker", html: node, iconSize: [26, 26], iconAnchor: [13, 13] }),
          title: place.name, alt: place.name, keyboard: true, zIndexOffset: place.kind === "Garden" ? 100 : 0,
        }).on("click", () => select.current(place)).addTo(layer);
        const element = marker.getElement();
        element?.setAttribute("aria-label", place.name);
        element?.setAttribute("aria-pressed", "false");
        element?.addEventListener("keydown", event => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          select.current(place);
        });
      }
    }
    return () => { markers.current = []; layer.remove(); };
  }, [map, explorer.places, explorer.showLabels, explorer.showPaths, satellite]);
  useEffect(() => {
    for (const { place, node } of markers.current) {
      const selected = place.id === explorer.selectedId;
      node.setAttribute("data-selected", String(selected));
      node.setAttribute("data-label", String(selected || place.kind === "Garden" || place.category === explorer.category));
      node.parentElement?.setAttribute("aria-pressed", String(selected));
    }
  }, [explorer.selectedId, explorer.category, explorer.places, explorer.showLabels, explorer.showPaths]);
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
  const satellite = props.mapStyle === "satellite";
  const projectPopup = useCallback((xy: [number, number]) => projectPoint(xy, satellite), [satellite]);
  return <MapContainer
    className={"cemetery-leaflet-canvas phase-two-planning-canvas" + (satellite ? " phase-two-planning-canvas--satellite" : "")}
    aria-label={`${PARK_NAME} Phase 2 ${satellite ? "satellite" : "park"} map`}
    crs={satellite ? L.CRS.EPSG3857 : L.CRS.Simple}
    center={satellite ? [PARK_CENTER_WGS84.latitude, PARK_CENTER_WGS84.longitude] : [110, 145]}
    zoom={satellite ? 18 : 1}
    minZoom={satellite ? 15 : -2}
    maxZoom={satellite ? 22 : 7}
    zoomSnap={satellite ? 0.25 : 0.1}
    zoomDelta={0.5}
    zoomControl={false}
    preferCanvas
    scrollWheelZoom={props.scrollWheelZoom ?? true}
  >
    {satellite ? (
      <TileLayer
        attribution={ESRI_WORLD_IMAGERY_ATTRIBUTION}
        eventHandlers={{
          tileerror: () => props.onTileError?.(true),
          tileload: () => props.onTileError?.(false),
        }}
        maxNativeZoom={18}
        maxZoom={22}
        url={ESRI_WORLD_IMAGERY_URL}
      />
    ) : null}
    <ZoomControl position={props.zoomPosition ?? (props.explorer ? "topright" : "bottomright")} />
    <PlanningLayers {...props} />
    {props.selected && props.lotPopup ? <PlanningLotPopup key={props.selected.id} feature={props.selected} {...props.lotPopup} project={projectPopup} /> : null}
    {props.explorer ? <ExplorerMarkers explorer={props.explorer} satellite={satellite} /> : <MapControls actions={props.actions} paths={props.visible.paths} onToggle={props.onTogglePaths} showPathsControl={!!props.reviewMode} />}
  </MapContainer>;
}
