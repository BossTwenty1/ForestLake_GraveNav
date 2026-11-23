import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { Phase2ImportControl } from "@/components/admin/phase2-import-control";
import { requireStaff } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { localSupabaseConfig } from "@/lib/supabase/config";
import { assertLocalRequest, verifyPugi } from "@/lib/phase2-import";

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Phase2ImportPage() {
  const requestHeaders = await headers();
  try {
    assertLocalRequest(new Request("http://" + requestHeaders.get("host") +
      "/admin/phase2-import", { headers: requestHeaders }));
  } catch { notFound(); }
  const client = await getServerSupabase();
  await requireStaff("ADMIN", client);
  if (!client) notFound();
  try { await verifyPugi(client, localSupabaseConfig.url); }
  catch { notFound(); }
  return <AdminShell><Phase2ImportControl /></AdminShell>;
}
