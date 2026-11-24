import { PARK_ADDRESS, PARK_NAME } from "./park-details";

export type AnnouncementTone = "info" | "warning" | "success";

export type VisitorSiteSettings = {
  parkName: string;
  parkAddress: string;
  operatingHours: string;
  officePhone: string;
  officeEmail: string;
  announcementEnabled: boolean;
  announcementTitle: string;
  announcementBody: string;
  announcementTone: AnnouncementTone;
  visitorGuidelines: string;
  allowVisitorGalleryUploads: boolean;
  allowVisitorPortraitRequests: boolean;
  updatedAt: string | null;
  revision: number;
};

export const DEFAULT_VISITOR_SITE_SETTINGS: VisitorSiteSettings = {
  parkName: PARK_NAME,
  parkAddress: PARK_ADDRESS,
  operatingHours: "Open daily, 6:00 AM – 6:00 PM",
  officePhone: "",
  officeEmail: "",
  announcementEnabled: false,
  announcementTitle: "",
  announcementBody: "",
  announcementTone: "info",
  visitorGuidelines: "Keep pathways clear and respect families taking time for quiet remembrance.",
  allowVisitorGalleryUploads: true,
  allowVisitorPortraitRequests: true,
  updatedAt: null,
  revision: 1,
};

export type SiteSettingsRow = {
  park_name?: string | null;
  park_address?: string | null;
  operating_hours?: string | null;
  office_phone?: string | null;
  office_email?: string | null;
  announcement_enabled?: boolean | null;
  announcement_title?: string | null;
  announcement_body?: string | null;
  announcement_tone?: string | null;
  visitor_guidelines?: string | null;
  allow_visitor_gallery_uploads?: boolean | null;
  allow_visitor_portrait_requests?: boolean | null;
  updated_at?: string | null;
  revision?: number | null;
};

export function normalizeSiteSettings(row: SiteSettingsRow | null | undefined): VisitorSiteSettings {
  if (!row) return { ...DEFAULT_VISITOR_SITE_SETTINGS };
  const tone = row.announcement_tone === "warning" || row.announcement_tone === "success"
    ? row.announcement_tone
    : "info";
  return {
    parkName: (row.park_name || "").trim() || DEFAULT_VISITOR_SITE_SETTINGS.parkName,
    parkAddress: (row.park_address || "").trim() || DEFAULT_VISITOR_SITE_SETTINGS.parkAddress,
    operatingHours: (row.operating_hours ?? DEFAULT_VISITOR_SITE_SETTINGS.operatingHours).trim(),
    officePhone: (row.office_phone ?? "").trim(),
    officeEmail: (row.office_email ?? "").trim(),
    announcementEnabled: Boolean(row.announcement_enabled),
    announcementTitle: (row.announcement_title ?? "").trim(),
    announcementBody: (row.announcement_body ?? "").trim(),
    announcementTone: tone,
    visitorGuidelines: (row.visitor_guidelines ?? DEFAULT_VISITOR_SITE_SETTINGS.visitorGuidelines).trim(),
    allowVisitorGalleryUploads: row.allow_visitor_gallery_uploads ?? true,
    allowVisitorPortraitRequests: row.allow_visitor_portrait_requests ?? true,
    updatedAt: row.updated_at ?? null,
    revision: typeof row.revision === "number" && row.revision >= 1 ? row.revision : 1,
  };
}
