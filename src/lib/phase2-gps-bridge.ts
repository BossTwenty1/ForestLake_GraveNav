import { distanceMeters, usablePosition, type GpsPosition } from "./navigation-geo";
import type { Bounds } from "./phase2-planning";

// Verified Phase 2 similarity alignment between local park CAD units and EPSG:32651 (UTM Zone 51N).
const SIM_A = 0.9996082545664811;
const SIM_B = 0.0030647203398031266;
const SIM_TX = 580240.3569827238;
const SIM_TY = 1451167.9069966155;
const SIM_DET = SIM_A * SIM_A + SIM_B * SIM_B;

export const CAD_METERS_PER_UNIT = Math.hypot(SIM_A, SIM_B);
export const PARK_CENTER_WGS84 = { latitude: 13.126811, longitude: 123.741659 };
export const WEAK_GPS_ACCURACY_METERS = 15;
export const ARRIVAL_DISTANCE_METERS = 10;

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = 2 * WGS84_F - WGS84_F * WGS84_F;
const WGS84_EP2 = WGS84_E2 / (1 - WGS84_E2);
const UTM51_LON0 = 123 * DEG_TO_RAD;
const UTM_K0 = 0.9996;
const UTM_FE = 500000.0;
const UTM_FN = 0.0;

function meridionalArc(latRad: number) {
  const e2 = WGS84_E2;
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  return WGS84_A * (
    (1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * latRad
    - ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * latRad)
    + ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * latRad)
    - ((35 * e6) / 3072) * Math.sin(6 * latRad)
  );
}

function wgs84ToUtm51(latitude: number, longitude: number): [number, number] {
  const lat = latitude * DEG_TO_RAD;
  const lon = longitude * DEG_TO_RAD;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const tanLat = Math.tan(lat);

  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const T = tanLat * tanLat;
  const C = WGS84_EP2 * cosLat * cosLat;
  const A = cosLat * (lon - UTM51_LON0);
  const M = meridionalArc(lat);

  const easting = UTM_FE + UTM_K0 * N * (
    A
    + ((1 - T + C) * A ** 3) / 6
    + ((5 - 18 * T + T * T + 72 * C - 58 * WGS84_EP2) * A ** 5) / 120
  );
  const northing = UTM_FN + UTM_K0 * (
    M + N * tanLat * (
      (A * A) / 2
      + ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24
      + ((61 - 58 * T + T * T + 600 * C - 330 * WGS84_EP2) * A ** 6) / 720
    )
  );
  return [easting, northing];
}

function utm51ToWgs84(easting: number, northing: number): { latitude: number; longitude: number } {
  const x = easting - UTM_FE;
  const y = northing - UTM_FN;
  const e2 = WGS84_E2;
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  const M = y / UTM_K0;
  const mu = M / (WGS84_A * (1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

  const phi1 = mu
    + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu)
    + ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
    + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu)
    + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);

  const N1 = WGS84_A / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
  const T1 = tanPhi1 * tanPhi1;
  const C1 = WGS84_EP2 * cosPhi1 * cosPhi1;
  const R1 = (WGS84_A * (1 - e2)) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
  const D = x / (N1 * UTM_K0);

  const lat = phi1 - ((N1 * tanPhi1) / R1) * (
    (D * D) / 2
    - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * WGS84_EP2) * D ** 4) / 24
    + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * WGS84_EP2 - 3 * C1 * C1) * D ** 6) / 720
  );
  const lon = UTM51_LON0 + (
    D
    - ((1 + 2 * T1 + C1) * D ** 3) / 6
    + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * WGS84_EP2 + 24 * T1 * T1) * D ** 5) / 120
  ) / cosPhi1;

  return { latitude: lat * RAD_TO_DEG, longitude: lon * RAD_TO_DEG };
}

export function wgs84ToParkLayout(latitude: number, longitude: number): [number, number] {
  const [easting, northing] = wgs84ToUtm51(latitude, longitude);
  const dx = easting - SIM_TX;
  const dy = northing - SIM_TY;
  return [
    (SIM_A * dx + SIM_B * dy) / SIM_DET,
    (-SIM_B * dx + SIM_A * dy) / SIM_DET,
  ];
}

export function parkLayoutToWgs84(cadXY: [number, number]): { latitude: number; longitude: number } {
  const easting = SIM_A * cadXY[0] - SIM_B * cadXY[1] + SIM_TX;
  const northing = SIM_B * cadXY[0] + SIM_A * cadXY[1] + SIM_TY;
  return utm51ToWgs84(easting, northing);
}

export type ParkGpsClassification =
  | { status: "stale" }
  | { status: "outside"; distanceMeters: number; accuracyMeters: number }
  | { status: "inside"; cadXY: [number, number]; accuracyMeters: number; weakSignal: boolean };

export function classifyParkGps(
  position: GpsPosition,
  parkBounds: Bounds,
  now = Date.now(),
  marginUnits = 45,
): ParkGpsClassification {
  if (!usablePosition(position, now)) return { status: "stale" };
  const cadXY = wgs84ToParkLayout(position.latitude, position.longitude);
  const [minX, minY, maxX, maxY] = parkBounds;
  const inside =
    cadXY[0] >= minX - marginUnits &&
    cadXY[0] <= maxX + marginUnits &&
    cadXY[1] >= minY - marginUnits &&
    cadXY[1] <= maxY + marginUnits;
  const accuracyMeters = Math.max(1, Math.round(position.accuracy));
  if (!inside) {
    return {
      status: "outside",
      distanceMeters: Math.round(distanceMeters(position, PARK_CENTER_WGS84)),
      accuracyMeters,
    };
  }
  return {
    status: "inside",
    cadXY,
    accuracyMeters,
    weakSignal: position.accuracy > WEAK_GPS_ACCURACY_METERS,
  };
}
