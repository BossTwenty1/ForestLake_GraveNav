import type { AccountStatus, StaffRole } from "./supabase/types";

export type StaffDirectoryEntry = {
  accountId: string;
  username: string;
  email: string | null;
  role: StaffRole;
  status: Exclude<AccountStatus, "REVOKED"> | "DELETING";
  revision: number;
  createdAt: string;
  lastSignInAt: string | null;
  invitedAt: string | null;
  setupReady: boolean;
  emailVerified: boolean;
  canResend: boolean;
  canRecover: boolean;
  deletionPending?: boolean;
  canDelete?: boolean;
};

export type AccountDeletionStart =
  | { state: "completed"; accountId: string; revision: number }
  | { state: "deleting"; accountId: string; revision: number }
  | { state: "delete_auth"; accountId: string; attemptId: string; revision: number; hasAuthUser: boolean };

export type AccountDeletionFinish = {
  state: "completed" | "auth_failed";
  accountId: string;
  revision: number;
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
