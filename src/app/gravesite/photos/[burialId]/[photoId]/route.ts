import { downloadPublicMemorialPhoto } from "@/lib/supabase/public-memorial-photos";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ burialId: string; photoId: string }> }) {
  const { burialId, photoId } = await params;
  const image = await downloadPublicMemorialPhoto(burialId, photoId).catch(() => null);
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!image) return new Response(null, { status: 404, headers });
  return new Response(image, { headers: { ...headers, "Content-Type": image.type } });
}
