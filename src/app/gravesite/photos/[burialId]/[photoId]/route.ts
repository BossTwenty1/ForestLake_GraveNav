import { downloadPublicMemorialPhoto } from "@/lib/supabase/public-memorial-photos";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ burialId: string; photoId: string }> }) {
  const { burialId, photoId } = await params;
  const image = await downloadPublicMemorialPhoto(burialId, photoId).catch(() => null);
  const baseHeaders = { "X-Content-Type-Options": "nosniff" };
  if (!image) {
    return new Response(null, {
      status: 404,
      headers: { ...baseHeaders, "Cache-Control": "private, no-store" },
    });
  }
  return new Response(image, {
    headers: {
      ...baseHeaders,
      "Content-Type": image.type,
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
