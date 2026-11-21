import { Icon } from "@/components/ui/icons";
import { MemorialSearchHelp, MemorialSearchShell } from "../search/memorial-search-shell";
import styles from "../search/memorial-search.module.css";

export default function ResultsLoading() {
  return (
    <MemorialSearchShell>
      <div className={styles.statePanel} role="status">
        <Icon name="search" size={32} />
        <p>Searching memorial records…</p>
      </div>
      <MemorialSearchHelp />
    </MemorialSearchShell>
  );
}
