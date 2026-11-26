"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AdminPageFrame } from "./admin-page-content";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AnnouncementTone, VisitorSiteSettings } from "@/lib/site-settings";
import styles from "./visitor-site-settings.module.css";

export function VisitorSiteSettingsEditor({
  initialSettings,
  tableReady,
}: {
  initialSettings: VisitorSiteSettings;
  tableReady: boolean;
}) {
  const [form, setForm] = useState<VisitorSiteSettings>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function setField<K extends keyof VisitorSiteSettings>(key: K, value: VisitorSiteSettings[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError("");
    setMessage("");
    if (!form.parkName.trim() || !form.parkAddress.trim()) {
      setError("Park name and park address are required.");
      return;
    }
    if (form.officeEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.officeEmail.trim())) {
      setError("Enter a valid office email address, or leave the field blank.");
      return;
    }
    if (form.announcementEnabled && !form.announcementTitle.trim() && !form.announcementBody.trim()) {
      setError("Enter an announcement title or message before enabling the visitor banner.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/admin/site-settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        settings?: VisitorSiteSettings;
        error?: string;
      };
      if (!response.ok || !payload.settings) {
        setError(payload.error || "Visitor site settings could not be saved.");
        return;
      }
      setForm(payload.settings);
      setMessage("Visitor site settings saved and published immediately to all visitor pages.");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPageFrame
      title="Visitor Site Settings"
      description="Dynamically control park hours, office contact info, visitor advisories, and public photo submission rules without developer edits."
      actions={
        <Link className="button button--secondary button--md" href="/">
          View Visitor Homepage
        </Link>
      }
    >
      {!tableReady ? (
        <Alert icon="info" title="Database migration pending" variant="warning">
          Showing default Forest Lake values. Apply migration <code>20261124060000_visitor_site_settings_and_admin_hardening.sql</code> to Supabase to persist dynamic edits live.
        </Alert>
      ) : null}
      {error ? <Alert icon="alert" title="Could not save settings" variant="danger">{error}</Alert> : null}
      {message ? <div role="status"><Alert icon="check" title="Settings published" variant="success">{message}</Alert></div> : null}

      <form className={styles.stack} noValidate onSubmit={(e) => void submit(e)}>
        <Card>
          <CardHeader>
            <CardTitle>Park identity, hours &amp; contact</CardTitle>
            <Badge variant="info">Shown on Visitor Homepage &amp; Memorials</Badge>
          </CardHeader>
          <CardContent>
            <div className="admin-form">
              <div className="filter-grid">
                <Input
                  label="Park name *"
                  maxLength={140}
                  onChange={(e) => setField("parkName", e.target.value)}
                  required
                  value={form.parkName}
                />
                <Input
                  label="Operating hours"
                  maxLength={160}
                  onChange={(e) => setField("operatingHours", e.target.value)}
                  placeholder="e.g. Open daily, 6:00 AM – 6:00 PM"
                  value={form.operatingHours}
                />
              </div>
              <Input
                label="Park address *"
                maxLength={240}
                onChange={(e) => setField("parkAddress", e.target.value)}
                required
                value={form.parkAddress}
              />
              <div className="filter-grid">
                <Input
                  label="Office phone (optional)"
                  maxLength={80}
                  onChange={(e) => setField("officePhone", e.target.value)}
                  placeholder="e.g. (052) 480-1234 / +63 917 000 0000"
                  value={form.officePhone}
                />
                <Input
                  label="Office email (optional)"
                  maxLength={120}
                  onChange={(e) => setField("officeEmail", e.target.value)}
                  placeholder="e.g. legazpi@forestlake.ph"
                  type="email"
                  value={form.officeEmail}
                />
              </div>
              <label className="input-field" htmlFor="visitor-guidelines">
                <span className="input-label">Grounds courtesy &amp; visitor guidelines</span>
                <textarea
                  className="input-control"
                  id="visitor-guidelines"
                  maxLength={400}
                  onChange={(e) => setField("visitorGuidelines", e.target.value)}
                  rows={3}
                  value={form.visitorGuidelines}
                />
              </label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Live visitor announcement banner</CardTitle>
            <Badge variant={form.announcementEnabled ? "success" : "neutral"}>
              {form.announcementEnabled ? "Live on visitor site" : "Hidden"}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="admin-form">
              <label className={styles.toggleRow}>
                <span className={styles.toggleCopy}>
                  <strong>Display announcement banner across Visitor pages</strong>
                  <span>Useful for Undas / All Saints&apos; Day traffic advisories, extended visiting hours, or weather notices.</span>
                </span>
                <input
                  checked={form.announcementEnabled}
                  className={styles.toggleCheckbox}
                  onChange={(e) => setField("announcementEnabled", e.target.checked)}
                  type="checkbox"
                />
              </label>
              <div className="filter-grid">
                <Input
                  label="Announcement title"
                  maxLength={120}
                  onChange={(e) => setField("announcementTitle", e.target.value)}
                  placeholder="e.g. All Saints' Day Visiting Hours"
                  value={form.announcementTitle}
                />
                <label className="input-field" htmlFor="announcement-tone">
                  <span className="input-label">Banner style</span>
                  <select
                    className="input-control"
                    id="announcement-tone"
                    onChange={(e) => setField("announcementTone", e.target.value as AnnouncementTone)}
                    value={form.announcementTone}
                  >
                    <option value="info">Information (Blue)</option>
                    <option value="warning">Advisory / Alert (Amber)</option>
                    <option value="success">Update / Good News (Green)</option>
                  </select>
                </label>
              </div>
              <label className="input-field" htmlFor="announcement-body">
                <span className="input-label">Announcement message</span>
                <textarea
                  className="input-control"
                  id="announcement-body"
                  maxLength={500}
                  onChange={(e) => setField("announcementBody", e.target.value)}
                  placeholder="Share schedule updates, gate rules, or parking advisories for visitors…"
                  rows={3}
                  value={form.announcementBody}
                />
              </label>
              {form.announcementTitle.trim() || form.announcementBody.trim() ? (
                <div className={styles.bannerPreview}>
                  <span className={styles.bannerPreviewLabel}>Visitor banner preview</span>
                  <Alert
                    icon={form.announcementTone === "warning" ? "alert" : form.announcementTone === "success" ? "check" : "info"}
                    title={form.announcementTitle.trim() || "Park notice"}
                    variant={form.announcementTone}
                  >
                    {form.announcementBody.trim()}
                  </Alert>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Visitor photo submission controls</CardTitle>
            <Badge variant="info">Moderated workflow</Badge>
          </CardHeader>
          <CardContent>
            <div className="admin-form">
              <label className={styles.toggleRow}>
                <span className={styles.toggleCopy}>
                  <strong>Allow visitor remembrance gallery submissions (up to 5 photos per memorial)</strong>
                  <span>When paused, visitors can still view already-approved gallery photos, but new gallery uploads are disabled.</span>
                </span>
                <input
                  checked={form.allowVisitorGalleryUploads}
                  className={styles.toggleCheckbox}
                  onChange={(e) => setField("allowVisitorGalleryUploads", e.target.checked)}
                  type="checkbox"
                />
              </label>
              <label className={styles.toggleRow}>
                <span className={styles.toggleCopy}>
                  <strong>Allow visitor profile portrait requests (for memorials without a portrait)</strong>
                  <span>When paused, only cemetery staff can upload profile portraits from Deceased &amp; Interments.</span>
                </span>
                <input
                  checked={form.allowVisitorPortraitRequests}
                  className={styles.toggleCheckbox}
                  onChange={(e) => setField("allowVisitorPortraitRequests", e.target.checked)}
                  type="checkbox"
                />
              </label>
            </div>
          </CardContent>
        </Card>

        <div className={styles.metaBar}>
          <span className="input-hint">
            {form.updatedAt
              ? `Last saved ${new Date(form.updatedAt).toLocaleString()} · Revision ${form.revision}`
              : "Using default Forest Lake configuration"}
          </span>
          <Button disabled={saving} icon="check" size="lg" type="submit">
            {saving ? "Publishing changes…" : "Save & Publish to Visitor Site"}
          </Button>
        </div>
      </form>
    </AdminPageFrame>
  );
}
