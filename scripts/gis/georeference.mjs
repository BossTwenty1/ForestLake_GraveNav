/**
 * Deterministic Phase 2 georeferencing math and projection helpers.
 *
 * - Converts between WGS84 (EPSG:4326) and UTM Zone 51N (EPSG:32651) with
 *   sub-millimeter accuracy using the WGS84 ellipsoid.
 * - Fits 2D conformal similarity (Helmert) or affine transforms from local CAD
 *   coordinates into EPSG:32651 meters using ONLY `GCP` fitting points.
 * - Measures independent held-out errors in meters on `VALIDATION` points
 *   (strictly excluded from fitting).
 * - Never labels imagery-derived points as verified field survey observations.
 */

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// WGS84 ellipsoid constants
const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = 2 * WGS84_F - WGS84_F * WGS84_F;
const WGS84_EP2 = WGS84_E2 / (1 - WGS84_E2);

// Clarke 1866 ellipsoid constants (used by PRS92 EPSG:3124 and Luzon 1911 EPSG:25394)
const CLARKE_A = 6378206.4;
const CLARKE_F = 1 / 294.9786982138982;
const CLARKE_E2 = 2 * CLARKE_F - CLARKE_F * CLARKE_F;
const CLARKE_EP2 = CLARKE_E2 / (1 - CLARKE_E2);

const UTM51_LON0 = 123 * DEG_TO_RAD;
const UTM_K0 = 0.9996;
const UTM_FE = 500000.0;
const UTM_FN = 0.0;

// Philippine Zone IV Transverse Mercator (Central Meridian 123°E, k0 = 0.99995, FE = 500000)
const PH_ZONE4_LON0 = 123 * DEG_TO_RAD;
const PH_ZONE4_K0 = 0.99995;
const PH_ZONE4_FE = 500000.0;
const PH_ZONE4_FN = 0.0;

function meridionalArc(latRad, a, e2) {
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  return a * (
    (1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * latRad
    - ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * latRad)
    + ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * latRad)
    - ((35 * e6) / 3072) * Math.sin(6 * latRad)
  );
}

function tmForward(lonDeg, latDeg, a, e2, ep2, lon0, k0, fe, fn) {
  const lat = latDeg * DEG_TO_RAD;
  const lon = lonDeg * DEG_TO_RAD;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const tanLat = Math.tan(lat);

  const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  const T = tanLat * tanLat;
  const C = ep2 * cosLat * cosLat;
  const A = cosLat * (lon - lon0);
  const M = meridionalArc(lat, a, e2);

  const easting = fe + k0 * N * (
    A
    + ((1 - T + C) * A ** 3) / 6
    + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120
  );
  const northing = fn + k0 * (
    M + N * tanLat * (
      (A * A) / 2
      + ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24
      + ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720
    )
  );
  return [easting, northing];
}

function tmInverse(easting, northing, a, e2, ep2, lon0, k0, fe, fn) {
  const x = easting - fe;
  const y = northing - fn;
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  const M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

  const phi1 = mu
    + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu)
    + ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
    + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu)
    + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const sin1 = Math.sin(phi1);
  const cos1 = Math.cos(phi1);
  const tan1 = Math.tan(phi1);
  const N1 = a / Math.sqrt(1 - e2 * sin1 * sin1);
  const T1 = tan1 * tan1;
  const C1 = ep2 * cos1 * cos1;
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sin1 * sin1, 1.5);
  const D = x / (N1 * k0);

  const lat = phi1 - ((N1 * tan1) / R1) * (
    (D * D) / 2
    - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24
    + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720
  );
  const lon = lon0 + (
    D
    - ((1 + 2 * T1 + C1) * D ** 3) / 6
    + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120
  ) / cos1;

  return [lon * RAD_TO_DEG, lat * RAD_TO_DEG];
}

function geodeticToEcef(lonDeg, latDeg, a, e2) {
  const lat = latDeg * DEG_TO_RAD;
  const lon = lonDeg * DEG_TO_RAD;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  return [N * cosLat * Math.cos(lon), N * cosLat * Math.sin(lon), N * (1 - e2) * sinLat];
}

function ecefToGeodetic(X, Y, Z, a, e2) {
  const lon = Math.atan2(Y, X);
  const p = Math.hypot(X, Y);
  let lat = Math.atan2(Z, p * (1 - e2));
  for (let i = 0; i < 10; i += 1) {
    const sinLat = Math.sin(lat);
    const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
    lat = Math.atan2(Z + e2 * N * sinLat, p);
  }
  return [lon * RAD_TO_DEG, lat * RAD_TO_DEG];
}

