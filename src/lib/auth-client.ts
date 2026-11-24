"use client";

import { getBrowserSupabase } from "./supabase/config";

export async function signOut() {
  const supabase = getBrowserSupabase();
  if (!supabase) return { error: new Error("Supabase is not configured") };
  return supabase.auth.signOut();
}

export type AuthCallbackResult = {
  ok: boolean;
  flowType: string;
};

let authRestorePromise: Promise<AuthCallbackResult> | null = null;

export function restoreAuthCallback(): Promise<AuthCallbackResult> {
  if (!authRestorePromise) {
    authRestorePromise = restoreSessionFromAuthUrlOnce().then((result) => {
      if (!result.ok) authRestorePromise = null;
      return result;
    });
  }
  return authRestorePromise;
}

export async function restoreSessionFromAuthUrl(): Promise<boolean> {
  return (await restoreAuthCallback()).ok;
}

async function restoreSessionFromAuthUrlOnce(): Promise<AuthCallbackResult> {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = query.get("code");
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  const flowType = (query.get("type") || hash.get("type") || "").toLowerCase();

  // Remove one-time codes, bearer tokens, and error details before any async
  // exchange can fail or the browser can retain the callback URL in history.
  window.history.replaceState({}, document.title, window.location.pathname);

  const supabase = getBrowserSupabase();
  if (!supabase) return { ok: false, flowType };

  if (hash.has("error") || query.has("error")) return { ok: false, flowType };

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { ok: false, flowType };
  } else if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) return { ok: false, flowType };
  }

  const { data: { session } } = await supabase.auth.getSession();
  return { ok: Boolean(session), flowType };
}

export function getAuthFlowType() {
  const queryType = new URLSearchParams(window.location.search).get("type")?.toLowerCase();
  const hashType = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("type")?.toLowerCase();
  return queryType || hashType || "";
}
