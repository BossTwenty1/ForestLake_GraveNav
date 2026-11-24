import { Skeleton } from "@/components/ui/skeleton";
import styles from "@/components/admin/admin-loading.module.css";

export default function AdminLoading() {
  return (
    <div className={styles.page} role="status" aria-label="Loading workspace">
      <div className={styles.heading}>
        <Skeleton className={styles.title} />
        <Skeleton className={styles.subtitle} />
      </div>
      <div className={styles.kpis}>
        {Array.from({ length: 4 }).map((_, index) => (
          <div className={styles.kpiCard} key={index}>
            <Skeleton className={styles.kpiLabel} />
            <Skeleton className={styles.kpiValue} />
          </div>
        ))}
      </div>
      <div className={styles.panel}>
        <div className={styles.toolbar}>
          <Skeleton className={styles.pill} />
          <Skeleton className={styles.pill} />
          <Skeleton className={styles.pill} />
        </div>
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton className={styles.row} key={index} />
        ))}
      </div>
    </div>
  );
}