function helmert7ToWgs84(lonDeg, latDeg, { dx, dy, dz, rxArcSec = 0, ryArcSec = 0, rzArcSec = 0, dsPpm = 0 }) {
  const [X, Y, Z] = geodeticToEcef(lonDeg, latDeg, CLARKE_A, CLARKE_E2);
  const arcSecToRad = Math.PI / (180 * 3600);
  const rx = rxArcSec * arcSecToRad;
  const ry = ryArcSec * arcSecToRad;
  const rz = rzArcSec * arcSecToRad;
  const s = 1 + dsPpm * 1e-6;
  // Position Vector convention (EPSG:9606)
  const X2 = dx + s * (X - rz * Y + ry * Z);
  const Y2 = dy + s * (rz * X + Y - rx * Z);
  const Z2 = dz + s * (-ry * X + rx * Y + Z);
  return ecefToGeodetic(X2, Y2, Z2, WGS84_A, WGS84_E2);
}

export function wgs84ToUtm51N(lonDeg, latDeg) {
  return tmForward(lonDeg, latDeg, WGS84_A, WGS84_E2, WGS84_EP2, UTM51_LON0, UTM_K0, UTM_FE, UTM_FN);
}

export function utm51NToWgs84(easting, northing) {
  return tmInverse(easting, northing, WGS84_A, WGS84_E2, WGS84_EP2, UTM51_LON0, UTM_K0, UTM_FE, UTM_FN);
}

/**
 * Reference-only conversion from Philippine Zone IV grid coordinates to WGS84
 * under PRS92 (EPSG:3124) or Luzon 1911 (EPSG:25394) hypotheses.
 * Used strictly as pre-survey search hints — NEVER as verified navigation GPS.
 */
export function gridZone4ReferenceToWgs84(easting, northing, hypothesis = "EPSG:3124") {
  const [clarkeLon, clarkeLat] = tmInverse(
    easting, northing, CLARKE_A, CLARKE_E2, CLARKE_EP2, PH_ZONE4_LON0, PH_ZONE4_K0, PH_ZONE4_FE, PH_ZONE4_FN,
  );
  if (hypothesis === "EPSG:3124") {
    // EPSG:15708 PRS92 -> WGS84 (7-parameter Position Vector)
    return helmert7ToWgs84(clarkeLon, clarkeLat, {
      dx: -127.62, dy: -67.24, dz: -47.04,
      rxArcSec: -3.068, ryArcSec: 4.903, rzArcSec: 1.578, dsPpm: -1.06,
    });
  }
  // EPSG:1161 Luzon 1911 -> WGS84 (3-parameter geocentric translation, Philippines excluding Mindanao)
  return helmert7ToWgs84(clarkeLon, clarkeLat, { dx: -133, dy: -77, dz: -51 });
}

export function haversineMeters([lon1, lat1], [lon2, lat2]) {
  const R = 6371008.8;
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Fits a 2D conformal similarity transform (Helmert: scale, rotation, translation):
 *   E = a * x - b * y + tx
 *   N = b * x + a * y + ty
 */
export function fitSimilarity2D(pairs) {
  if (!Array.isArray(pairs) || pairs.length < 2) {
    throw new Error("At least 2 control point pairs are required for a 2D similarity transform");
  }
  const n = pairs.length;
  let sx = 0; let sy = 0; let sE = 0; let sN = 0;
  for (const { source: [x, y], target: [E, N] } of pairs) {
    sx += x; sy += y; sE += E; sN += N;
  }
  const mx = sx / n; const my = sy / n; const mE = sE / n; const mN = sN / n;

  let denom = 0; let numA = 0; let numB = 0;
  for (const { source: [x, y], target: [E, N] } of pairs) {
    const dx = x - mx; const dy = y - my;
    const dE = E - mE; const dN = N - mN;
    denom += dx * dx + dy * dy;
    numA += dx * dE + dy * dN;
    numB += dx * dN - dy * dE;
  }
  if (denom <= 1e-12) throw new Error("Degenerate control points: collinear or identical source coordinates");

  const a = numA / denom;
  const b = numB / denom;
  const tx = mE - (a * mx - b * my);
  const ty = mN - (b * mx + a * my);
  const scale = Math.hypot(a, b);
  const rotationDeg = Math.atan2(b, a) * RAD_TO_DEG;

  return {
    method: "helmert_similarity_2d",
    parameters: { a, b, tx, ty, scale, rotationDeg },
    apply: ([x, y]) => [a * x - b * y + tx, b * x + a * y + ty],
  };
}

/**
 * Fits a general 2D 6-parameter affine transform:
 *   E = a * x + b * y + tx
 *   N = c * x + d * y + ty
 */
export function fitAffine2D(pairs) {
  if (!Array.isArray(pairs) || pairs.length < 3) {
    throw new Error("At least 3 control point pairs are required for a 2D affine transform");
  }
  let sxx = 0; let sxy = 0; let syy = 0; let sx = 0; let sy = 0;
  let sxE = 0; let syE = 0; let sE = 0;
  let sxN = 0; let syN = 0; let sN = 0;
  const n = pairs.length;
  for (const { source: [x, y], target: [E, N] } of pairs) {
    sxx += x * x; sxy += x * y; syy += y * y; sx += x; sy += y;
    sxE += x * E; syE += y * E; sE += E;
    sxN += x * N; syN += y * N; sN += N;
  }
  const M = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, n],
  ];
  const [a, b, tx] = solve3x3(M, [sxE, syE, sE]);
  const [c, d, ty] = solve3x3(M, [sxN, syN, sN]);
  return {
    method: "affine_2d",
    parameters: { a, b, tx, c, d, ty },
    apply: ([x, y]) => [a * x + b * y + tx, c * x + d * y + ty],
  };
}

