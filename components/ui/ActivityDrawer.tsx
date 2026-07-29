"use client";

import type { ReactNode, RefObject } from "react";
import { Icon } from "@/components/ui/Icons";
import { useModalFocus } from "@/components/ui/useModalFocus";

export interface ActivityDrawerProps {
  open: boolean;
  panelId: string;
  label: string;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  className?: string;
  children: ReactNode;
}

export default function ActivityDrawer({
  open,
  panelId,
  label,
  onClose,
  returnFocusRef,
  className = "",
  children,
}: ActivityDrawerProps) {
  const closeAndRestoreFocus = () => {
    onClose();
    window.setTimeout(() => {
      const panel = document.getElementById(panelId);
      const trigger = returnFocusRef.current;
      if (
        panel?.getAttribute("data-open") === "false"
        && trigger?.isConnected
      ) {
        trigger.focus();
      }
    }, 0);
  };
  const panelRef = useModalFocus({
    open,
    onClose: closeAndRestoreFocus,
    blocked: false,
  });

  return (
    <>
      <button
        type="button"
        className="activity-drawer-backdrop"
        data-open={open}
        aria-label="Close activity"
        aria-hidden={!open}
        tabIndex={-1}
        disabled={!open}
        onClick={closeAndRestoreFocus}
      />
      <section
        ref={panelRef}
        id={panelId}
        className={`activity-drawer ${className}`.trim()}
        data-open={open}
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label={label}
        aria-hidden={!open}
        inert={!open}
        tabIndex={-1}
      >
        <header className="activity-drawer-header">
          <h2>Activity</h2>
          <button
            type="button"
            className="activity-drawer-close"
            aria-label="Close activity"
            data-modal-initial-focus
            onClick={closeAndRestoreFocus}
          >
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="activity-drawer-scroll" tabIndex={open ? 0 : -1}>
          {children}
        </div>
      </section>
    </>
  );
}
