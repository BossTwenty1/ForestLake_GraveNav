import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { PublicSearchForm } from "@/components/visitor/public-search-form";
import { PublicSearchResultCard } from "@/components/visitor/public-search-result-card";
import { getPublicGardenNames, searchPublicBurials } from "@/lib/supabase/public-data";
import { MemorialSearchHelp, MemorialSearchShell } from "../search/memorial-search-shell";
import styles from "../search/memorial-search.module.css";
import { readSearchParams, resultsHref } from "../search/search-params";

export default async function ResultsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const state = readSearchParams(await searchParams);
  const { query, section, year, sort, page } = state;
  const currentHref = resultsHref(state);
  const searchHref = "/search?" + new URLSearchParams({ query, section, year, sort });
  const [search, gardens] = await Promise.allSettled([searchPublicBurials(state), getPublicGardenNames()]);

  if (search.status === "rejected") {
    return (
      <MemorialSearchShell>
        <section className={styles.statePanel} aria-labelledby="search-error">
          <Icon name="alert" size={32} />
          <h1 id="search-error">Search is temporarily unavailable</h1>
          <p>The public registry could not be reached. Your search details are still preserved.</p>
          <div className={styles.stateActions}><a href={currentHref}>Try again</a><Link href={searchHref}>Change search</Link></div>
        </section>
        <MemorialSearchHelp />
      </MemorialSearchShell>
    );
  }

  const { items, total, pageSize } = search.value;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <MemorialSearchShell>
      <PublicSearchForm state={state} gardens={gardens.status === "fulfilled" ? gardens.value : []}
        gardenListUnavailable={gardens.status === "rejected"} resultCount={total} />
      {items.length ? (
        <section className={styles.cards} aria-label="Search results">
          {items.map(record => <PublicSearchResultCard key={record.id} record={record} returnTo={currentHref} />)}
        </section>
      ) : (
        <section className={styles.statePanel} aria-labelledby="search-empty">
          <Icon name="search" size={32} />
          <h2 id="search-empty">{total ? "No records on this page" : "No matching memorial records"}</h2>
          <p>{total ? "This page is outside the available result range." : "Try a shorter name, check the spelling, or clear your filters."}</p>
          <div className={styles.stateActions}>
            {total ? <Link href={resultsHref(state, { page: 1 })}>Return to page 1</Link> : <Link href={searchHref}>Adjust search</Link>}
          </div>
        </section>
      )}
      <div className={styles.resultsFooter}>
        {items.length ? <nav className={styles.pagination} aria-label="Search result pages">
          {page > 1 ? <Link href={resultsHref(state, { page: page - 1 })} rel="prev"><Icon name="chevronRight" size={15} />Previous</Link>
            : <span aria-disabled="true"><Icon name="chevronRight" size={15} />Previous</span>}
          <span>Page <b>{page}</b> of {pageCount}</span>
          {page < pageCount ? <Link href={resultsHref(state, { page: page + 1 })} rel="next">Next<Icon name="chevronRight" size={15} /></Link>
            : <span aria-disabled="true">Next<Icon name="chevronRight" size={15} /></span>}
        </nav> : null}
        <MemorialSearchHelp />
      </div>
    </MemorialSearchShell>
  );
}