function solve3x3(A, rhs) {
  const m = A.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < 3; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < 3; row += 1) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) throw new Error("Control points are collinear or singular");
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const div = m[col][col];
    for (let j = col; j < 4; j += 1) m[col][j] /= div;
    for (let row = 0; row < 3; row += 1) {
      if (row === col) continue;
      const factor = m[row][col];
      for (let j = col; j < 4; j += 1) m[row][j] -= factor * m[col][j];
    }
  }
  return [m[0][3], m[1][3], m[2][3]];
}

/**
 * Evaluates a fitted CAD -> EPSG:32651 -> EPSG:4326 transform across both
 * fitting (`GCP`) and independent held-out (`VALIDATION`) points.
 */
export function evaluateGeoreferencing({ gcpPoints, validationPoints, method = "similarity" }) {
  if (gcpPoints.length < 3) {
    throw new Error("At least 3 GCP fitting points are required");
  }
  if (validationPoints.length < 1) {
    throw new Error("At least 1 independent VALIDATION checkpoint is required");
  }

  const gcpPairs = gcpPoints.map((pt) => ({
    pointCode: pt.pointCode,
    source: [pt.cadX, pt.cadY],
    target: wgs84ToUtm51N(pt.longitude, pt.latitude),
    lonLat: [pt.longitude, pt.latitude],
  }));
  const transform = method === "affine" ? fitAffine2D(gcpPairs) : fitSimilarity2D(gcpPairs);

  const fittingResiduals = gcpPairs.map((pair) => {
    const predictedUtm = transform.apply(pair.source);
    const predictedLonLat = utm51NToWgs84(predictedUtm[0], predictedUtm[1]);
    const residualM = Math.hypot(predictedUtm[0] - pair.target[0], predictedUtm[1] - pair.target[1]);
    return { pointCode: pair.pointCode, residualM, predictedLonLat };
  });

  const validationResults = validationPoints.map((pt) => {
    const targetUtm = wgs84ToUtm51N(pt.longitude, pt.latitude);
    const predictedUtm = transform.apply([pt.cadX, pt.cadY]);
    const predictedLonLat = utm51NToWgs84(predictedUtm[0], predictedUtm[1]);
    const errorM = Math.hypot(predictedUtm[0] - targetUtm[0], predictedUtm[1] - targetUtm[1]);
    return {
      pointCode: pt.pointCode,
      errorM,
      observedLonLat: [pt.longitude, pt.latitude],
      predictedLonLat,
    };
  });

  const rmse = (values) => Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length);
  const fitErrors = fittingResiduals.map((r) => r.residualM);
  const valErrors = validationResults.map((r) => r.errorM);

  return {
    method: transform.method,
    parameters: transform.parameters,
    cadToUtm51N: transform.apply,
    cadToWgs84: (xy) => {
      const [e, n] = transform.apply(xy);
      return utm51NToWgs84(e, n);
    },
    fittingResiduals,
    validationResults,
    metrics: {
      gcpCount: gcpPoints.length,
      validationCount: validationPoints.length,
      fittingRmseM: rmse(fitErrors),
      fittingMaxM: Math.max(...fitErrors),
      validationRmseM: rmse(valErrors),
      validationMaxM: Math.max(...valErrors),
    },
  };
}
