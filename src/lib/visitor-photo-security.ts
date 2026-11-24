export const MAX_VISITOR_PHOTO_BYTES = 3 * 1024 * 1024;
export const MAX_TRIBUTE_PHOTOS_PER_MEMORIAL = 5;
export const VISITOR_RELATIONS = ["Family", "Relative", "Friend", "Visitor"] as const;
export type VisitorRelation = (typeof VISITOR_RELATIONS)[number];

export type SanitizedImageResult =
  | { ok: true; mimeType: "image/jpeg" | "image/png" | "image/webp"; extension: "jpg" | "png" | "webp"; bytes: Uint8Array }
  | { ok: false; error: string };

export function detectImageFormat(bytes: Uint8Array): { mimeType: "image/jpeg" | "image/png" | "image/webp"; extension: "jpg" | "png" | "webp" } | null {
  if (bytes.length < 12) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return { mimeType: "image/png", extension: "png" };
  }
  // WebP: RIFF....WEBP
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return { mimeType: "image/webp", extension: "webp" };
  }
  return null;
}

/**
 * Strips EXIF, XMP, ICC, and text comment segments from JPEG images while keeping JFIF (APP0) and scan data intact.
 */
function stripJpegMetadata(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const chunks: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;
  let sawSos = false;

  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) break;
    const marker = bytes[offset];
    offset++;

    // EOI or standalone markers without length
    if (marker === 0xd9) {
      chunks.push(new Uint8Array([0xff, 0xd9]));
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      chunks.push(new Uint8Array([0xff, marker]));
      continue;
    }

    // SOS (Start of Scan): copy remainder of entropy-coded image stream to end
    if (marker === 0xda) {
      sawSos = true;
      chunks.push(bytes.subarray(offset - 2));
      break;
    }

    if (offset + 1 >= bytes.length) return null;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return null;

    const isMetadataSegment = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!isMetadataSegment) {
      chunks.push(bytes.subarray(offset - 2, offset + length));
    }
    offset += length;
  }

  if (!sawSos) return null;
  return concatBytes(chunks);
}

/**
 * Strips EXIF/text metadata chunks (eXIf, tEXt, iTXt, zTXt, tIME) from PNG images.
 */
function stripPngMetadata(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 33) return null;
  const chunks: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8;
  let sawIhdr = false;
  let sawIend = false;
  const strippedTypes = new Set(["eXIf", "tEXt", "iTXt", "zTXt", "tIME"]);

  while (offset + 12 <= bytes.length) {
    const length = readUint32BE(bytes, offset);
    const total = 12 + length;
    if (length > bytes.length || offset + total > bytes.length) return null;
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    if (type === "IHDR") sawIhdr = true;
    if (type === "IEND") sawIend = true;
    if (!strippedTypes.has(type)) {
      chunks.push(bytes.subarray(offset, offset + total));
    }
    offset += total;
    if (type === "IEND") break;
  }

  if (!sawIhdr || !sawIend) return null;
  return concatBytes(chunks);
}

/**
 * Strips EXIF and XMP metadata chunks from WebP RIFF containers and updates header size/flags.
 */
function stripWebpMetadata(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 16) return null;
  const chunks: Uint8Array[] = [];
  let offset = 12;
  let payloadSize = 4; // "WEBP"

  while (offset + 8 <= bytes.length) {
    const fourcc = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const chunkSize = readUint32LE(bytes, offset + 4);
    const padded = chunkSize + (chunkSize % 2);
    const total = 8 + padded;
    if (chunkSize > bytes.length || offset + total > bytes.length) return null;

    if (fourcc !== "EXIF" && fourcc !== "XMP ") {
      const slice = new Uint8Array(bytes.subarray(offset, offset + total));
      if (fourcc === "VP8X" && slice.length >= 12) {
        // Clear XMP (bit 2) and EXIF (bit 3) metadata flags in VP8X header.
        slice[8] = slice[8] & ~0x0c;
      }
      chunks.push(slice);
      payloadSize += total;
    }
    offset += total;
  }

  if (!chunks.length) return null;
  const header = new Uint8Array(12);
  header.set([0x52, 0x49, 0x46, 0x46], 0);
  writeUint32LE(header, 4, payloadSize);
  header.set([0x57, 0x45, 0x42, 0x50], 8);
  return concatBytes([header, ...chunks]);
}

