"use client";

import { circleMarker, divIcon, geoJSON, latLngBounds } from "leaflet";
import type { GeoJsonObject } from "geojson";
import { useEffect, useRef, useState } from "react";
import { Circle, CircleMarker, GeoJSON, ImageOverlay, MapContainer, Marker, Polyline, ScaleControl, TileLayer, Tooltip, ZoomControl, useMap } from "react-leaflet";
import type { PhaseTwoGeography } from "@/lib/phase2-geographic";
import type { ParkPlace } from "@/lib/park-explorer-features";
import type { GpsPosition } from "@/lib/navigation-geo";
import { isSyntheticPlot } from "@/lib/synthetic-plots";

// Exact WGS84 footprint of `/phase2-viewer/landscape/*.png` aligned to the
// published Forest Lake Phase 2 hosted coordinate system (0.1 mm plot fit).
const PHASE2_LANDSCAPE_BOUNDS: [[number, number], [number, number]] = [
  [13.1254684, 123.7402884],
  [13.1281543, 123.7430289],
];
const PHASE2_LANDSCAPE_LAYERS = [
  { key: "base", url: "/phase2-viewer/landscape/base.png", zIndex: 10 },
  { key: "roads", url: "/phase2-viewer/landscape/roads.png", zIndex: 11 },
  { key: "paths", url: "/phase2-viewer/landscape/paths.png", zIndex: 12 },
  { key: "protection", url: "/phase2-viewer/landscape/protection.png", zIndex: 13 },
  { key: "trees", url: "/phase2-viewer/landscape/trees.png", zIndex: 14 },
] as const;

type BaseStyle = "park" | "satellite";

type GeographicExplorer = { plots: boolean; paths: boolean; labels: boolean; selectedId?: string; places: ParkPlace[];
  request: { count: number; kind: "park" | "place" | "location" }; onSelect: (place: ParkPlace) => void };
