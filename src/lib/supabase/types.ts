export type StaffRole = "ADMIN" | "MANAGER";
export type AccountStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "REVOKED";

export type StaffAccount = {
  accountId: string;
  username: string;
  role: StaffRole;
  accountStatus: AccountStatus;
  isActive: boolean;
};

export type PublicBurialRecord = {
  matchType?: "exact" | "matched" | "similar";
  id: string;
  name: string;
  birthDate: string | null;
  deathDate: string | null;
  dates: string;
  plot: string;
  plotLabel: string;
  syntheticPlotReference?: string | null;
  gravesiteReference?: string | null;
  section: string;
  row: string;
  burialDate: string;
  status: "Active" | "Pending" | "Archived";
  location: { latitude: number; longitude: number } | null;
  pixelLocation: { x: number; y: number } | null;
  coordinateStatus: "missing" | "pending" | "verified" | "rejected";
  locationVerified: boolean;
  tone: string;
};

export type GraveType = "regular" | "mausoleum";

export type AdminRecord = {
  lotRemoved?: boolean;
  syntheticPlotReference?: string | null;
  revision: number;
  burialId: number;
  name: string;
  deceasedId: number;
  lotId: number;
  plot: string;
  section: string;
  recordStatus: "active" | "pending" | "archived";
  birthDate: string | null;
  deathDate: string | null;
  publicDisplay: boolean;
  intermentDate: string | null;
  intermentStatus: string;
  remainsType: string;
  referenceNo: string | null;
  intermentOrderNumber?: string | null;
  intermentConfirmed?: boolean | null;
  serviceProvider: string | null;
  recordSource: string | null;
  qualityNotes: string | null;
  updatedAt: string;
  location: { latitude: number; longitude: number } | null;
  pixelLocation: { x: number; y: number } | null;
  coordinateStatus: "pending" | "verified" | "rejected";
  coordinateVerified: boolean;
};

export type AdminLot = {
  revision: number;
  lotId: number;
  lotCode: string;
  areaId: number;
  blockId: number | null;
  lotOwnerId: number | null;
  legacyLocationCode: string | null;
  legacyPaNumber: string | null;
  status: "UNKNOWN" | "AVAILABLE" | "BOOKED" | "HOLD";
  lengthM: number | null;
  widthM: number | null;
  pxLocX: number | null;
  pxLocY: number | null;
  coordinateStatus: "pending" | "verified" | "rejected";
  coordinateVerified: boolean;
  coordinateRejectionReason: string | null;
  coordinateAccuracyM: number | null;
  location: { longitude: number; latitude: number } | null;
  updatedAt: string;
};

export type PlotOperationalState = "unknown" | "available" | "occupied" | "booked" | "hold";
export type PlotCoordinateState = "missing" | "pending" | "verified" | "rejected";

export type PlotManagementItem = AdminLot & {
  syntheticPlotReference?: string | null;
  graveType?: GraveType | null;
  gravePolicyReference?: string | null;
  approvedMausoleumCapacity?: number | null;
  confirmedCount?: number;
  remainingInterments?: number;
  interments?: { id: number; name: string; status: AdminRecord["recordStatus"]; confirmed: boolean | null; removed: boolean }[];
  areaCode: string | null;
  areaName: string | null;
  operationalState: PlotOperationalState;
  coordinateState: PlotCoordinateState;
  assignedBurialId: number | null;
  assignedDeceasedName: string | null;
  assignedBurialDeleted: boolean;
};

export type PlotManagementSummary = {
  syntheticPlots?: number;
  total: number;
  occupied: number;
  available: number;
  booked: number;
  onHold: number;
  unknown: number;
  needsVerification: number;
};

export type CoordinateVerificationEvent = {
  auditId: number;
  event: "submitted" | "updated" | "verified" | "rejected";
  actorName: string | null;
  reason: string | null;
  createdAt: string;
};

export type CoordinateVerificationItem = {
  revision: number;
  lotId: number;
  lotCode: string;
  areaId: number;
  areaCode: string | null;
  areaName: string | null;
  coordinateState: PlotCoordinateState;
  location: { longitude: number; latitude: number } | null;
  coordinateAccuracyM: number | null;
  coordinateStatus: "pending" | "verified" | "rejected";
  coordinateVerified: boolean;
  rejectionReason: string | null;
  updatedAt: string;
  assignedBurialId: number | null;
  assignedDeceasedName: string | null;
  assignedBurialDeleted: boolean;
  history: CoordinateVerificationEvent[];
};

export type CoordinateVerificationSummary = {
  needsVerification: number;
  missing: number;
  pending: number;
  rejected: number;
  verified: number;
};

export type LotOwner = {
  revision: number;
  lotOwnerId: number;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  aliases: string | null;
  address: string;
  representativeName: string | null;
  representativeContact: string | null;
  representativeRelation: string | null;
};

export type PlotAreaOption = {
  areaId: number;
  areaCode: string;
  label: string;
};

export type BurialPlotOption = {
  lotId: number;
  lotCode: string;
  section: string;
  status: "AVAILABLE";
  graveType: GraveType | null;
  confirmedCount: number;
  remaining: number;
};

export type AdminAccount = StaffAccount & {
  revision: number;
  createdAt: string;
  approvedAt: string | null;
};

export type AuditLogEntry = {
  audit_id: number;
  actor_account_id: string | null;
  action: string;
  table_name: string;
  record_id: string;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  created_at: string;
};

export type DashboardData = {
  summary: {
    syntheticPlots?: number;
    totalBurialRecords: number;
    occupiedPlots: number;
    availablePlots: number;
    needsVerification: number;
  };
  burialsBySection: {
    areaId: number;
    areaName: string;
    burialCount: number;
  }[];
  occupancy: {
    occupied: number;
    available: number;
    booked: number;
    onHold: number;
    unknown: number;
    total: number;
    occupancyPercent: number;
  };
  recentChanges: {
    auditId: number;
    label: string;
    subject: string | null;
    plotCode: string | null;
    createdAt: string;
  }[];
  verificationItems: {
    lotId: number;
    plot: string;
    issue: string;
    status: "missing" | "pending" | "rejected";
    rejectionReason: string | null;
    updatedAt: string;
  }[];
};

export type AdminPhoto = {
  revision: number;
  photoId: number;
  burialId: number;
  fileName: string;
  caption: string | null;
  capturedAt: string | null;
  approvalStatus: "pending" | "approved" | "rejected";
  publicDisplay: boolean;
  createdAt: string;
};
