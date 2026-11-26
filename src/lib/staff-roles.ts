import type { StaffRole } from "./supabase/types";

export function isStaffRole(role: string): role is StaffRole {
  return role === "SUPER_ADMIN" || role === "ADMIN" || role === "MANAGER";
}

export function hasRequiredStaffRole(role: StaffRole, requiredRole?: StaffRole): boolean {
  if (!requiredRole) return true;
  return role === requiredRole || (role === "SUPER_ADMIN" && requiredRole === "ADMIN");
}
