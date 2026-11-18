"use client";

import { circleMarker, geoJSON } from "leaflet";
import type { GeoJsonObject } from "geojson";
import { useEffect, useRef } from "react";
import { Circle, CircleMarker, GeoJSON, MapContainer, Polyline, Tooltip, useMap } from "react-leaflet";
import type { PhaseTwoGeography } from "@/lib/phase2-geographic";
import type { GpsPosition } from "@/lib/navigation-geo";
import { isSyntheticPlot } from "@/lib/synthetic-plots";

type Props = { data: PhaseTwoGeography; position?: GpsPosition | null; route?: [number, number][]; focusRequest?: number };
function Viewport({ data, position, focusRequest }: Props) {
  const map = useMap();
  const latest = useRef(position);
  useEffect(() => { latest.current = position; }, [position]);
  useEffect(() => {
    const bounds = data.target ? geoJSON(data.target as GeoJsonObject).getBounds() :
      geoJSON({ type: "FeatureCollection", features: data.layers.boundaries } as GeoJsonObject).getBounds();
    if (latest.current) bounds.extend([latest.current.latitude, latest.current.longitude]);
    if (data.accessPoint) {
      const [lon, lat] = data.accessPoint.geometry.coordinates as number[];
      bounds.extend([lat, lon]);
    }
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 20, animate: false });
  }, [map, data, focusRequest]);
  return null;
}
export default function PhaseTwoGeographicCanvas({ data, position = null, route = [], focusRequest = 0 }: Props) {
  const bounds = geoJSON({ type: "FeatureCollection", features: data.layers.boundaries } as GeoJsonObject).getBounds();
  const features = [...data.layers.boundaries, ...data.layers.walkways.filter(feature => feature.properties.walkingAllowed), ...data.layers.plots];
  return <MapContainer bounds={bounds} className="cemetery-leaflet-canvas" style={{ height: "var(--cemetery-map-height, min(65vh, 620px))", minHeight: 320 }}
    aria-label="Gravesite and location map" scrollWheelZoom>
    <Viewport data={data} position={position} focusRequest={focusRequest} />
    <GeoJSON key={data.releaseId} data={{ type: "FeatureCollection", features } as GeoJsonObject}
      style={feature => ({ color: feature?.properties?.lotId ? "#45654c" : "#777971", weight: 2, fillOpacity: 0.08 })} />
    {data.target ? <GeoJSON key={data.target.id} data={data.target as GeoJsonObject} style={{ color: "#b35a12", weight: 4, fillOpacity: 0.3 }}>
      <Tooltip permanent>{isSyntheticPlot(String(data.target.properties.lotCode))
        ? "Gravesite" : String(data.target.properties.lotCode)}</Tooltip>
    </GeoJSON> : null}
    {data.accessPoint ? <GeoJSON data={data.accessPoint as GeoJsonObject} pointToLayer={(_, point) => circleMarker(point, { radius: 6, color: "#285777" })}>
      <Tooltip>Gravesite approach</Tooltip>
    </GeoJSON> : null}
    {route.length > 1 ? <Polyline positions={route.map(([lon, lat]) => [lat, lon])} pathOptions={{ color: "#285777", weight: 5 }} /> : null}
    {position ? <>
      <Circle center={[position.latitude, position.longitude]} radius={position.accuracy} pathOptions={{ color: "#285777", weight: 1, fillOpacity: 0.08 }} />
      <CircleMarker center={[position.latitude, position.longitude]} radius={7} pathOptions={{ color: "#285777", fillOpacity: 1 }}>
        <Tooltip>Your location · ±{Math.round(position.accuracy)} m</Tooltip>
      </CircleMarker>
    </> : null}
  </MapContainer>;
}
