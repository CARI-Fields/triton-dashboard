"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import OwnerAvatar from "@/components/ui/OwnerAvatar";
import { findMemberByName, memberNameKey } from "@/lib/members";
import type { Member } from "@/lib/types";

export interface OwnerPickerProps {
  members: Member[];
  owners: string[];
  onChange: (owners: string[]) => void;
  onCreateOwner: (name: string) => Promise<Member>;
  disabled?: boolean;
}

export default function OwnerPicker({
  members,
  owners,
  onChange,
  onCreateOwner,
  disabled = false,
}: OwnerPickerProps) {
  const [open, setOpen] = useState(false);
  const [newOwnerName, setNewOwnerName] = useState("");
  const [pending, setPending] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef(false);
  const inputId = useId();
  const ownerKeys = useMemo(
    () => new Set(owners.map(memberNameKey)),
    [owners],
  );
  const availableMembers = members.filter(
    (member) => !ownerKeys.has(memberNameKey(member.name)),
  );

  function closePanel(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) {
      queueMicrotask(() => triggerRef.current?.focus());
    }
  }

  function selectOwner(name: string) {
    if (!ownerKeys.has(memberNameKey(name))) {
      onChange([...owners, name]);
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
    setPending(true);
    try {
      const created = await onCreateOwner(name);
      selectOwner(created.name);
    } catch {
      inputRef.current?.focus();
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const closeOnPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closePanel();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
    };
    document.addEventListener("pointerdown", closeOnPointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointer);
      document.removeEventListener("keydown", closeOnEscape);
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
                onClick={() => onChange(owners.filter((owner) => owner !== name))}
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
        <div className="owner-picker-panel" role="dialog" aria-label="Add owner">
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
          <form
            className="owner-picker-create"
            onSubmit={(event) => {
              event.preventDefault();
              void createOwner();
            }}
          >
            <label htmlFor={inputId}>New owner name</label>
            <input
              id={inputId}
              ref={inputRef}
              value={newOwnerName}
              disabled={pending || disabled}
              onChange={(event) => setNewOwnerName(event.target.value)}
            />
            <button
              type="submit"
              className="btn"
              disabled={!newOwnerName.trim() || pending || disabled}
            >
              {pending ? "Creating…" : "Create owner"}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
