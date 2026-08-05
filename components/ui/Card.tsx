// components/ui/Card.tsx
"use client";

import { Card as BPCard, Callout as CPCallout, ProgressBar as BPProgressBar, type Intent } from "@blueprintjs/core";
import type { ReactNode } from "react";

export function Card({
  title,
  children,
  actions,
}: {
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <BPCard>
      {(title || actions) && (
        <div className="card-head">
          {title && <div className="card-title">{title}</div>}
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </BPCard>
  );
}

export function Callout({
  intent,
  title,
  children,
}: {
  intent?: Intent;
  title?: string;
  children: ReactNode;
}) {
  return (
    <CPCallout intent={intent} title={title}>
      {children}
    </CPCallout>
  );
}

export function ProgressBar({ value }: { value?: number }) {
  return <BPProgressBar value={value} intent="primary" />;
}
