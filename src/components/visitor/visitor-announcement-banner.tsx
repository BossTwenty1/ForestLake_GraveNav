import { Alert } from "@/components/ui/alert";
import type { VisitorSiteSettings } from "@/lib/site-settings";

export function VisitorAnnouncementBanner({ settings }: { settings?: VisitorSiteSettings | null }) {
  if (!settings?.announcementEnabled) return null;
  const title = settings.announcementTitle.trim();
  const body = settings.announcementBody.trim();
  if (!title && !body) return null;

  return (
    <div style={{ maxWidth: 1180, margin: "12px auto 0", padding: "0 18px", width: "100%" }}>
      <Alert
        icon={settings.announcementTone === "warning" ? "alert" : settings.announcementTone === "success" ? "check" : "info"}
        title={title || "Park advisory"}
        variant={settings.announcementTone}
      >
        {body}
      </Alert>
    </div>
  );
}
