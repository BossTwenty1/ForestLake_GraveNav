import { getPublicSupabase } from "./config";

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export const MAX_MEMORIAL_GALLERY_SLOTS = 5;

export type PublicMemorialPhoto = {
  id: number;
  src: string;
  caption: string | null;
  photoKind?: "portrait" | "tribute";
  submittedByName?: string | null;
  submittedByRelation?: string | null;
};

export type MemorialGallerySlots = {
  approved: number;
  pending: number;
  maxSlots: number;
  remaining: number;
};

function positiveId(id: string) {
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));
}

function burialPhotoPath(path: string, burialId: string) {
  const prefix = `burial/${burialId}/`;
  return path.startsWith(prefix) && /^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/i.test(path.slice(prefix.length));
}

function normalizeKind(value: unknown): "portrait" | "tribute" {
  return value === "tribute" ? "tribute" : "portrait";
}

export function splitMemorialPhotos(photos: PublicMemorialPhoto[]) {
  const portraits = photos.filter(photo => photo.photoKind !== "tribute");
  const tributes = photos.filter(photo => photo.photoKind === "tribute");
  return {
    portrait: portraits[0],
    tributes,
    gallery: [...tributes, ...portraits.slice(1)],
  };
}

export async function getPublicMemorialPhotos(burialId: string): Promise<PublicMemorialPhoto[]> {
  if (!positiveId(burialId) || !process.env.NEXT_PUBLIC_SUPABASE_PHOTOS_BUCKET) return [];
  const client = getPublicSupabase();
  if (!client) return [];

  const withKind = await client
    .from("public_burial_photos")
    .select("photo_id,storage_path,caption,photo_kind,submitted_by_name,submitted_by_relation")
    .eq("burial_id", Number(burialId))
    .order("photo_id");

  if (!withKind.error) {
    return (withKind.data ?? []).flatMap(row => {
      const id = row.photo_id;
      if (id === null || !positiveId(String(id)) || !row.storage_path || !burialPhotoPath(row.storage_path, burialId)) return [];
      return [{
        id,
        src: `/gravesite/photos/${burialId}/${id}`,
        caption: row.caption?.trim() || null,
        photoKind: normalizeKind(row.photo_kind),
        submittedByName: row.submitted_by_name?.trim() || null,
        submittedByRelation: row.submitted_by_relation?.trim() || null,
      }];
    });
  }

  // Graceful fallback when database migration for photo_kind is not yet applied.
  const legacy = await client
    .from("public_burial_photos")
    .select("photo_id,storage_path,caption")
    .eq("burial_id", Number(burialId))
    .order("photo_id");
  if (legacy.error) return [];
  return (legacy.data ?? []).flatMap(row => {
    const id = row.photo_id;
    if (id === null || !positiveId(String(id)) || !row.storage_path || !burialPhotoPath(row.storage_path, burialId)) return [];
    return [{ id, src: `/gravesite/photos/${burialId}/${id}`, caption: row.caption?.trim() || null, photoKind: "portrait" as const }];
  });
}

export async function getMemorialGallerySlots(burialId: string, approvedTributesFallback = 0): Promise<MemorialGallerySlots> {
  const fallback: MemorialGallerySlots = {
    approved: approvedTributesFallback,
    pending: 0,
    maxSlots: MAX_MEMORIAL_GALLERY_SLOTS,
    remaining: Math.max(0, MAX_MEMORIAL_GALLERY_SLOTS - approvedTributesFallback),
  };
  if (!positiveId(burialId) || !process.env.NEXT_PUBLIC_SUPABASE_PHOTOS_BUCKET) return fallback;
  const client = getPublicSupabase();
  if (!client) return fallback;

  const { data, error } = await client.rpc("get_memorial_gallery_slots", { p_burial_id: Number(burialId) });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return fallback;
  const row = data as Record<string, unknown>;
  const approved = typeof row.approved === "number" ? Math.max(0, row.approved) : fallback.approved;
  const pending = typeof row.pending === "number" ? Math.max(0, row.pending) : 0;
  const maxSlots = typeof row.maxSlots === "number" ? Math.max(1, row.maxSlots) : MAX_MEMORIAL_GALLERY_SLOTS;
  const remaining = typeof row.remaining === "number" ? Math.max(0, row.remaining) : Math.max(0, maxSlots - (approved + pending));
  return { approved, pending, maxSlots, remaining };
}

export async function getPrimaryPublicMemorialPhotos(burialIds: string[]): Promise<Record<string, PublicMemorialPhoto>> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_PHOTOS_BUCKET) return {};
  const validIds = [...new Set(burialIds.filter(positiveId))].map(Number);
  if (!validIds.length) return {};
  const client = getPublicSupabase();
  if (!client) return {};

  const withKind = await client
    .from("public_burial_photos")
    .select("burial_id,photo_id,storage_path,caption,photo_kind")
    .in("burial_id", validIds)
    .eq("photo_kind", "portrait")
    .order("photo_id");

  const rows = !withKind.error
    ? withKind.data ?? []
    : ((await client
      .from("public_burial_photos")
      .select("burial_id,photo_id,storage_path,caption")
      .in("burial_id", validIds)
      .order("photo_id")).data ?? []);

  const primaryByBurial: Record<string, PublicMemorialPhoto> = {};
  for (const row of rows) {
    const burialKey = row.burial_id === null ? "" : String(row.burial_id);
    const photoId = row.photo_id;
    if (!burialKey || primaryByBurial[burialKey] || photoId === null || !positiveId(String(photoId))) continue;
    if (!row.storage_path || !burialPhotoPath(row.storage_path, burialKey)) continue;
    primaryByBurial[burialKey] = {
      id: photoId,
      src: `/gravesite/photos/${burialKey}/${photoId}`,
      caption: row.caption?.trim() || null,
      photoKind: "portrait",
    };
  }
  return primaryByBurial;
}

export async function downloadPublicMemorialPhoto(burialId: string, photoId: string) {
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_PHOTOS_BUCKET;
  if (!bucket || !positiveId(burialId) || !positiveId(photoId)) return null;
  const client = getPublicSupabase();
  if (!client) return null;

  const { data: photo, error } = await client.from("public_burial_photos")
    .select("storage_path").eq("burial_id", Number(burialId)).eq("photo_id", Number(photoId)).maybeSingle();
  if (error || !photo?.storage_path || !burialPhotoPath(photo.storage_path, burialId)) return null;

  const { data, error: storageError } = await client.storage.from(bucket).download(photo.storage_path, {}, { cache: "no-store" });
  return storageError || !data || !imageTypes.has(data.type) || data.size === 0 || data.size > 10 * 1024 * 1024 ? null : data;
}
