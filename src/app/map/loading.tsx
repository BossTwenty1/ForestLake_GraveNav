import { Skeleton } from "@/components/ui/skeleton";
import { VisitorShell } from "@/components/visitor/visitor-shell";
import styles from "@/components/visitor/route-loading.module.css";

export default function MapLoading() {
  return (
    <VisitorShell wide>
      <div className={styles.frame} role="status" aria-label="Loading cemetery map">
        <Skeleton className={styles.bar} />
        <div className={styles.row}>
          <Skeleton className={styles.pill} />
          <Skeleton className={styles.pill} />
        </div>
        <Skeleton className={styles.mapStage} />
      </div>
    </VisitorShell>
  );
}
