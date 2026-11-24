import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import * as parkDetails from "../src/lib/park-details.ts";

function load(file, dependencies = {}) {
  const source = readFileSync(new URL("../" + file, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)(
    (name) => {
      assert.ok(name in dependencies, "Unexpected dependency " + name);
      return dependencies[name];
    },
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

const { DEFAULT_VISITOR_SITE_SETTINGS, normalizeSiteSettings } = load("src/lib/site-settings.ts", {
  "./park-details": parkDetails,
});

test("normalizeSiteSettings falls back safely to Forest Lake defaults and sanitizes fields", () => {
  assert.deepEqual(normalizeSiteSettings(null), DEFAULT_VISITOR_SITE_SETTINGS);
  const custom = normalizeSiteSettings({
    park_name: "  Forest Lake Phase 2  ",
    park_address: "  Legazpi City  ",
    operating_hours: "6:00 AM - 7:00 PM",
    office_phone: " 052-480-0000 ",
    office_email: " office@forestlake.ph ",
    announcement_enabled: true,
    announcement_title: "Undas Advisory",
    announcement_body: "Extended visiting hours this weekend.",
    announcement_tone: "warning",
    visitor_guidelines: "Observe quiet hours.",
    allow_visitor_gallery_uploads: false,
    allow_visitor_portrait_requests: false,
    revision: 4,
  });
  assert.equal(custom.parkName, "Forest Lake Phase 2");
  assert.equal(custom.parkAddress, "Legazpi City");
  assert.equal(custom.officePhone, "052-480-0000");
  assert.equal(custom.announcementEnabled, true);
  assert.equal(custom.announcementTone, "warning");
  assert.equal(custom.allowVisitorGalleryUploads, false);
  assert.equal(custom.allowVisitorPortraitRequests, false);
  assert.equal(custom.revision, 4);

  const invalidTone = normalizeSiteSettings({ announcement_tone: "danger" });
  assert.equal(invalidTone.announcementTone, "info");
});

test("site_settings and admin hardening migration enforces ADMIN-only writes, suspended reactivation, and RLS tightening", () => {
  const sql = readFileSync(
    new URL("../supabase/migrations/20261124060000_visitor_site_settings_and_admin_hardening.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /create table if not exists public\.site_settings/i);
  assert.match(sql, /create or replace function public\.admin_update_site_settings/i);
  assert.match(sql, /if not public\.is_active_admin\(\) then\s+raise exception 'Only an active ADMIN may update visitor site settings'/i);
  assert.match(sql, /or account_status = 'SUSPENDED'/);
  assert.match(sql, /Only active ADMIN accounts may export audit logs/);
  assert.match(sql, /drop policy if exists burial_photos_staff_delete on storage\.objects/);
  assert.match(sql, /and public\.is_active_admin\(\)/);
});
