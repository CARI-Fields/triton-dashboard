import {
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icons";
import OwnerAvatar from "@/components/ui/OwnerAvatar";
import StatusDot from "@/components/ui/StatusDot";
import Tag from "@/components/ui/Tag";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [ownerDraft, setOwnerDraft] = useState(task.owners);
  const actionsId = useId();
  const actionsRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const editorFocusRef = useRef<HTMLSelectElement>(null);
  const ownerDraftRef = useRef(task.owners);
  const authoritativeOwnersRef = useRef(task.owners);
  const ownerWriteTailRef = useRef<Promise<void>>(Promise.resolve());
  const pendingOwnerWritesRef = useRef(0);
  const latestOwnerWriteSucceededRef = useRef(true);
  const deletePendingRef = useRef(false);
  authoritativeOwnersRef.current = task.owners;

  useEffect(() => {
    if (!menuOpen) return;
    firstActionRef.current?.focus();

    function closeOnOutsidePointer(event: MouseEvent) {
      if (
        actionsRef.current
        && !actionsRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsidePointer);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePointer);
    };
  }, [menuOpen]);

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

  function closeActionsAndRestoreFocus() {
    setMenuOpen(false);
    triggerRef.current?.focus();
  }

  function closeEditorAndRestoreFocus() {
    setEditing(false);
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
        setMenuOpen(false);
        triggerRef.current.focus();
      }
    }
  }

  return (
    <article className="task-card">
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
        <div className="task-card-menu" ref={actionsRef}>
          <button
            ref={triggerRef}
            type="button"
            className="icon-btn task-actions-trigger"
            aria-label={`Actions for ${task.title}`}
            aria-expanded={menuOpen}
            aria-controls={actionsId}
            onClick={() => setMenuOpen((current) => !current)}
          >
            <Icon name="more" size={18} />
          </button>
          {menuOpen ? (
            <div
              id={actionsId}
              className="task-actions-menu"
              role="group"
              aria-label={`Actions for ${task.title}`}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeActionsAndRestoreFocus();
                }
              }}
            >
              <button
                ref={firstActionRef}
                type="button"
                aria-label={`Quick edit ${task.title}`}
                onClick={() => {
                  setEditing(true);
                  setMenuOpen(false);
                }}
              >
                Quick edit
              </button>
              <button
                type="button"
                className="danger-action"
                aria-label={`Delete ${task.title}`}
                onClick={() => void deleteFromActions()}
              >
                Delete
              </button>
            </div>
          ) : null}
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
            <button
              type="button"
              className="icon-btn"
              aria-label={`Close quick edit ${task.title}`}
              onClick={closeEditorAndRestoreFocus}
            >
              <Icon name="close" size={15} />
            </button>
          </div>
          <label>
            Status
            <select
              ref={editorFocusRef}
              aria-label={`Status for ${task.title}`}
              value={task.status}
              onChange={(event) => patch({
                status: event.target.value as TaskModel["status"],
              })}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select
              aria-label={`Type for ${task.title}`}
              value={task.typeId ?? ""}
              onChange={(event) => patch({
                typeId: event.target.value || null,
              })}
            >
              <option value="">No type</option>
              {types.map((taskType) => (
                <option key={taskType.id} value={taskType.id}>
                  {taskType.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>Owner</legend>
            {members.map((member) => {
              const checked = ownerDraft.includes(member.name);
              return (
                <label key={member.id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOwner(member.name)}
                  />
                  {member.name}
                </label>
              );
            })}
          </fieldset>
          <button
            type="button"
            className="btn danger-action"
            aria-label={`Delete ${task.title}`}
            onClick={() => void onDelete().catch(() => undefined)}
          >
            Delete task
          </button>
        </section>
      ) : null}
    </article>
  );
}
