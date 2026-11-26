import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { resultsHref, yearOptions, type MemorialSearchState } from "@/app/search/search-params";
import styles from "@/app/search/memorial-search.module.css";
import { SearchFilterControls } from "./search-filter-controls";
import { SearchSubmitButton } from "./search-submit-button";
import { RequiredSearchForm } from "./required-search-form";

type PublicSearchFormProps = {
  gardens: string[];
  gardenListUnavailable: boolean;
  state: MemorialSearchState;
  resultCount?: number;
};

export function PublicSearchForm({ gardens, gardenListUnavailable, state, resultCount }: PublicSearchFormProps) {
  const { query, section, year, sort } = state;
  const isResults = resultCount !== undefined;
  const filterCount = Number(section !== "all") + Number(year !== "any");
  const yearLabel = yearOptions.find(option => option.value === year)?.label;
  const clearFiltersHref = isResults
    ? resultsHref(state, { section: "all", year: "any", page: 1 })
    : null;

  return (
    <RequiredSearchForm className={isResults ? styles.resultsForm : styles.form} key={resultsHref(state)}>
      <div className={styles.searchRow}>
        <div className={styles.query}>
          <Input autoComplete="off" enterKeyHint="search" aria-label="Name or plot reference" icon="search" maxLength={160}
            name="query" defaultValue={query} placeholder="Enter a name or plot reference" type="search"
            required pattern={".*\\S.*"} title="Enter a name or plot reference to search." />
          {isResults && query ? <Link className={styles.clearQuery} aria-label="Clear search query"
            href={resultsHref(state, { query: "", page: 1 })}><Icon name="close" size={16} /></Link> : null}
        </div>
        <SearchSubmitButton label="Search Memorials" />
      </div>
      <SearchFilterControls isResults={isResults} filterCount={filterCount} sort={sort} summary={
        isResults ? <h1 className={styles.summary}>{resultCount} {resultCount === 1 ? "memorial" : "memorials"} found
          {query ? <> for <strong>“{query}”</strong></> : null}</h1> : null
      }>
        <label className={styles.filter}><span>Garden / Section</span><select defaultValue={section} name="section">
          <option value="all">All sections</option>
          {section !== "all" && !gardens.includes(section) ? <option value={section}>{section}</option> : null}
          {gardens.map(garden => <option key={garden} value={garden}>{garden}</option>)}
        </select><Icon name="chevronDown" size={14} /></label>
        <label className={styles.filter}><span>Year of passing</span><select defaultValue={year} name="year">
          {yearOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select><Icon name="chevronDown" size={14} /></label>
        {clearFiltersHref ? <Link className={styles.clearFilters} href={clearFiltersHref}><Icon name="close" size={14} />Clear Filters</Link> : null}
        {isResults ? <label className={`${styles.filter} ${styles.sortFilter}`}><span>Sort</span><select defaultValue={sort} name="sort">
          <option value="name">Name (A–Z)</option><option value="newest">Newest first</option>
        </select><Icon name="chevronDown" size={14} /></label> : <input name="sort" type="hidden" value={sort} />}
      </SearchFilterControls>
      {isResults && filterCount > 0 ? <nav className={styles.activeFilters} aria-label="Active search filters">
        {section !== "all" ? <Link href={resultsHref(state, { section: "all", page: 1 })}
          aria-label={`Remove garden filter: ${section}`}>{section}<Icon name="close" size={14} /></Link> : null}
        {year !== "any" ? <Link href={resultsHref(state, { year: "any", page: 1 })}
          aria-label={`Remove year filter: ${yearLabel}`}>{yearLabel}<Icon name="close" size={14} /></Link> : null}
      </nav> : null}
      {gardenListUnavailable ? <p className={styles.inlineNotice} role="status">The garden list is temporarily unavailable. You can still search by name or plot reference.</p> : null}
    </RequiredSearchForm>
  );
}
