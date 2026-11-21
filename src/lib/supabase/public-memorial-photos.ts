import { getPublicSupabase } from "./config";

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export type PublicMemorialPhoto = { id: number; src: string; caption: string | null };

function positiveId(id: string) {
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));
}

function burialPhotoPath(path: string, burialId: string) {
  const prefix = `burial/${burialId}/`;
  return path.startsWith(prefix) && /^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/i.test(path.slice(prefix.length));
}

export async function getPublicMemorialPhotos(burialId: string): Promise<PublicMemorialPhoto[]> {
  if (!positiveId(burialId) || !process.env.NEXT_PUBLIC_SUPABASE_PHOTOS_BUCKET) return [];
  const client = getPublicSupabase();
  if (!client) return [];

  const { data, error } = await client.from("public_burial_photos")
    .select("photo_id,storage_path,caption").eq("burial_id", Number(burialId)).order("photo_id");
  if (error) return [];
  return (data ?? []).flatMap(row => {
    const id = row.photo_id;
    if (id === null || !positiveId(String(id)) || !row.storage_path || !burialPhotoPath(row.storage_path, burialId)) return [];
    return [{ id, src: `/gravesite/photos/${burialId}/${id}`, caption: row.caption?.trim() || null }];
  });
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
