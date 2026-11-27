import type { Database as GeneratedDatabase } from "./database.types";
import type {
  AccountDeletionFinish,
  AccountDeletionStart,
  InvitationAttempt,
  InvitationReceipt,
  StaffAccountDetails,
  StaffDirectory,
} from "../staff-account-access";

// PostgreSQL introspection does not describe nullable function arguments.
// The versioned save RPC deliberately accepts null for a new record.
type Functions = GeneratedDatabase["public"]["Functions"];
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedDatabase["public"], "Functions"> & {
    Functions: Omit<Functions, "staff_save_record"> & {
      can_manage_staff_accounts: { Args: Record<string, never>; Returns: boolean };
      can_permanently_delete_staff_accounts: { Args: Record<string, never>; Returns: boolean };
      staff_begin_account_deletion: {
        Args: { p_actor: string; p_account_id: string; p_revision: number };
        Returns: AccountDeletionStart;
      };
      staff_finish_account_deletion: {
        Args: { p_actor: string; p_account_id: string; p_attempt_id: string; p_auth_deleted: boolean };
        Returns: AccountDeletionFinish;
      };
      staff_account_directory: {
        Args: { p_search?: string; p_role?: string; p_status?: string; p_page?: number };
        Returns: StaffDirectory;
      };
      staff_account_details: {
        Args: { p_account_id: string };
        Returns: StaffAccountDetails;
      };
      record_staff_password_setup: {
        Args: { p_account_id: string };
        Returns: undefined;
      };
      staff_grant_account: {
        Args: { p_account_id: string; p_revision: number };
        Returns: undefined;
      };
      staff_begin_invitation: {
        Args: { p_actor: string; p_email?: string; p_username?: string; p_role?: string; p_account_id?: string; p_revision?: number };
        Returns: InvitationAttempt;
      };
      staff_finish_invitation: {
        Args: { p_actor: string; p_invitation_id: string; p_attempt_id: string; p_sent: boolean; p_user_id?: string };
        Returns: InvitationReceipt;
      };
      staff_save_record: Omit<Functions["staff_save_record"], "Args"> & {
        Args: Omit<Functions["staff_save_record"]["Args"], "p_id" | "p_revision"> & { p_id: string | null; p_revision: number | null };
      };
    };
  };
};
