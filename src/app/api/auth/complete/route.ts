import { NextResponse } from "next/server";
import { getCurrentStaff } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await getServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const staff = await getCurrentStaff();
  if (staff?.isActive && staff.accountStatus === "ACTIVE") {
    return NextResponse.json({ destination: "/admin", role: staff.role, accountStatus: staff.accountStatus });
  }
  return NextResponse.json(
    {
      destination: staff?.accountStatus === "PENDING" ? null : "/admin/unauthorized",
      accountStatus: staff?.accountStatus ?? "UNASSIGNED",
      error: staff?.accountStatus === "PENDING"
        ? "Your password is saved. An active administrator must approve and activate your account before you can enter the workspace."
        : "An active GraveNav account is required",
    },
    { status: 403 },
  );
}
