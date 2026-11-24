import { Skeleton } from "@/components/ui/skeleton";
import { VisitorShell } from "@/components/visitor/visitor-shell";
import styles from "@/components/visitor/route-loading.module.css";

export default function ResultsLoading() {
  return (
    <VisitorShell batchOne wide>
      <div className={styles.frame} role="status" aria-label="Loading search results">
        <Skeleton className={styles.bar} />
        <div className={styles.row}>
          <Skeleton className={styles.pill} />
          <Skeleton className={styles.pill} />
        </div>
        <div className={styles.cards}>
          {Array.from({ length: 6 }).map((_, index) => (
            <div className={styles.card} key={index}>
              <Skeleton className={styles.thumb} />
              <div className={styles.lines}>
                <Skeleton className={styles.lineLg} />
                <Skeleton className={styles.lineMd} />
                <Skeleton className={styles.lineSm} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </VisitorShell>
  );
}
