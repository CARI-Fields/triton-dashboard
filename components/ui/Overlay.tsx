// components/ui/Overlay.tsx
"use client";

import { Dialog as BPDialog, Drawer as BPDrawer, Tooltip as BPTooltip } from "@blueprintjs/core";
import type { ReactElement, ReactNode } from "react";

export function Drawer({
  isOpen,
  title,
  onClose,
  children,
  footer,
}: {
  isOpen: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <BPDrawer isOpen={isOpen} onClose={onClose} title={title} size="35%">
      <div className="drawer-body">{children}</div>
      {footer && <div className="drawer-footer">{footer}</div>}
    </BPDrawer>
  );
}

export function Dialog({
  isOpen,
  title,
  onClose,
  children,
  footer,
}: {
  isOpen: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <BPDialog isOpen={isOpen} onClose={onClose} title={title}>
      {children}
      {footer && <div className="dialog-footer">{footer}</div>}
    </BPDialog>
  );
}

export function Tooltip({ content, children }: { content: ReactElement | string; children: ReactNode }) {
  return <BPTooltip content={content}>{children}</BPTooltip>;
}
