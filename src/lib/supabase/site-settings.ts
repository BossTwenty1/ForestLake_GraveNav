import "server-only";

import { unstable_cache } from "next/cache";
import {
  DEFAULT_VISITOR_SITE_SETTINGS,
  normalizeSiteSettings,
  type SiteSettingsRow,
  type VisitorSiteSettings,
} from "@/lib/site-settings";
import { getPublicSupabase } from "./config";

const SITE_SETTINGS_COLUMNS =
  "park_name,park_address,operating_hours,office_phone,office_email,announcement_enabled,announcement_title,announcement_body,announcement_tone,visitor_guidelines,allow_visitor_gallery_uploads,allow_visitor_portrait_requests,updated_at,revision";

type SiteSettingsDatabase = {
  public: {
    Tables: {
      site_settings: {
        Row: SiteSettingsRow & { setting_id: number };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};

export async function fetchPublicSiteSettingsUncached(): Promise<{
  settings: VisitorSiteSettings;
  tableReady: boolean;
}> {
  const client = getPublicSupabase<SiteSettingsDatabase>();
  if (!client) {
    return { settings: { ...DEFAULT_VISITOR_SITE_SETTINGS }, tableReady: false };
  }
  try {
    const { data, error } = await client
      .from("site_settings")
      .select(SITE_SETTINGS_COLUMNS)
      .eq("setting_id", 1)
      .maybeSingle();
    if (error) {
      return { settings: { ...DEFAULT_VISITOR_SITE_SETTINGS }, tableReady: false };
    }
    return { settings: normalizeSiteSettings(data), tableReady: true };
  } catch {
    return { settings: { ...DEFAULT_VISITOR_SITE_SETTINGS }, tableReady: false };
  }
}

export const getCachedPublicSiteSettings = unstable_cache(
  async (): Promise<VisitorSiteSettings> => {
    const { settings } = await fetchPublicSiteSettingsUncached();
    return settings;
  },
  ["public-visitor-site-settings"],
  { revalidate: 60, tags: ["site-settings"] },
);
