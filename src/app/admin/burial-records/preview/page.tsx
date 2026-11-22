import Form from "next/form";
import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { PublicSearchResultCard } from "@/components/visitor/public-search-result-card";
import { SearchSubmitButton } from "@/components/visitor/search-submit-button";
import { Icon } from "@/components/ui/icons";
import { requireStaff } from "@/lib/auth";
import { searchStaffVisitorPreviews } from "@/lib/supabase/staff-visitor-preview";
import { previewSearchHref, visitorPreviewPath } from "@/lib/visitor-presentation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visitor Preview | GraveNav", robots: { index: false, follow: false } };

export default async function VisitorSearchPreview({ searchParams }: {
  searchParams: Promise<{ query?: string; page?: string }>;
}) {
  await requireStaff();
  const params = await searchParams;
  const query = typeof params.query === "string" ? params.query.slice(0, 160).trim() : "";
  const requestedPage = Number(params.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? Math.min(requestedPage, 10000) : 1;
  const returnTo = previewSearchHref(query, page);
  let result;
  try { result = await searchStaffVisitorPreviews(query, page); }
  catch {
    return <AdminShell active="Deceased & Interments">
      <div className="admin-page-frame public-results-page">
        <p className="input-hint">Visitor preview — not published.</p>
        <section className="public-results-state" role="alert">
          <h1>Preview search is temporarily unavailable</h1>
          <p>Your search has been preserved. Please try again.</p>
          <a className="button button--primary" href={returnTo}>Try again</a>
        </section>
      </div>
    </AdminShell>;
  }
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));

  return <AdminShell active="Deceased & Interments">
    <div className="admin-page-frame public-results-page">
      <p className="input-hint" role="status">Visitor preview — not published.</p>
      <Link className="subtle-link" href="/admin/burial-records">Back to Deceased &amp; Interments</Link>
      <section className="public-results-toolbar visitor-preview-toolbar" aria-labelledby="preview-search-title">
        <h1 id="preview-search-title">Search Memorial Profiles</h1>
        <Form action={visitorPreviewPath} className="public-results-search" prefetch={false}>
          <Icon className="public-results-search__icon" name="search" size={20} />
          <input
            aria-label="Search memorial records by name"
            autoComplete="off"
            defaultValue={query}
            key={query}
            enterKeyHint="search"
            maxLength={160}
            name="query"
            placeholder="Enter a name…"
          />
          <SearchSubmitButton compact label="Search" />
        </Form>
        <p aria-live="polite">{result.total} {result.total === 1 ? "record" : "records"} found</p>
      </section>
      {result.items.length ? <section className="public-results-list" aria-label="Search results">
        {result.items.map((record) => <PublicSearchResultCard
          key={record.id}
          preview
          record={record}
          returnTo={returnTo}
        />)}
      </section> : <section className="public-results-state">
        <h2>{result.total ? "No records on this page" : "No matching memorial records"}</h2>
        {result.total ? <>
          <p>This page is outside the available result range.</p>
          <Link className="button button--secondary" href={previewSearchHref(query)}>Return to page 1</Link>
        </> : <p>Try a shorter name or check the spelling.</p>}
      </section>}
      {result.items.length && result.total > result.pageSize ? <nav className="public-pagination" aria-label="Search result pages">
        {page > 1 ? <Link href={previewSearchHref(query, page - 1)}>Previous</Link>
          : <span aria-disabled="true">Previous</span>}
        <span>Page {page} of {pageCount}</span>
        {page < pageCount ? <Link href={previewSearchHref(query, page + 1)}>Next</Link>
          : <span aria-disabled="true">Next</span>}
      </nav> : null}
    </div>
  </AdminShell>;
}
