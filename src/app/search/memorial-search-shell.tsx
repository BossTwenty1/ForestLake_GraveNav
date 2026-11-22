import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icons";
import { VisitorShell } from "@/components/visitor/visitor-shell";
import { PARK_ADDRESS, PARK_NAME } from "@/lib/park-details";
import styles from "./memorial-search.module.css";

export function MemorialSearchShell({ children, initial = false }: { children: ReactNode; initial?: boolean }) {
  return (
    <VisitorShell batchOne wide className={`${styles.shell}${initial ? " " + styles.initial : ""}`} helpHref="#search-help">
      <div className={styles.content}>{children}</div>
      <footer className={styles.footer}><div>GraveNav Albay · {PARK_NAME}, {PARK_ADDRESS}</div></footer>
    </VisitorShell>
  );
}

export function MemorialSearchHelp() {
  return (
    <aside className={styles.help} id="search-help" aria-label="Help locating a plot">
      <Icon name="help" size={22} />
      <div><strong>Need help locating a plot?</strong><p>Ask cemetery staff at {PARK_NAME}, {PARK_ADDRESS}.</p></div>
    </aside>
  );
}
