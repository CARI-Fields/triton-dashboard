// components/ui/PageHeader.tsx
"use client";

import { Breadcrumbs as BPBreadcrumbs, type BreadcrumbProps } from "@blueprintjs/core";
import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow?: string;
  title: string;
  lede?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <div className="page-header-row">
        <h1>{title}</h1>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
      {lede && <p className="lede">{lede}</p>}
    </header>
  );
}

export function Breadcrumbs({ items }: { items: BreadcrumbProps[] }) {
  // minVisibleItems keeps every breadcrumb rendered as a link even when DOM
  // dimensions are unavailable (e.g. jsdom, where OverflowList would otherwise
  // collapse all items into the overflow menu).
  return <BPBreadcrumbs items={items} minVisibleItems={items.length} />;
}
