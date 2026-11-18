export interface PlotCoordinateReference {
  instancePath: string;
  lpcsInstancePath: string;
  gridInstancePath: string;
  lpcsCenter: [number, number];
  gridCenter: [number, number];
}

export interface PlotCoordinateReferences {
  format: "gravenav-plot-coordinate-references-v1";
  status: "cad-reference-only";
  sourceDatum: "unresolved";
  geographicApproved: false;
  coordinateUnits: "source-drawing-units";
  targetDataSha256: string;
  sourceHashes: { lpcs: string; grid: string; controlEvidence: string };
  candidateCount: number;
  alignment: {
    controlPairCount: number;
    maxCentroidResidualUnits: number;
    maxLocalPolygonResidualUnits: number;
    maxGridPolygonResidualUnits: number;
  };
  entries: Record<string, PlotCoordinateReference>;
}

export function validatePlotCoordinates(value: unknown, geometrySha256: string,
  targets: readonly { id: string; properties: { instance_path?: string | null } }[]): PlotCoordinateReferences {
  const data = value as PlotCoordinateReferences;
  const fail = () => { throw new Error("The plot coordinate references do not match this CAD layout. Restore the matching local map files."); };
  const pair = (p: unknown) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  const residual = (r: unknown) => typeof r === "number" && Number.isFinite(r) && r >= 0 && r < 0.001;
  const sourcePath = (p: unknown) => typeof p === "string" && p.length < 300 && /^\d+(?:\/\d+)+$/.test(p);
  if (data?.format !== "gravenav-plot-coordinate-references-v1" || data.status !== "cad-reference-only" ||
      data.sourceDatum !== "unresolved" || data.geographicApproved !== false || data.coordinateUnits !== "source-drawing-units" ||
      data.targetDataSha256 !== geometrySha256 || data.candidateCount !== 4494 || targets.length !== 4494 ||
      data.sourceHashes?.lpcs !== "c34847dff62d973d276883c2d683a94453a274924e6379deab7531af9d8fb22c" ||
      data.sourceHashes?.grid !== "27090b58f56453429c8df661197142c7a3df45b659991656e485643f064f0964" ||
      !/^[a-f0-9]{64}$/.test(data.sourceHashes?.controlEvidence ?? "") ||
      data.alignment?.controlPairCount !== 7 || !residual(data.alignment?.maxCentroidResidualUnits) ||
      !residual(data.alignment?.maxLocalPolygonResidualUnits) || !residual(data.alignment?.maxGridPolygonResidualUnits) ||
      !data.entries || typeof data.entries !== "object" || Array.isArray(data.entries) || Object.keys(data.entries).length !== 4494) fail();
  const ids = new Set<string>();
  for (const target of targets) {
    const entry = Object.hasOwn(data.entries, target.id) ? data.entries[target.id] : null;
    if (ids.has(target.id) || !entry || entry.instancePath !== target.properties.instance_path ||
        !sourcePath(entry.lpcsInstancePath) || !sourcePath(entry.gridInstancePath) ||
        !pair(entry.lpcsCenter) || !pair(entry.gridCenter)) fail();
    ids.add(target.id);
  }
  return data;
}
