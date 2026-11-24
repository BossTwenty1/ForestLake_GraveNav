import { Skeleton } from "@/components/ui/skeleton";
import { VisitorShell } from "@/components/visitor/visitor-shell";
import styles from "@/components/visitor/route-loading.module.css";

export default function SearchLoading() {
  return (
    <VisitorShell batchOne wide>
      <div className={styles.frame} role="status" aria-label="Loading memorial search">
        <div className={styles.panel}>
          <Skeleton className={styles.lineLg} />
          <Skeleton className={styles.bar} />
          <div className={styles.row}>
            <Skeleton className={styles.pill} />
            <Skeleton className={styles.pill} />
            <Skeleton className={styles.pill} />
          </div>
        </div>
        <div className={styles.twoCol}>
          <div className={styles.panel}>
            <Skeleton className={styles.lineMd} />
            <Skeleton className={styles.lineSm} />
          </div>
          <div className={styles.panel}>
            <Skeleton className={styles.lineMd} />
            <Skeleton className={styles.lineSm} />
          </div>
        </div>
      </div>
    </VisitorShell>
  );
}
