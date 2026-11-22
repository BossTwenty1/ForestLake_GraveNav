import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { Alert } from "@/components/ui/alert";
import { MemorialProfile } from "@/components/visitor/memorial-profile";
import { getStaffVisitorPreview } from "@/lib/supabase/staff-visitor-preview";
import { safePreviewReturnTo } from "@/lib/visitor-presentation";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function VisitorPreviewRoute({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { id } = await params;
  const preview = await getStaffVisitorPreview(id);
  const back = "/admin/burial-records/" + encodeURIComponent(id);
  const returnTo = safePreviewReturnTo((await searchParams).returnTo);
  return <AdminShell active="Deceased & Interments">
    <div className="admin-page-frame">
      <p className="input-hint" role="status">
        {preview?.visible ? "Visitor preview — currently published." : "Visitor preview — not published."}
      </p>
      <nav className="admin-form-actions" aria-label="Preview navigation">
        <Link className="subtle-link" href={returnTo}>Back to search results</Link>
        <Link className="subtle-link" href={back}>Back to record</Link>
      </nav>
      {preview ? <MemorialProfile
        record={preview.record}
        mapScope="unavailable"
        shared={{ state: "ready", items: [] }}
        returnTo={returnTo}
        preview
      /> : <Alert title="Record not found" variant="warning">
        This record is unavailable or has been removed.
      </Alert>}
    </div>
  </AdminShell>;
}
