import type { AccountStatus, StaffRole } from "./supabase/types";

export type StaffDirectoryEntry = {
  accountId: string;
  username: string;
  email: string | null;
  role: StaffRole;
  status: Exclude<AccountStatus, "REVOKED">;
  revision: number;
  createdAt: string;
  lastSignInAt: string | null;
  invitedAt: string | null;
  setupReady: boolean;
  emailVerified: boolean;
  canResend: boolean;
  canRecover: boolean;
};

export type StaffDirectory = {
  summary: { total: number; active: number; pending: number; suspended: number };
  total: number;
  items: StaffDirectoryEntry[];
};

export type StaffAccountDetails = {
  account: StaffDirectoryEntry;
  activity: {
    id: number;
    action: string;
    at: string;
    actor: string;
    fromStatus: AccountStatus | null;
    toStatus: AccountStatus | null;
    fromRole: StaffRole | null;
    toRole: StaffRole | null;
  }[];
};

export type InvitationAttempt =
  | { state: "sent"; accountId: string }
  | { state: "sending" }
  | { state: "send"; id: string; attemptId: string; email: string };

export type InvitationReceipt = { state: "sent" | "failed"; accountId: string | null };