type Props = { explorer?: GeographicExplorer; data: PhaseTwoGeography; position?: GpsPosition | null; route?: [number, number][]; focusRequest?: number; wideNavigation?: boolean; routeActive?: boolean };
function Viewport({ data, position, route = [], focusRequest, routeActive, wideNavigation }: Props) {
  const map = useMap();
  const latest = useRef(position);
  const latestRoute = useRef(route);
  const lastFocus = useRef(focusRequest);
  const following = useRef(true);
  const hasRoute = route.length > 1;
  useEffect(() => { latest.current = position; }, [position]);
  useEffect(() => { latestRoute.current = route; }, [route]);
  useEffect(() => {
    const pauseFollow = () => { following.current = false; };
    map.on("dragstart", pauseFollow);
    return () => { map.off("dragstart", pauseFollow); };
  }, [map]);
  useEffect(() => {
    if (routeActive && following.current && position) {
      map.panTo([position.latitude, position.longitude], { animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches });
    }
  }, [map, routeActive, position]);
  useEffect(() => {
    const bounds = data.target ? geoJSON(data.target as GeoJsonObject).getBounds() :
      latLngBounds(PHASE2_LANDSCAPE_BOUNDS);
    if (hasRoute && latestRoute.current.length > 1) {
      for (const [lon, lat] of latestRoute.current) bounds.extend([lat, lon]);
    }
    if (latest.current) {
      const center: [number, number] = [latest.current.latitude, latest.current.longitude];
      if (wideNavigation && lastFocus.current !== focusRequest) {
        lastFocus.current = focusRequest;
        following.current = true;
        map.panTo(center, { animate: false });
        return;
      }
      bounds.extend(center);
    }
    lastFocus.current = focusRequest;
    following.current = true;
    if (data.accessPoint) {
      const [lon, lat] = data.accessPoint.geometry.coordinates as number[];
      bounds.extend([lat, lon]);
    }
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [48, 48], maxZoom: 20, animate: false });
  }, [map, data, hasRoute, focusRequest, routeActive, wideNavigation]);
  return null;
}
export default function PhaseTwoGeographicCanvas({ explorer, data, position = null, route = [], focusRequest = 0, wideNavigation = false, routeActive = false }: Props) {
  const [baseStyle, setBaseStyle] = useState<BaseStyle>("park");
  const bounds = latLngBounds(PHASE2_LANDSCAPE_BOUNDS);
  const plotFeatures = !explorer || explorer.plots ? data.layers.plots : [];
  const walkwayFeatures = !explorer || explorer.paths ? data.layers.walkways.filter(feature => feature.properties.walkingAllowed) : [];
  const landmarks = data.layers.landmarks ?? [];
  const routeLatLngs = route.map(([lon, lat]) => [lat, lon] as [number, number]);

  return <div style={{ position: "relative" }}>
    <div
      role="group"
      aria-label="Map background style"
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 500,
        display: "inline-flex",
        gap: 4,
        padding: 4,
        borderRadius: 999,
        background: "rgba(255, 255, 255, 0.94)",
        boxShadow: "0 4px 14px rgba(15, 23, 42, 0.16)",
        border: "1px solid rgba(15, 23, 42, 0.1)",
      }}
    >
      <button
        type="button"
        onClick={() => setBaseStyle("park")}
        aria-pressed={baseStyle === "park"}
        style={{
          border: 0,
          borderRadius: 999,
          padding: "5px 12px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          background: baseStyle === "park" ? "#166534" : "transparent",
          color: baseStyle === "park" ? "#ffffff" : "#1f2937",
        }}
      >
        Park Map
      </button>
      <button
        type="button"
        onClick={() => setBaseStyle("satellite")}
        aria-pressed={baseStyle === "satellite"}
        style={{
          border: 0,
          borderRadius: 999,
          padding: "5px 12px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          background: baseStyle === "satellite" ? "#166534" : "transparent",
          color: baseStyle === "satellite" ? "#ffffff" : "#1f2937",
        }}
      >
        Satellite
      </button>
    </div>

    <MapContainer
      bounds={bounds}
      maxZoom={21}
      minZoom={16}
      className="cemetery-leaflet-canvas"
      style={{
        height: "var(--cemetery-map-height, min(65vh, 620px))",
        minHeight: 320,
        background: baseStyle === "park" ? "#4e7330" : "#1a241b",
      }}
      aria-label={explorer ? "Published park map" : "Gravesite and location map"}
      scrollWheelZoom
      zoomControl={!wideNavigation && !explorer}
    >
      {wideNavigation || explorer ? <><ZoomControl position="topright" /><ScaleControl imperial={false} position="bottomright" /></> : null}
      {explorer ? <ExplorerViewport data={data} position={position} explorer={explorer} />
        : <Viewport data={data} position={position} route={route} focusRequest={focusRequest} wideNavigation={wideNavigation} routeActive={routeActive} />}

      {baseStyle === "satellite" ? (
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles &copy; Esri"
          maxNativeZoom={19}
          maxZoom={21}
        />
      ) : (
        PHASE2_LANDSCAPE_LAYERS.map(layer => (
          <ImageOverlay key={layer.key} url={layer.url} bounds={PHASE2_LANDSCAPE_BOUNDS} zIndex={layer.zIndex} />
        ))
      )}

      {baseStyle === "satellite" && walkwayFeatures.length > 0 ? (
        <GeoJSON
          key={[data.releaseId, "walkways", baseStyle].join(":")}
          data={{ type: "FeatureCollection", features: walkwayFeatures } as GeoJsonObject}
          style={{ color: "#e2e8f0", weight: 5, opacity: 0.7 }}
        />
      ) : null}

      {plotFeatures.length > 0 ? (
        <GeoJSON
          key={[data.releaseId, "plots", baseStyle, explorer?.plots].join(":")}
          data={{ type: "FeatureCollection", features: plotFeatures } as GeoJsonObject}
          style={{
            color: baseStyle === "satellite" ? "#bbf7d0" : "#14532d",
            weight: 1,
            fillColor: baseStyle === "satellite" ? "#22c55e" : "#ffffff",
            fillOpacity: baseStyle === "satellite" ? 0.18 : 0.28,
          }}
        />
      ) : null}

      {!explorer && landmarks.length > 0 ? (
        <GeoJSON
          key={[data.releaseId, "landmarks"].join(":")}
          data={{ type: "FeatureCollection", features: landmarks } as GeoJsonObject}
          pointToLayer={(feature, latlng) => circleMarker(latlng, {
            radius: feature?.properties?.kind === "entrance" ? 6 : 4.5,
            color: "#ffffff",
            weight: 2,
            fillColor: feature?.properties?.kind === "entrance" ? "#15803d" : "#0f172a",
            fillOpacity: 0.9,
          })}
          onEachFeature={(feature, layer) => {
            const label = typeof feature?.properties?.label === "string" ? feature.properties.label : "";
            if (label) layer.bindTooltip(label, { direction: "top", offset: [0, -6] });
          }}
        />
      ) : null}

      {explorer?.places.map(place => {
        if (!place.geographic || place.category === "pathways" && !explorer.paths || place.category === "landmarks" && !explorer.labels) return null;
        const selected = explorer.selectedId === place.id;
        return <GeoJSON key={place.id} data={place.geographic as GeoJsonObject}
          eventHandlers={{ click: () => explorer.onSelect(place) }}
          style={{ color: selected ? "#208554" : "#587967", weight: selected ? 4 : 2, fillOpacity: selected ? .2 : .03 }}
          pointToLayer={(_, point) => circleMarker(point, { radius: 7, color: "#257650", fillOpacity: .8 })}>
          <Tooltip>{place.name}</Tooltip>
        </GeoJSON>;
      })}

      {routeLatLngs.length > 1 ? <>
        <Polyline positions={routeLatLngs} pathOptions={{ color: "#ffffff", weight: 9, opacity: 0.92, lineCap: "round", lineJoin: "round" }} />
        <Polyline positions={routeLatLngs} pathOptions={{ color: "#15803d", weight: 5, opacity: 1, lineCap: "round", lineJoin: "round" }} className="gravenav-active-route" />
      </> : null}

      {data.target ? <GeoJSON key={data.target.id} data={data.target as GeoJsonObject} style={{ color: "#ffffff", weight: 3, fillColor: "#16a34a", fillOpacity: 0.85 }}>
        <Tooltip permanent direction={wideNavigation ? "top" : undefined} offset={wideNavigation ? [0, -12] : undefined}>{isSyntheticPlot(String(data.target.properties.lotCode))
          ? "Gravesite" : String(data.target.properties.lotCode)}</Tooltip>
      </GeoJSON> : null}

      {data.accessPoint ? <GeoJSON data={data.accessPoint as GeoJsonObject} pointToLayer={(_, point) => circleMarker(point, { radius: 6, color: "#ffffff", weight: 2.5, fillColor: "#2563eb", fillOpacity: 1 })}>
        <Tooltip>Gravesite approach</Tooltip>
      </GeoJSON> : null}

      {position ? <>
        <Circle center={[position.latitude, position.longitude]} radius={position.accuracy} pathOptions={{ color: "#2563eb", weight: 1.5, fillColor: "#3b82f6", fillOpacity: 0.14 }} />
        {typeof position.heading === "number" && Number.isFinite(position.heading) ? (
          <Marker
            position={[position.latitude, position.longitude]}
            interactive={false}
            icon={divIcon({
              className: "gravenav-heading-cone",
              html: `<div style="width:28px;height:28px;transform:rotate(${Math.round(position.heading)}deg);display:grid;place-items:start center;"><span style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:10px solid #2563eb;margin-top:-2px;"></span></div>`,
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            })}
          />
        ) : null}
        <CircleMarker center={[position.latitude, position.longitude]} radius={7} pathOptions={{ color: "#ffffff", fillColor: "#2563eb", weight: 3, fillOpacity: 1 }} className="gravenav-current-position">
          <Tooltip>Your location · ±{Math.round(position.accuracy)} m</Tooltip>
        </CircleMarker>
      </> : null}
    </MapContainer>
  </div>;
}

function ExplorerViewport({ data, position, explorer }: { data: PhaseTwoGeography; position: GpsPosition | null; explorer: GeographicExplorer }) {
  const map = useMap();
  const selected = explorer.places.find(place => place.id === explorer.selectedId)?.geographic;
  const lastRequest = useRef<number | null>(null);
  useEffect(() => {
    if (lastRequest.current === explorer.request.count) return;
    lastRequest.current = explorer.request.count;
    if (explorer.request.kind === "location" && position) {
      map.panTo([position.latitude, position.longitude], { animate: false });
      return;
    }
    const features = explorer.request.kind === "place" && selected ? [selected] : data.layers.boundaries;
    const bounds = geoJSON({ type: "FeatureCollection", features } as GeoJsonObject).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [46, 46], maxZoom: 20, animate: false });
  }, [map, data, position, selected, explorer.request]);
  useEffect(() => {
    const resize = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    resize.observe(map.getContainer());
    return () => resize.disconnect();
  }, [map]);
  return null;
}
