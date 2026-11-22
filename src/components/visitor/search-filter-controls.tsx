"use client";

import { useId, useState, type ReactNode } from "react";
import styles from "@/app/search/memorial-search.module.css";
import { Icon } from "@/components/ui/icons";

export function SearchFilterControls({ children, filterCount, isResults, sort, summary }: {
  children: ReactNode;
  filterCount: number;
  isResults: boolean;
  sort: "name" | "newest";
  summary?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const filtersId = useId();
  return (
    <div className={isResults ? styles.resultsControls : styles.initialControls}>
      {summary}
      {isResults ? <button aria-controls={filtersId} aria-expanded={open} className={styles.filterToggle}
        onClick={() => setOpen(value => !value)} type="button">
        <Icon name="sliders" size={17} /><span>Filter ({filterCount})</span>
        <span className={styles.sortSummary}>{sort === "newest" ? "Newest" : "A–Z"}</span>
      </button> : null}
      <div className={styles.filters} id={filtersId} data-open={open} onChange={event => {
        if (isResults && event.target instanceof HTMLSelectElement) event.target.form?.requestSubmit();
      }}>
        {children}
        {!isResults ? <button className={styles.clearFilters} type="button" onClick={event => {
          const form = event.currentTarget.form;
          if (!form) return;
          const section = form.elements.namedItem("section");
          const year = form.elements.namedItem("year");
          if (section instanceof HTMLSelectElement) section.value = "all";
          if (year instanceof HTMLSelectElement) year.value = "any";
        }}><Icon name="close" size={14} />Clear Filters</button> : null}
      </div>
    </div>
  );
}
