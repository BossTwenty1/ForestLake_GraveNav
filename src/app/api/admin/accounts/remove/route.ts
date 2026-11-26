import { staffReply } from "@/lib/supabase/staff-account-server";

export function POST() {
  return staffReply({ error: "Use Suspend access to block a staff account and preserve its history." }, 410);
}
