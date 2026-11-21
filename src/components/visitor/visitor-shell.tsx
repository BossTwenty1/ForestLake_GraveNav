import "./visitor-batch-one.css";

import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icons";
import { VisitorBottomNav } from "./visitor-bottom-nav";
import { VisitorHeader } from "./visitor-header";

export function VisitorShell({ children, wide = false, batchOne = false, className, helpHref, searchInputId, backHref, backLabel = "Go back" }: {
  children: ReactNode;
  wide?: boolean;
  batchOne?: boolean;
  className?: string;
  helpHref?: string;
  searchInputId?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className={`visitor-shell${wide ? " visitor-shell--wide" : ""}${batchOne ? " visitor-shell--batch-one" : ""}${className ? " " + className : ""}`}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <VisitorHeader helpHref={helpHref} searchInputId={searchInputId} backHref={batchOne ? undefined : backHref} backLabel={backLabel} />
      <main className="visitor-main" id="main-content" tabIndex={-1}>
        {batchOne && backHref ? <Link className="public-back-link" href={backHref}><Icon name="chevronRight" size={15} />{backLabel}</Link> : null}
        {children}
      </main>
      <VisitorBottomNav searchInputId={searchInputId} />
    </div>
  );
}
