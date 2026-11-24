import { Skeleton } from "@/components/ui/skeleton";
import styles from "@/components/admin/admin-loading.module.css";

export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-label="Loading workspace" className={styles.shell} role="status">
      <aside aria-hidden="true" className={styles.sidebar}>
        <Skeleton className={styles.sidebarBrand} />
        <div className={styles.sidebarNav}>
          {Array.from({ length: 9 }, (_, index) => (
            <Skeleton className={styles.sidebarItem} key={index} />
          ))}
        </div>
      </aside>
      <div className={styles.main}>
        <div aria-hidden="true" className={styles.topbar}>
          <Skeleton className={styles.topbarSearch} />
          <div className={styles.topbarRight}>
            <Skeleton className={styles.topbarPill} />
            <Skeleton className={styles.topbarPill} />
          </div>
        </div>
        <div className={styles.page}>
          <Skeleton className={styles.banner} />
          <div className={styles.kpis}>
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton className={styles.kpiCard} key={index} />
            ))}
          </div>
          <div className={styles.analytics}>
            <Skeleton className={styles.panelTall} />
            <Skeleton className={styles.panelTall} />
            <Skeleton className={styles.panelTall} />
          </div>
          <div className={styles.operations}>
            <Skeleton className={styles.panelShort} />
            <Skeleton className={styles.panelShort} />
            <Skeleton className={styles.panelShort} />
          </div>
        </div>
      </div>
    </div>
  );
}
