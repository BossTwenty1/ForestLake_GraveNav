import "server-only";
import { NextResponse } from "next/server";
import { getCurrentStaff } from "@/lib/auth";
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
  return staff?.isActive && staff.accountStatus === "ACTIVE" && staff.role === "ADMIN" ? staff : null;
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
