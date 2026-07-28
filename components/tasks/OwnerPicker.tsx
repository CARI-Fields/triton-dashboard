"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import OwnerAvatar from "@/components/ui/OwnerAvatar";
import { findMemberByName, memberNameKey } from "@/lib/members";
import type { Member } from "@/lib/types";

const PANEL_GAP_PX = 6;

export interface OwnerPickerProps {
  members: Member[];
  owners: string[];
  onChange: (owners: string[]) => void;
  onCreateOwner: (name: string) => Promise<Member>;
  onPendingChange?: (pending: boolean) => void;
  disabled?: boolean;
}

export default function OwnerPicker({
  members,
  owners,
  onChange,
  onCreateOwner,
  onPendingChange,
  disabled = false,
}: OwnerPickerProps) {
  const [open, setOpen] = useState(false);
  const [newOwnerName, setNewOwnerName] = useState("");
  const [pending, setPending] = useState(false);
  const [panelPlacement, setPanelPlacement] = useState<"above" | "below">(
    "below",
  );
  const [restoreFailedCreateFocus, setRestoreFailedCreateFocus] = useState(
    false,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef(false);
  const latestOwnersRef = useRef(owners);
  latestOwnersRef.current = owners;
  const inputId = useId();
  const ownerKeys = useMemo(
    () => new Set(owners.map(memberNameKey)),
    [owners],
  );
  const availableMembers = members.filter(
    (member) => !ownerKeys.has(memberNameKey(member.name)),
  );

  useLayoutEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    const panel = panelRef.current;
    if (!root || !panel) return;

    const boundary = root.closest<HTMLElement>(".drawer-body");
    const boundaryRect = boundary?.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const panelHeight = panel.getBoundingClientRect().height;
    const boundaryTop = boundaryRect?.top ?? 0;
    const boundaryBottom = boundaryRect?.bottom ?? window.innerHeight;
    const spaceBelow = boundaryBottom - rootRect.bottom - PANEL_GAP_PX;
    const spaceAbove = rootRect.top - boundaryTop - PANEL_GAP_PX;
    const nextPlacement = panelHeight > spaceBelow && spaceAbove > spaceBelow
      ? "above"
      : "below";
    setPanelPlacement(nextPlacement);
  }, [availableMembers.length, open, owners.length]);

  function closePanel(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) {
      queueMicrotask(() => triggerRef.current?.focus());
    }
  }

  function selectOwner(name: string) {
    const currentOwners = latestOwnersRef.current;
    const nameKey = memberNameKey(name);
    if (!currentOwners.some((owner) => memberNameKey(owner) === nameKey)) {
      const nextOwners = [...currentOwners, name];
      latestOwnersRef.current = nextOwners;
      onChange(nextOwners);
    }
    setNewOwnerName("");
    closePanel();
  }

  async function createOwner() {
    const name = newOwnerName.trim();
    if (!name || pendingRef.current || disabled) return;
    const existing = findMemberByName(members, name);
    if (existing) {
      selectOwner(existing.name);
      return;
    }

    pendingRef.current = true;
    onPendingChange?.(true);
    setPending(true);
    try {
      const created = await onCreateOwner(name);
      selectOwner(created.name);
    } catch {
      setRestoreFailedCreateFocus(true);
    } finally {
      pendingRef.current = false;
      setPending(false);
      onPendingChange?.(false);
    }
  }

  useEffect(() => {
    if (!restoreFailedCreateFocus || pending || !open) return;
    inputRef.current?.focus();
    setRestoreFailedCreateFocus(false);
  }, [open, pending, restoreFailedCreateFocus]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const closeOnPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closePanel();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      closePanel();
    };
    document.addEventListener("pointerdown", closeOnPointer);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointer);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [open]);

  return (
    <div className="owner-picker" ref={rootRef}>
      <div className="owner-picker-selected">
        {owners.length === 0 ? (
          <span className="field-help">No owners yet.</span>
        ) : owners.map((name) => {
          const member = findMemberByName(members, name);
          return (
            <span className="selected-owner-chip" key={name}>
              <OwnerAvatar name={name} initials={member?.initials} size={24} />
              <span className="selected-owner-name" title={name}>{name}</span>
              <button
                type="button"
                aria-label={`Remove ${name}`}
                disabled={disabled}
                onClick={() => {
                  const nextOwners = latestOwnersRef.current.filter(
                    (owner) => owner !== name,
                  );
                  latestOwnersRef.current = nextOwners;
                  onChange(nextOwners);
                }}
              >
                ×
              </button>
            </span>
          );
        })}
      </div>
      <button
        type="button"
        className="text-action owner-picker-trigger"
        ref={triggerRef}
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Add owner
      </button>
      {open ? (
        <div
          className="owner-picker-panel"
          ref={panelRef}
          role="dialog"
          aria-label="Add owner"
          data-placement={panelPlacement}
        >
          <div className="owner-picker-options">
            {availableMembers.length === 0 ? (
              <span className="field-help">Everyone is already added.</span>
            ) : availableMembers.map((member) => (
              <button
                type="button"
                key={member.id}
                aria-label={`Add ${member.name}`}
                disabled={disabled || pending}
                onClick={() => selectOwner(member.name)}
              >
                <OwnerAvatar
                  name={member.name}
                  initials={member.initials}
                  size={24}
                />
                <span title={member.name}>{member.name}</span>
              </button>
            ))}
          </div>
          <div className="owner-picker-create">
            <label htmlFor={inputId}>New owner name</label>
            <input
              id={inputId}
              ref={inputRef}
              value={newOwnerName}
              disabled={pending || disabled}
              onChange={(event) => setNewOwnerName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                event.stopPropagation();
                void createOwner();
              }}
            />
            <button
              type="button"
              className="btn"
              disabled={!newOwnerName.trim() || pending || disabled}
              onClick={() => void createOwner()}
            >
              {pending ? "Creating…" : "Create owner"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
