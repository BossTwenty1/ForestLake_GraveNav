import "server-only";
import { NextResponse } from "next/server";
import { getCurrentStaff } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { localSupabaseConfig, publicAppOrigin } from "./config";

export const staffAccountIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function isStaffJsonRequest(request: Request) {
  const origin = request.headers.get("origin");
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  const requestUrl = new URL(request.url);
  const localHost = request.headers.get("host");
  const localOrigin = localSupabaseConfig.environment === "local" &&
    requestUrl.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(requestUrl.hostname) &&
    ["localhost", "127.0.0.1"].some(host => localHost === `${host}:${requestUrl.port}`) &&
    origin === `http://${localHost}`;
  return (!origin || origin === requestUrl.origin || localOrigin) && mediaType === "application/json";
}

export function staffReply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

export async function activeStaffAdministrator() {
  const staff = await getCurrentStaff();
  if (!staff?.isActive || staff.accountStatus !== "ACTIVE") return null;
  const client = await getServerSupabase();
  if (!client) return null;
  const { data, error } = await client.rpc("can_manage_staff_accounts");
  // Keep the existing ADMIN workflow until the matching migration is installed.
  if (error?.code === "PGRST202") return staff.role === "ADMIN" ? staff : null;
  return !error && data === true ? staff : null;
}

export function staffEmailCallback(type: "invite" | "recovery") {
  const url = new URL("/auth/callback", publicAppOrigin);
  if (localSupabaseConfig.environment === "hosted" &&
      (url.protocol !== "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
    return null;
  }
  url.searchParams.set("type", type);
  return url.href;
}
