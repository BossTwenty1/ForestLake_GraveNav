"use client";

import { circleMarker, geoJSON } from "leaflet";
import type { GeoJsonObject } from "geojson";
import { GeoJSON, MapContainer, Tooltip } from "react-leaflet";
import type { PhaseTwoGeography } from "@/lib/phase2-geographic";

export default function PhaseTwoGeographicCanvas({ data }: { data: PhaseTwoGeography }) {
  const bounds = geoJSON({ type: "FeatureCollection", features: data.layers.boundaries } as GeoJsonObject).getBounds();
  const features = [...data.layers.boundaries, ...data.layers.walkways.filter(feature => feature.properties.walkingAllowed), ...data.layers.plots];
  return <MapContainer bounds={bounds} className="cemetery-leaflet-canvas" style={{ height: "min(65vh, 620px)", minHeight: 320 }} aria-label="Published Phase 2 geographic map" scrollWheelZoom>
    <GeoJSON key={data.releaseId} data={{ type: "FeatureCollection", features } as GeoJsonObject}
      style={feature => ({ color: feature?.properties?.lotId ? "#45654c" : "#777971", weight: 2, fillOpacity: 0.08 })} />
    {data.target ? <GeoJSON key={data.target.id} data={data.target as GeoJsonObject} style={{ color: "#b35a12", weight: 4, fillOpacity: 0.3 }}>
      <Tooltip permanent>{String(data.target.properties.lotCode)}</Tooltip>
    </GeoJSON> : null}
    {data.accessPoint ? <GeoJSON data={data.accessPoint as GeoJsonObject} pointToLayer={(_, point) => circleMarker(point, { radius: 6, color: "#285777" })}><Tooltip>Reviewed walking access point</Tooltip></GeoJSON> : null}
  </MapContainer>;
}