export function inspectAndSanitizeImage(bytes: Uint8Array): SanitizedImageResult {
  if (bytes.length === 0) {
    return { ok: false, error: "Choose an image file to upload." };
  }
  if (bytes.length > MAX_VISITOR_PHOTO_BYTES) {
    return { ok: false, error: "Images must be 3 MB or smaller." };
  }
  const format = detectImageFormat(bytes);
  if (!format) {
    return { ok: false, error: "Only JPG, PNG, and WebP photos are accepted." };
  }

  const sanitized = format.extension === "jpg"
    ? stripJpegMetadata(bytes)
    : format.extension === "png"
      ? stripPngMetadata(bytes)
      : stripWebpMetadata(bytes);

  if (!sanitized || sanitized.length < 16) {
    return { ok: false, error: "This image file could not be verified. Please choose a valid JPG, PNG, or WebP photo." };
  }

  return { ok: true, mimeType: format.mimeType, extension: format.extension, bytes: sanitized };
}

export function sanitizeVisitorSubmissionFields(input: {
  name: string;
  relation: string;
  caption?: string;
}): { ok: true; name: string; relation: VisitorRelation; caption: string | null } | { ok: false; error: string } {
  const cleanText = (value: string) => value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  const name = cleanText(input.name);
  if (name.length < 2 || name.length > 80) {
    return { ok: false, error: "Please enter your name (2 to 80 characters)." };
  }
  const relation = VISITOR_RELATIONS.find(item => item === input.relation.trim());
  if (!relation) {
    return { ok: false, error: "Please select your relationship to the deceased." };
  }
  const rawCaption = cleanText(input.caption ?? "");
  if (rawCaption.length > 160) {
    return { ok: false, error: "Captions must be 160 characters or fewer." };
  }
  return { ok: true, name, relation, caption: rawCaption || null };
}

type RateEntry = { timestamps: number[] };
const rateLimitStore = new Map<string, RateEntry>();
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 3;
const MAX_RATE_KEYS = 2000;

export function checkVisitorUploadRateLimit(ipKey: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  if (rateLimitStore.size > MAX_RATE_KEYS) {
    for (const [key, entry] of rateLimitStore) {
      const fresh = entry.timestamps.filter(ts => now - ts < RATE_WINDOW_MS);
      if (fresh.length === 0) rateLimitStore.delete(key);
      else entry.timestamps = fresh;
    }
  }
  const entry = rateLimitStore.get(ipKey) ?? { timestamps: [] };
  entry.timestamps = entry.timestamps.filter(ts => now - ts < RATE_WINDOW_MS);
  if (entry.timestamps.length >= RATE_LIMIT_MAX) {
    const oldest = entry.timestamps[0];
    const retryAfterSeconds = Math.max(60, Math.ceil((RATE_WINDOW_MS - (now - oldest)) / 1000));
    rateLimitStore.set(ipKey, entry);
    return { allowed: false, retryAfterSeconds };
  }
  entry.timestamps.push(now);
  rateLimitStore.set(ipKey, entry);
  return { allowed: true, retryAfterSeconds: 0 };
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

function readUint32BE(buf: Uint8Array, offset: number) {
  return ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0;
}

function readUint32LE(buf: Uint8Array, offset: number) {
  return (buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24)) >>> 0;
}

function writeUint32LE(buf: Uint8Array, offset: number, value: number) {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >>> 8) & 0xff;
  buf[offset + 2] = (value >>> 16) & 0xff;
  buf[offset + 3] = (value >>> 24) & 0xff;
}
