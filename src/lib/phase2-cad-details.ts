import type { Bounds } from "./phase2-planning";

export const cadDetailRoles = ["site", "roads", "paths", "edges"] as const;
export type CadDetailRole = typeof cadDetailRoles[number];
export interface CadDetails {
  format: "gravenav-cad-details-v1";
  coordinateSystem: { type: "local-cartesian"; georeferenced: false };
  targetDataSha256: string;
  candidateCount: number;
  parkingBayCount: number;
  bounds: Bounds;
  alignment: { maxResidualUnits: number };
  sourceFiles: { name: string; sha256: string; role: string }[];
  layers: Record<CadDetailRole, { image: string; sha256: string; bytes: number; features: number }>;
  labels: { id: string; name: string; kind: "section" | "edge" | "amenity"; cadXY: [number, number] }[];
}

export const cadDetailsAssetRoot = "/phase2-planning/cad-details/";
export function validateCadDetails(value: unknown, dataDigest: string): CadDetails {
  const data = value as CadDetails;
  const fail = () => { throw new Error("The CAD detail layers do not match this Phase 2 layout."); };
  if (data?.format !== "gravenav-cad-details-v1" || data.coordinateSystem?.type !== "local-cartesian" ||
      data.coordinateSystem.georeferenced !== false || data.targetDataSha256 !== dataDigest ||
      data.candidateCount !== 4494 || data.parkingBayCount !== 81 ||
      !Array.isArray(data.bounds) || data.bounds.length !== 4 || !data.bounds.every(Number.isFinite) ||
      data.bounds[0] >= data.bounds[2] || data.bounds[1] >= data.bounds[3] ||
      !Number.isFinite(data.alignment?.maxResidualUnits) || data.alignment.maxResidualUnits < 0 || data.alignment.maxResidualUnits > .001 ||
      !Array.isArray(data.sourceFiles) || !data.sourceFiles.some(source => source && source.sha256 === "c34847dff62d973d276883c2d683a94453a274924e6379deab7531af9d8fb22c")) fail();
  for (const role of cadDetailRoles) {
    const asset = data.layers?.[role];
    if (!asset || !/^[a-f0-9]{64}$/.test(asset.sha256) || asset.image !== `${role}.${asset.sha256.slice(0, 12)}.svg` ||
        !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || !Number.isSafeInteger(asset.features) || asset.features < 1) fail();
  }
  const ids = new Set<string>();
  if (!Array.isArray(data.labels) || data.labels.length < 5 || data.labels.length > 32) fail();
  for (const label of data.labels) {
    if (!label || typeof label.id !== "string" || ids.has(label.id) ||
        typeof label.name !== "string" || !label.name.trim() || label.name.length > 80 ||
        !["section", "edge", "amenity"].includes(label.kind) || !Array.isArray(label.cadXY) ||
        label.cadXY.length !== 2 || !label.cadXY.every(Number.isFinite)) fail();
    ids.add(label.id);
  }
  return data;
}
