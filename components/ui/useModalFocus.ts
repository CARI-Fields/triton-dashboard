"use client";

import { useLayoutEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(",");

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => (
      !element.hidden
      && element.getAttribute("aria-hidden") !== "true"
      && !element.closest("[hidden]")
    ));
}

export function useModalFocus({
  open,
  onClose,
  blocked,
}: {
  open: boolean;
  onClose: () => void;
  blocked: boolean;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const blockedRef = useRef(blocked);
  onCloseRef.current = onClose;
  blockedRef.current = blocked;

  useLayoutEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    const active = document.activeElement;
    const opener = active instanceof HTMLElement && !dialog.contains(active)
      ? active
      : null;
    const initialFocus = () => {
      const preferred = dialog.querySelector<HTMLElement>(
        "[data-modal-initial-focus]",
      );
      if (preferred && !preferred.matches(":disabled")) return preferred;
      return focusableElements(dialog)[0] ?? dialog;
    };

    function handleFocusIn(event: FocusEvent) {
      if (!(event.target instanceof Node) || dialog!.contains(event.target)) return;
      initialFocus().focus();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!blockedRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = focusableElements(dialog!);
      if (blockedRef.current || focusable.length === 0) {
        event.preventDefault();
        dialog!.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      if (!dialog!.contains(current)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (current === first || current === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("keydown", handleKeyDown);
    initialFocus().focus();

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("keydown", handleKeyDown);
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  return dialogRef;
}
