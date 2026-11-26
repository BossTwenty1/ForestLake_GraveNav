"use client";

import { circleMarker, divIcon, geoJSON } from "leaflet";
import type { GeoJsonObject } from "geojson";
import { useEffect, useRef } from "react";
import { Circle, CircleMarker, GeoJSON, MapContainer, Marker, Polyline, ScaleControl, Tooltip, ZoomControl, useMap } from "react-leaflet";
import type { PhaseTwoGeography } from "@/lib/phase2-geographic";
import type { ParkPlace } from "@/lib/park-explorer-features";
import type { GpsPosition } from "@/lib/navigation-geo";
import { isSyntheticPlot } from "@/lib/synthetic-plots";
import { PlotHighlightLegend, plotHighlightStyle, usePlotHighlights } from "./plot-highlights";

type GeographicExplorer = { plots: boolean; paths: boolean; labels: boolean; selectedId?: string; places: ParkPlace[];
  request: { count: number; kind: "park" | "place" | "location" }; onSelect: (place: ParkPlace) => void };
type Props = { explorer?: GeographicExplorer; data: PhaseTwoGeography; position?: GpsPosition | null; route?: [number, number][]; focusRequest?: number; wideNavigation?: boolean; routeActive?: boolean; staff?: boolean };
function Viewport({ data, position, focusRequest, routeActive, wideNavigation }: Props) {
  const map = useMap();
  const latest = useRef(position);
  const lastFocus = useRef(focusRequest);
  const following = useRef(true);
  useEffect(() => { latest.current = position; }, [position]);
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
      geoJSON({ type: "FeatureCollection", features: data.layers.boundaries } as GeoJsonObject).getBounds();
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
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 20, animate: false });
  }, [map, data, focusRequest, routeActive, wideNavigation]);
  return null;
}
export default function PhaseTwoGeographicCanvas({ explorer, data, position = null, route = [], focusRequest = 0, wideNavigation = false, routeActive = false, staff = false }: Props) {
  const bounds = geoJSON({ type: "FeatureCollection", features: data.layers.boundaries } as GeoJsonObject).getBounds();
  const { highlights, unavailable } = usePlotHighlights(data.releaseId, staff);
  const plots = !explorer || explorer.plots ? data.layers.plots : [];
  const features = [...data.layers.boundaries, ...(!explorer || explorer.paths ? data.layers.walkways.filter(feature => feature.properties.walkingAllowed) : []),
    ...plots];
  return <MapContainer bounds={bounds} className="cemetery-leaflet-canvas" style={{ height: "var(--cemetery-map-height, min(65vh, 620px))", minHeight: 320 }}
    aria-label={explorer ? "Published park map" : "Gravesite and location map"} scrollWheelZoom zoomControl={!wideNavigation && !explorer}>
    {wideNavigation || explorer ? <><ZoomControl position="topright" /><ScaleControl imperial={false} position="bottomright" /></> : null}
    {explorer ? <ExplorerViewport data={data} position={position} explorer={explorer} />
      : <Viewport data={data} position={position} focusRequest={focusRequest} wideNavigation={wideNavigation} routeActive={routeActive} />}
    <GeoJSON key={[data.releaseId, explorer?.plots, explorer?.paths].join(":")} data={{ type: "FeatureCollection", features } as GeoJsonObject}
      style={feature => {
        const lotId = feature?.properties?.lotId;
        const occupied = highlights.occupied.has(lotId);
        if (occupied || highlights.memorials.has(lotId)) return plotHighlightStyle(occupied);
        const line = feature?.geometry.type === "LineString";
        return { color: lotId ? "#688571" : line ? "#aebeb6" : "#85968a", weight: line ? 9 : 2, fillOpacity: 0.1 };
      }} />
    {(!explorer || explorer.plots) && (
      <PlotHighlightLegend
        memorials={plots.some(({ properties }) => highlights.memorials.has(String(properties.lotId)) &&
          !highlights.occupied.has(String(properties.lotId)))}
        occupied={plots.some(({ properties }) => highlights.occupied.has(String(properties.lotId)))}
        unavailable={unavailable}
      />
    )}
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
    {data.target ? <GeoJSON key={data.target.id} data={data.target as GeoJsonObject} style={{ color: "#317b52", weight: 4, fillOpacity: 0.25 }}>
      <Tooltip permanent direction={wideNavigation ? "top" : undefined} offset={wideNavigation ? [0, -12] : undefined}>{isSyntheticPlot(String(data.target.properties.lotCode))
        ? "Gravesite" : String(data.target.properties.lotCode)}</Tooltip>
    </GeoJSON> : null}
    {data.accessPoint ? <GeoJSON data={data.accessPoint as GeoJsonObject} pointToLayer={(_, point) => circleMarker(point, { radius: 6, color: "#285777" })}>
      <Tooltip>Gravesite approach</Tooltip>
    </GeoJSON> : null}
    {route.length > 1 ? <Polyline positions={route.map(([lon, lat]) => [lat, lon])} pathOptions={{ color: "#158851", weight: 5 }} className="gravenav-active-route" /> : null}
    {position ? <>
      <Circle center={[position.latitude, position.longitude]} radius={position.accuracy} pathOptions={{ color: "#285777", weight: 1, fillOpacity: 0.08 }} />
      {typeof position.heading === "number" && Number.isFinite(position.heading) ? (
        <Marker
          position={[position.latitude, position.longitude]}
          interactive={false}
          icon={divIcon({
            className: "gravenav-heading-cone",
            html: `<div style="width:28px;height:28px;transform:rotate(${Math.round(position.heading)}deg);display:grid;place-items:start center;"><span style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:10px solid #177f52;margin-top:-2px;"></span></div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          })}
        />
      ) : null}
      <CircleMarker center={[position.latitude, position.longitude]} radius={7} pathOptions={{ color: "#fff", fillColor: "#177f52", weight: 3, fillOpacity: 1 }} className="gravenav-current-position">
        <Tooltip>Your location · ±{Math.round(position.accuracy)} m</Tooltip>
      </CircleMarker>
    </> : null}
  </MapContainer>;
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
