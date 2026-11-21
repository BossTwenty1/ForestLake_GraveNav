"use client";

import { circleMarker, geoJSON } from "leaflet";
import type { GeoJsonObject } from "geojson";
import { useEffect, useRef } from "react";
import { Circle, CircleMarker, GeoJSON, MapContainer, Polyline, ScaleControl, Tooltip, ZoomControl, useMap } from "react-leaflet";
import type { PhaseTwoGeography } from "@/lib/phase2-geographic";
import type { ParkPlace } from "@/lib/park-explorer-features";
import type { GpsPosition } from "@/lib/navigation-geo";
import { isSyntheticPlot } from "@/lib/synthetic-plots";

type GeographicExplorer = { plots: boolean; paths: boolean; labels: boolean; selectedId?: string; places: ParkPlace[];
  request: { count: number; kind: "park" | "place" | "location" }; onSelect: (place: ParkPlace) => void };
type Props = { explorer?: GeographicExplorer; data: PhaseTwoGeography; position?: GpsPosition | null; route?: [number, number][]; focusRequest?: number; wideNavigation?: boolean; routeActive?: boolean };
function Viewport({ data, position, focusRequest, routeActive, wideNavigation }: Props) {
  const map = useMap();
  const latest = useRef(position);
  const lastFocus = useRef(focusRequest);
  useEffect(() => { latest.current = position; }, [position]);
  useEffect(() => {
    const bounds = data.target ? geoJSON(data.target as GeoJsonObject).getBounds() :
      geoJSON({ type: "FeatureCollection", features: data.layers.boundaries } as GeoJsonObject).getBounds();
    if (latest.current) {
      const center: [number, number] = [latest.current.latitude, latest.current.longitude];
      if (wideNavigation && lastFocus.current !== focusRequest) {
        lastFocus.current = focusRequest;
        map.panTo(center, { animate: false });
        return;
      }
      bounds.extend(center);
    }
    lastFocus.current = focusRequest;
    if (data.accessPoint) {
      const [lon, lat] = data.accessPoint.geometry.coordinates as number[];
      bounds.extend([lat, lon]);
    }
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 20, animate: false });
  }, [map, data, focusRequest, routeActive, wideNavigation]);
  return null;
}
export default function PhaseTwoGeographicCanvas({ explorer, data, position = null, route = [], focusRequest = 0, wideNavigation = false, routeActive = false }: Props) {
  const bounds = geoJSON({ type: "FeatureCollection", features: data.layers.boundaries } as GeoJsonObject).getBounds();
  const features = [...data.layers.boundaries, ...(!explorer || explorer.paths ? data.layers.walkways.filter(feature => feature.properties.walkingAllowed) : []),
    ...(!explorer || explorer.plots ? data.layers.plots : [])];
  return <MapContainer bounds={bounds} className="cemetery-leaflet-canvas" style={{ height: "var(--cemetery-map-height, min(65vh, 620px))", minHeight: 320 }}
    aria-label={explorer ? "Published park map" : "Gravesite and location map"} scrollWheelZoom zoomControl={!wideNavigation && !explorer}>
    {wideNavigation || explorer ? <><ZoomControl position="topright" /><ScaleControl imperial={false} position="bottomright" /></> : null}
    {explorer ? <ExplorerViewport data={data} position={position} explorer={explorer} />
      : <Viewport data={data} position={position} focusRequest={focusRequest} wideNavigation={wideNavigation} routeActive={routeActive} />}
    <GeoJSON key={[data.releaseId, explorer?.plots, explorer?.paths].join(":")} data={{ type: "FeatureCollection", features } as GeoJsonObject}
      style={feature => ({ color: feature?.properties?.lotId ? "#688571" : feature?.geometry.type === "LineString" ? "#aebeb6" : "#85968a", weight: feature?.geometry.type === "LineString" ? 9 : 2, fillOpacity: 0.1 })} />
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
