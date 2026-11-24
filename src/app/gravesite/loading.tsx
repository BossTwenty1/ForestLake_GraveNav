import { Skeleton } from "@/components/ui/skeleton";
import { VisitorShell } from "@/components/visitor/visitor-shell";
import styles from "@/components/visitor/route-loading.module.css";

export default function GravesiteLoading() {
  return (
    <VisitorShell batchOne wide>
      <div className={styles.frame} role="status" aria-label="Loading memorial profile">
        <div className={styles.heroCard}>
          <Skeleton className={styles.heroPortrait} />
          <div className={styles.lines}>
            <Skeleton className={styles.lineSm} />
            <Skeleton className={styles.lineLg} />
            <Skeleton className={styles.lineMd} />
          </div>
        </div>
        <div className={styles.twoCol}>
          <div className={styles.panel}>
            <Skeleton className={styles.lineLg} />
            <Skeleton className={styles.lineMd} />
            <Skeleton className={styles.lineSm} />
          </div>
          <div className={styles.panel}>
            <Skeleton className={styles.lineMd} />
            <Skeleton className={styles.bar} />
          </div>
        </div>
      </div>
    </VisitorShell>
  );
}
