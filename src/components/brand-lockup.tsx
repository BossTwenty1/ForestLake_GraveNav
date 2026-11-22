import Image from "next/image";
import { PARK_NAME } from "@/lib/park-details";

type BrandLockupProps = { admin?: boolean; compact?: boolean };

export function BrandLockup({ admin = false, compact = false }: BrandLockupProps) {
  return (
    <div className={`brand-lockup ${compact ? "brand-lockup--compact" : ""}`}>
      <span className="brand-mark"><Image alt={admin || !compact ? PARK_NAME : ""} height={40} sizes={compact ? "32px" : "40px"} src="/forest-lake-logo.png" width={40} /></span>
      <span className="brand-lockup__text">
        <span className="brand-name">GraveNav{admin ? " Admin" : ""}{compact && !admin ? <span className="brand-status" aria-hidden="true" /> : null}</span>
        {(admin || compact) && <span className="brand-subtitle">{admin ? "Cemetery Management" : PARK_NAME}</span>}
      </span>
    </div>
  );
}
