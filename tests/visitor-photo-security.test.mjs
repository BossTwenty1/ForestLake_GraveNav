import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

function load(file, dependencies = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL("../" + file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "exports", compiled)(name => {
    assert.ok(name in dependencies, "Unexpected dependency " + name);
    return dependencies[name];
  }, loaded.exports);
  return loaded.exports;
}

const security = load("src/lib/visitor-photo-security.ts");
const publicPhotos = load("src/lib/supabase/public-memorial-photos.ts", {
  "./config": { getPublicSupabase: () => null },
});

test("inspectAndSanitizeImage rejects non-image payloads, SVGs, and oversized files", () => {
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.equal(security.inspectAndSanitizeImage(svg).ok, false);

  const empty = new Uint8Array(0);
  assert.equal(security.inspectAndSanitizeImage(empty).ok, false);

  const tooBig = new Uint8Array(security.MAX_VISITOR_PHOTO_BYTES + 1);
  tooBig[0] = 0xff; tooBig[1] = 0xd8; tooBig[2] = 0xff;
  assert.equal(security.inspectAndSanitizeImage(tooBig).ok, false);
});

test("inspectAndSanitizeImage strips JPEG EXIF APP1 and COM metadata while keeping scan data", () => {
  const exifPayload = new TextEncoder().encode("Exif\0\0GPS_SECRET_COORDS");
  const exifLen = exifPayload.length + 2;
  const commentPayload = new TextEncoder().encode("SECRET_COMMENT");
  const commentLen = commentPayload.length + 2;
  const jpeg = new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xe1, (exifLen >> 8) & 0xff, exifLen & 0xff, ...exifPayload, // APP1 EXIF
    0xff, 0xfe, (commentLen >> 8) & 0xff, commentLen & 0xff, ...commentPayload, // COM
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, // SOS header
    0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, // scan bytes
    0xff, 0xd9, // EOI
  ]);
  const result = security.inspectAndSanitizeImage(jpeg);
  assert.equal(result.ok, true);
  assert.equal(result.mimeType, "image/jpeg");
  const text = new TextDecoder().decode(result.bytes);
  assert.doesNotMatch(text, /GPS_SECRET_COORDS|SECRET_COMMENT/);
  assert.equal(result.bytes[0], 0xff);
  assert.equal(result.bytes[1], 0xd8);
});

test("inspectAndSanitizeImage strips PNG eXIf and tEXt metadata while preserving IHDR and IEND", () => {
  function pngChunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    const len = data.length;
    out[0] = (len >>> 24) & 0xff; out[1] = (len >>> 16) & 0xff; out[2] = (len >>> 8) & 0xff; out[3] = len & 0xff;
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    return out;
  }
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = pngChunk("IHDR", new Uint8Array(13));
  const textChunk = pngChunk("tEXt", new TextEncoder().encode("Author\0SecretName"));
  const exifChunk = pngChunk("eXIf", new TextEncoder().encode("MM\0*GPS_LAT_LON"));
  const iend = pngChunk("IEND", new Uint8Array(0));
  const png = new Uint8Array(sig.length + ihdr.length + textChunk.length + exifChunk.length + iend.length);
  let p = 0;
  for (const part of [sig, ihdr, textChunk, exifChunk, iend]) { png.set(part, p); p += part.length; }

  const result = security.inspectAndSanitizeImage(png);
  assert.equal(result.ok, true);
  assert.equal(result.mimeType, "image/png");
  const decoded = new TextDecoder().decode(result.bytes);
  assert.doesNotMatch(decoded, /SecretName|GPS_LAT_LON/);
  assert.match(decoded, /IHDR/);
  assert.match(decoded, /IEND/);
});

test("splitMemorialPhotos keeps visitor tribute photos strictly separate from the profile portrait", () => {
  const onlyTributes = [
    { id: 10, src: "/gravesite/photos/63/10", caption: "Flowers", photoKind: "tribute", submittedByName: "Ana", submittedByRelation: "Family" },
    { id: 11, src: "/gravesite/photos/63/11", caption: null, photoKind: "tribute", submittedByName: "Ben", submittedByRelation: "Friend" },
  ];
  const splitNoPortrait = publicPhotos.splitMemorialPhotos(onlyTributes);
  assert.equal(splitNoPortrait.portrait, undefined);
  assert.equal(splitNoPortrait.tributes.length, 2);
  assert.equal(splitNoPortrait.gallery.length, 2);

  const mixed = [
    ...onlyTributes,
    { id: 2, src: "/gravesite/photos/6/2", caption: "Official portrait", photoKind: "portrait" },
  ];
  const splitMixed = publicPhotos.splitMemorialPhotos(mixed);
  assert.equal(splitMixed.portrait?.id, 2);
  assert.equal(splitMixed.tributes.length, 2);
  assert.equal(splitMixed.gallery.length, 2);
});

test("sanitizeVisitorSubmissionFields and checkVisitorUploadRateLimit enforce strict validation and hourly quota", () => {
  assert.equal(security.sanitizeVisitorSubmissionFields({ name: "A", relation: "Family" }).ok, false);
  assert.equal(security.sanitizeVisitorSubmissionFields({ name: "Maria Santos", relation: "Stranger" }).ok, false);
  const valid = security.sanitizeVisitorSubmissionFields({ name: "  Maria\nSantos ", relation: "Family", caption: "  With love  " });
  assert.equal(valid.ok, true);
  assert.equal(valid.name, "Maria Santos");
  assert.equal(valid.caption, "With love");

  const t0 = 1_700_000_000_000;
  assert.equal(security.checkVisitorUploadRateLimit("test-ip-1", t0).allowed, true);
  assert.equal(security.checkVisitorUploadRateLimit("test-ip-1", t0 + 1000).allowed, true);
  assert.equal(security.checkVisitorUploadRateLimit("test-ip-1", t0 + 2000).allowed, true);
  assert.equal(security.checkVisitorUploadRateLimit("test-ip-1", t0 + 3000).allowed, false);
  assert.equal(security.checkVisitorUploadRateLimit("test-ip-1", t0 + 60 * 60 * 1000 + 1000).allowed, true);
});
