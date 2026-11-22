import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icons";

export type PageBreadcrumb = {
  label: string;
  href?: string;
};

type PageHeadingProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: PageBreadcrumb[];
};

export function PageHeading({ title, description, actions, breadcrumbs }: PageHeadingProps) {
  return (
    <header className="page-heading">
      <div className="page-heading__copy">
        {breadcrumbs?.length ? (
          <nav aria-label="Breadcrumb" className="page-breadcrumbs">
            <ol>
              {breadcrumbs.map((item, index) => {
                const current = index === breadcrumbs.length - 1;
                return (
                  <li key={`${item.label}-${index}`}>
                    {index > 0 ? (
                      <Icon aria-hidden="true" name="chevronRight" size={13} />
                    ) : null}
                    {item.href && !current ? (
                      <Link href={item.href}>{item.label}</Link>
                    ) : (
                      <span aria-current={current ? "page" : undefined}>{item.label}</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        ) : null}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
