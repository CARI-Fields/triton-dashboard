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
  const actionsId = useId();
  const actionsRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);

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

  function patch(patchValue: TaskPatch) {
    void onPatch(patchValue).catch(() => undefined);
  }

  function closeActionsAndRestoreFocus() {
    setMenuOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <article className="task-card">
      <div className="task-card-head">
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
                onClick={() => {
                  setMenuOpen(false);
                  void onDelete().catch(() => undefined);
                }}
              >
                Delete
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="task-card-type">{type?.name ?? "No type"}</div>

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
        {showStatus ? (
          <StatusDot status={task.status} label={statusLabel(task.status)} />
        ) : null}
      </div>
      <time className="task-card-updated" dateTime={task.updated_at}>
        Updated {relTime(task.updated_at)}
      </time>

      {editing ? (
        <section
          className="task-quick-edit"
          aria-label={`Quick edit ${task.title}`}
        >
          <div className="quick-edit-head">
            <strong>Quick edit</strong>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Close quick edit ${task.title}`}
              onClick={() => setEditing(false)}
            >
              <Icon name="close" size={15} />
            </button>
          </div>
          <label>
            Status
            <select
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
              const checked = task.owners.includes(member.name);
              return (
                <label key={member.id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => patch({
                      owners: checked
                        ? task.owners.filter(
                          (owner) => owner !== member.name,
                        )
                        : [...task.owners, member.name],
                    })}
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
