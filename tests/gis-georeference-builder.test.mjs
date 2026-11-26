import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateGeoreferencing,
  fitAffine2D,
  fitSimilarity2D,
  gridZone4ReferenceToWgs84,
  haversineMeters,
  utm51NToWgs84,
  wgs84ToUtm51N,
} from "../scripts/gis/georeference.mjs";

test("WGS84 <-> UTM Zone 51N projection round-trips within 1 mm across Albay", () => {
  const samples = [
    [123.7335123, 13.1391456],
    [123.7512345, 13.1489012],
    [123.6987654, 13.1200001],
  ];
  for (const [lon, lat] of samples) {
    const [e, n] = wgs84ToUtm51N(lon, lat);
    assert.ok(e > 550000 && e < 620000, `Unexpected easting ${e}`);
    assert.ok(n > 1440000 && n < 1470000, `Unexpected northing ${n}`);
    const [lon2, lat2] = utm51NToWgs84(e, n);
    const errM = haversineMeters([lon, lat], [lon2, lat2]);
    assert.ok(errM < 0.001, `Round-trip error ${errM}m exceeded 1 mm`);
  }
});

test("PRS92 and Luzon 1911 Zone IV reference conversions differ by ~8-9m in Albay", () => {
  const prs = gridZone4ReferenceToWgs84(580326.88, 1451631.51, "EPSG:3124");
  const luz = gridZone4ReferenceToWgs84(580326.88, 1451631.51, "EPSG:25394");
  const sep = haversineMeters(prs, luz);
  assert.ok(prs[0] > 123 && prs[0] < 124 && prs[1] > 13 && prs[1] < 14);
  assert.ok(sep > 6 && sep < 12, `Expected ~8.5 m datum separation, got ${sep.toFixed(2)} m`);
});

test("Similarity and affine solvers fit accurately and keep validation points independent", () => {
  const baseE = 580000;
  const baseN = 1451500;
  const angle = 0.25;
  const scale = 1.0;
  const truth = ([x, y]) => [
    baseE + scale * (x * Math.cos(angle) - y * Math.sin(angle)),
    baseN + scale * (x * Math.sin(angle) + y * Math.cos(angle)),
  ];

  const gcpCoords = [[10, 10], [200, 15], [190, 180], [20, 170], [110, 95]];
  const valCoords = [[60, 50], [150, 140]];

  const gcpPoints = gcpCoords.map(([cadX, cadY], i) => {
    const [longitude, latitude] = utm51NToWgs84(...truth([cadX, cadY]));
    return { pointCode: `GCP-0${i + 1}`, cadX, cadY, longitude, latitude };
  });
  const validationPoints = valCoords.map(([cadX, cadY], i) => {
    const [longitude, latitude] = utm51NToWgs84(...truth([cadX, cadY]));
    return { pointCode: `VAL-0${i + 1}`, cadX, cadY, longitude, latitude };
  });

  const sim = evaluateGeoreferencing({ gcpPoints, validationPoints, method: "similarity" });
  assert.ok(sim.metrics.fittingMaxM < 0.01);
  assert.ok(sim.metrics.validationMaxM < 0.01);

  const aff = evaluateGeoreferencing({ gcpPoints, validationPoints, method: "affine" });
  assert.ok(aff.metrics.fittingMaxM < 0.01);
  assert.ok(aff.metrics.validationMaxM < 0.01);

  assert.equal(fitSimilarity2D([{ source: [0, 0], target: [1, 2] }, { source: [1, 0], target: [2, 2] }]).parameters.scale, 1);
  assert.equal(fitAffine2D([
    { source: [0, 0], target: [5, 7] },
    { source: [1, 0], target: [6, 7] },
    { source: [0, 1], target: [5, 8] },
  ]).apply([2, 3])[0], 7);
});
