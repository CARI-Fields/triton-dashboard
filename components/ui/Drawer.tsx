"use client";

import type { ReactNode } from "react";
import { useModalFocus } from "@/components/ui/useModalFocus";

export interface DrawerProps {
  open: boolean;
  titleId: string;
  onClose: () => void;
  footer?: ReactNode;
  blocked?: boolean;
  children: ReactNode;
}

export default function Drawer({
  open,
  titleId,
  onClose,
  footer,
  blocked = false,
  children,
}: DrawerProps) {
  const dialogRef = useModalFocus({ open, onClose, blocked });

  if (!open) return null;

  return (
    <div
      className="drawer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget
          && !blocked
        ) {
          onClose();
        }
      }}
    >
      <section
        ref={dialogRef}
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="drawer-body">{children}</div>
        {footer ? <footer className="drawer-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}
