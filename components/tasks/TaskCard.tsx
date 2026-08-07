import { Card, Tooltip } from "@blueprintjs/core";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import OwnerAvatar from "@/components/ui/OwnerAvatar";
import StatusDot from "@/components/ui/StatusDot";
import Tag from "@/components/ui/Tag";
import { Button, IconButton } from "@/components/ui/blueprint/Button";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/blueprint/Menu";
import { Checkbox, HTMLSelect } from "@/components/ui/blueprint/Inputs";
import { STATUS_OPTIONS, statusLabel } from "@/lib/status";
import { relTime } from "@/lib/time";
import type {
  Member,
  TaskModel,
  TaskPatch,
  TaskType,
} from "@/lib/types";

export interface TaskCardProps {
  task: TaskModel;
  type: TaskType | null;
  types: TaskType[];
  members: Member[];
  showStatus: boolean;
  onPatch: (patch: TaskPatch) => Promise<void>;
  onDelete: () => Promise<void>;
}

export default function TaskCard({
  task,
  type,
  types,
  members,
  showStatus,
  onPatch,
  onDelete,
}: TaskCardProps) {
  const [editing, setEditing] = useState(false);
  const [ownerDraft, setOwnerDraft] = useState(task.owners);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const editorFocusRef = useRef<HTMLSelectElement>(null);
  // Set when the menu closes because "Quick edit" was chosen, so the editor's
  // own focus effect wins instead of onClosed yanking focus back to the trigger
  // after the popover's close transition.
  const skipFocusRestoreRef = useRef(false);
  const ownerDraftRef = useRef(task.owners);
  const authoritativeOwnersRef = useRef(task.owners);
  const ownerWriteTailRef = useRef<Promise<void>>(Promise.resolve());
  const pendingOwnerWritesRef = useRef(0);
  const latestOwnerWriteSucceededRef = useRef(true);
  const deletePendingRef = useRef(false);
  authoritativeOwnersRef.current = task.owners;

  useEffect(() => {
    if (editing) editorFocusRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (pendingOwnerWritesRef.current > 0) return;
    ownerDraftRef.current = task.owners;
    setOwnerDraft(task.owners);
  }, [task.owners]);

  function patch(patchValue: TaskPatch) {
    void onPatch(patchValue).catch(() => undefined);
  }

  function closeEditorAndRestoreFocus() {
    // The editor is closing, so any pending "skip focus restore" intent from
    // opening Quick edit no longer applies — clear it so a later menu close
    // (e.g. opening the actions menu again and pressing Escape) still restores
    // focus to the trigger.
    skipFocusRestoreRef.current = false;
    setEditing(false);
    triggerRef.current?.focus();
  }

  // Blueprint dismisses the menu for us (Escape/outside-click/item selection);
  // it fires `onClosed` once the menu is gone, where we restore focus to the
  // trigger — unless the close is transitioning into the Quick editor, in which
  // case the editor's own focus effect must win.
  function closeActionsAndRestoreFocus() {
    if (skipFocusRestoreRef.current) {
      skipFocusRestoreRef.current = false;
      return;
    }
    triggerRef.current?.focus();
  }

  function toggleOwner(owner: string) {
    const current = ownerDraftRef.current;
    const next = current.includes(owner)
      ? current.filter((value) => value !== owner)
      : [...current, owner];
    ownerDraftRef.current = next;
    setOwnerDraft(next);
    pendingOwnerWritesRef.current += 1;

    const write = ownerWriteTailRef.current.then(() => (
      onPatch({ owners: next })
    ));
    ownerWriteTailRef.current = write.then(
      () => {
        latestOwnerWriteSucceededRef.current = true;
      },
      () => {
        latestOwnerWriteSucceededRef.current = false;
      },
    ).finally(() => {
      pendingOwnerWritesRef.current -= 1;
      if (
        pendingOwnerWritesRef.current === 0
        && !latestOwnerWriteSucceededRef.current
      ) {
        const authoritative = authoritativeOwnersRef.current;
        ownerDraftRef.current = authoritative;
        setOwnerDraft(authoritative);
      }
    });
  }

  async function deleteFromActions() {
    if (deletePendingRef.current) return;
    deletePendingRef.current = true;
    try {
      await onDelete();
    } catch {
      // Board owns the stable mutation banner.
    } finally {
      deletePendingRef.current = false;
      if (triggerRef.current?.isConnected) {
        triggerRef.current.focus();
      }
    }
  }

  const actionItems: ActionMenuItem[] = [
    {
      text: "Quick edit",
      icon: "edit",
      onClick: () => {
        // The editor's focus effect should own focus after open; signal onClosed
        // (which fires once the popover finishes closing) to skip the trigger.
        skipFocusRestoreRef.current = true;
        setEditing(true);
      },
    },
    {
      text: "Delete",
      icon: "trash",
      intent: "danger",
      onClick: () => void deleteFromActions(),
    },
  ];

  return (
    <Card className="task-card">
      <div className="task-card-head">
        <span
          className={`task-card-type ${type ? "" : "is-empty"}`}
          title={type?.name ?? "No type"}
        >
          {type?.name ?? "No type"}
        </span>
        <Link href={`/task/${task.id}`} className="task-card-title">
          {task.title}
        </Link>
        <div className="task-card-menu">
          <ActionMenu items={actionItems} onClosed={closeActionsAndRestoreFocus}>
            <IconButton
              ref={triggerRef}
              icon="more"
              label={`Actions for ${task.title}`}
            />
          </ActionMenu>
        </div>
      </div>

      {task.tags.length > 0 ? (
        <div className="task-card-tags">
          {task.tags.map((tag) => (
            <Tag key={tag.toLocaleLowerCase()} value={tag} />
          ))}
        </div>
      ) : null}

      <div className="task-card-foot">
        <div className="task-card-owners">
          {task.owners.map((owner) => {
            const member = members.find((item) => item.name === owner);
            return (
              <OwnerAvatar
                key={owner}
                name={owner}
                initials={member?.initials}
                size={26}
              />
            );
          })}
          {task.owners.length === 0 ? (
            <span className="no-owner">No owner yet</span>
          ) : null}
        </div>
        <div className="task-card-meta">
          {showStatus ? (
            <StatusDot status={task.status} label={statusLabel(task.status)} />
          ) : null}
          <time className="task-card-updated" dateTime={task.updated_at}>
            Updated {relTime(task.updated_at)}
          </time>
        </div>
      </div>

      {editing ? (
        <section
          className="task-quick-edit"
          aria-label={`Quick edit ${task.title}`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              closeEditorAndRestoreFocus();
            }
          }}
        >
          <div className="quick-edit-head">
            <strong>Quick edit</strong>
            <Tooltip content="Close" placement="top">
              <IconButton
                icon="cross"
                label={`Close quick edit ${task.title}`}
                onClick={closeEditorAndRestoreFocus}
              />
            </Tooltip>
          </div>
          <label>
            Status
            <HTMLSelect
              ref={editorFocusRef}
              aria-label={`Status for ${task.title}`}
              value={task.status}
              onChange={(value) => patch({
                status: value as TaskModel["status"],
              })}
              options={STATUS_OPTIONS.map((option) => ({
                label: option.label,
                value: option.value,
              }))}
            />
          </label>
          <label>
            Type
            <HTMLSelect
              aria-label={`Type for ${task.title}`}
              value={task.typeId ?? ""}
              onChange={(value) => patch({
                typeId: value || null,
              })}
              options={[
                { label: "No type", value: "" },
                ...types.map((taskType) => ({
                  label: taskType.name,
                  value: taskType.id,
                })),
              ]}
            />
          </label>
          <fieldset>
            <legend>Owner</legend>
            {members.map((member) => {
              const checked = ownerDraft.includes(member.name);
              return (
                <Checkbox
                  key={member.id}
                  label={member.name}
                  checked={checked}
                  onChange={() => toggleOwner(member.name)}
                />
              );
            })}
          </fieldset>
          <Button
            intent="danger"
            text="Delete task"
            aria-label={`Delete ${task.title}`}
            onClick={() => void onDelete().catch(() => undefined)}
          />
        </section>
      ) : null}
    </Card>
  );
}
