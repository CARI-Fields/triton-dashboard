import { useEffect, useRef, useState } from "react";
import Drawer from "@/components/ui/Drawer";
import { Icon } from "@/components/ui/Icons";
import OwnerPicker from "@/components/tasks/OwnerPicker";
import Tag from "@/components/ui/Tag";
import { normalizeTags } from "@/lib/tasks/model";
import { STATUS_OPTIONS } from "@/lib/status";
import type {
  Member,
  NewTaskInput,
  Status,
  TaskType,
} from "@/lib/types";

const EMPTY_DRAFT: NewTaskInput = {
  title: "",
  status: "todo",
  typeId: null,
  tags: [],
  owners: [],
  priority: "medium",
  dueDate: null,
  description: "",
};

export interface AddTaskDrawerProps {
  open: boolean;
  types: TaskType[];
  members: Member[];
  defaults?: {
    status?: Status;
    typeId?: string | null;
  };
  onClose: () => void;
  onCreate: (input: NewTaskInput) => Promise<void>;
  onCreateType: (name: string) => Promise<string>;
  onCreateOwner: (name: string) => Promise<Member>;
}

function draftFromDefaults(
  defaults: AddTaskDrawerProps["defaults"],
): NewTaskInput {
  return {
    ...EMPTY_DRAFT,
    status: defaults?.status ?? EMPTY_DRAFT.status,
    typeId: defaults?.typeId ?? EMPTY_DRAFT.typeId,
  };
}

function errorMessage(caught: unknown): string {
  if (caught instanceof Error) return caught.message;
  if (
    typeof caught === "object"
    && caught !== null
    && "message" in caught
    && typeof caught.message === "string"
  ) {
    return caught.message;
  }
  return "The request failed.";
}

export default function AddTaskDrawer({
  open,
  types,
  members,
  defaults,
  onClose,
  onCreate,
  onCreateType,
  onCreateOwner,
}: AddTaskDrawerProps) {
  const [draft, setDraft] = useState<NewTaskInput>(() => (
    draftFromDefaults(defaults)
  ));
  const [tagInput, setTagInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [creatingType, setCreatingType] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [typePending, setTypePending] = useState(false);
  const [ownerPending, setOwnerPending] = useState(false);
  const wasOpen = useRef(false);
  const taskPendingRef = useRef(false);
  const typePendingRef = useRef(false);
  const ownerPendingRef = useRef(false);
  const interactionPending = pending || typePending || ownerPending;

  useEffect(() => {
    if (open && !wasOpen.current) {
      setDraft(draftFromDefaults(defaults));
      setTagInput("");
      setError(null);
      setCreatingType(false);
      setNewTypeName("");
      ownerPendingRef.current = false;
      setOwnerPending(false);
    }
    wasOpen.current = open;
  }, [defaults?.status, defaults?.typeId, open]);

  function updateDraft<K extends keyof NewTaskInput>(
    field: K,
    value: NewTaskInput[K],
  ) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function addTags(values: string[]) {
    setDraft((current) => ({
      ...current,
      tags: normalizeTags([...current.tags, ...values]),
    }));
  }

  function handleTagChange(value: string) {
    if (!value.includes(",")) {
      setTagInput(value);
      return;
    }
    const parts = value.split(",");
    const remainder = parts.pop() ?? "";
    addTags(parts);
    setTagInput(remainder.trimStart());
  }

  function commitTagInput() {
    const nextTags = normalizeTags([
      ...draft.tags,
      ...tagInput.split(","),
    ]);
    setDraft((current) => ({ ...current, tags: nextTags }));
    setTagInput("");
    return nextTags;
  }

  async function submitDraft() {
    if (
      pending
      || typePending
      || ownerPending
      || taskPendingRef.current
      || typePendingRef.current
      || ownerPendingRef.current
    ) return;
    const title = draft.title.trim();
    if (!title) {
      setError("Task title is required.");
      return;
    }

    const tags = commitTagInput();
    const input: NewTaskInput = {
      ...draft,
      title,
      tags,
      dueDate: draft.dueDate || null,
    };
    taskPendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      await onCreate(input);
      setDraft({ ...EMPTY_DRAFT });
      setTagInput("");
      onClose();
    } catch (caught) {
      setError(`Could not create task. ${errorMessage(caught)}`);
    } finally {
      taskPendingRef.current = false;
      setPending(false);
    }
  }

  async function submitType() {
    const name = newTypeName.trim();
    if (
      !name
      || pending
      || typePending
      || ownerPending
      || taskPendingRef.current
      || typePendingRef.current
      || ownerPendingRef.current
    ) return;
    typePendingRef.current = true;
    setTypePending(true);
    setError(null);
    try {
      const typeId = await onCreateType(name);
      setDraft((current) => ({ ...current, typeId }));
      setNewTypeName("");
      setCreatingType(false);
    } catch (caught) {
      setError(`Could not create type. ${errorMessage(caught)}`);
    } finally {
      typePendingRef.current = false;
      setTypePending(false);
    }
  }

  function handleOwnerPendingChange(nextPending: boolean) {
    ownerPendingRef.current = nextPending;
    setOwnerPending(nextPending);
  }

  function closeDrawer() {
    if (
      taskPendingRef.current
      || typePendingRef.current
      || ownerPendingRef.current
    ) return;
    onClose();
  }

  return (
    <Drawer
      open={open}
      titleId="add-task-title"
      onClose={closeDrawer}
      blocked={interactionPending}
      footer={(
        <>
          <button
            type="button"
            className="btn"
            onClick={closeDrawer}
            disabled={interactionPending}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-task-form"
            className="btn primary"
            disabled={interactionPending}
          >
            {pending ? "Creating…" : "Create task"}
            <span className="keyboard-hint" aria-hidden="true">⌘ Enter</span>
          </button>
        </>
      )}
    >
      <div className="add-task-header">
        <div>
          <p className="eyebrow">New task</p>
          <h2 id="add-task-title">Create task</h2>
        </div>
        <button
          type="button"
          className="icon-btn drawer-close"
          aria-label="Close create task"
          onClick={closeDrawer}
          disabled={interactionPending}
        >
          <Icon name="close" />
        </button>
      </div>

      <form
        id="add-task-form"
        className="add-task-form"
        aria-label="Create task"
        onSubmit={(event) => {
          event.preventDefault();
          void submitDraft();
        }}
        onKeyDown={(event) => {
          if (
            event.key === "Enter"
            && (event.metaKey || event.ctrlKey)
          ) {
            event.preventDefault();
            void submitDraft();
          }
        }}
      >
        {error ? (
          <div className="form-alert" role="alert">{error}</div>
        ) : null}

        <div className="add-task-field title-field">
          <label htmlFor="task-title-input">Task title</label>
          <input
            id="task-title-input"
            data-modal-initial-focus
            value={draft.title}
            placeholder="What needs to be done?"
            disabled={interactionPending}
            onChange={(event) => updateDraft("title", event.target.value)}
          />
        </div>

        <div className="add-task-field">
          <label htmlFor="task-status-input">Status</label>
          <select
            id="task-status-input"
            value={draft.status}
            disabled={interactionPending}
            onChange={(event) => (
              updateDraft("status", event.target.value as Status)
            )}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="add-task-field type-field">
          <label htmlFor="task-type-input">Type</label>
          <div className="field-control">
            <div className="type-control-row">
              <select
                id="task-type-input"
                value={draft.typeId ?? ""}
                disabled={interactionPending}
                onChange={(event) => (
                  updateDraft("typeId", event.target.value || null)
                )}
              >
                <option value="">No type</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>
              <button
                type="button"
                className="text-action"
                onClick={() => setCreatingType((current) => !current)}
                disabled={interactionPending}
              >
                <Icon name="plus" size={16} />
                Create type
              </button>
            </div>
            <p className="field-help">
              Types group work. Tags add flexible context.
            </p>
            {creatingType ? (
              <div className="inline-create">
                <label htmlFor="new-drawer-type">New type name</label>
                <input
                  id="new-drawer-type"
                  value={newTypeName}
                  onChange={(event) => setNewTypeName(event.target.value)}
                  disabled={interactionPending}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.stopPropagation();
                      void submitType();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => void submitType()}
                  disabled={interactionPending}
                >
                  Add type
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="add-task-field tags-field">
          <label htmlFor="task-tags-input">Tags</label>
          <div className="field-control">
            {draft.tags.length > 0 ? (
              <div className="tag-list">
                {draft.tags.map((tag) => (
                  <Tag
                    key={tag.toLocaleLowerCase()}
                    value={tag}
                    removable
                    onRemove={(value) => updateDraft(
                      "tags",
                      draft.tags.filter((tagValue) => tagValue !== value),
                    )}
                  />
                ))}
              </div>
            ) : null}
            <input
              id="task-tags-input"
              value={tagInput}
              placeholder="Add tags with comma or Enter"
              disabled={interactionPending}
              onChange={(event) => handleTagChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitTagInput();
                }
              }}
              onBlur={() => {
                if (tagInput.trim()) commitTagInput();
              }}
            />
          </div>
        </div>

        <div
          className="add-task-field owner-field"
          role="group"
          aria-labelledby="task-owner-label"
        >
          <span className="field-label" id="task-owner-label">
            Owner
          </span>
          <div className="field-control">
            <OwnerPicker
              members={members}
              owners={draft.owners}
              disabled={interactionPending}
              onCreateOwner={onCreateOwner}
              onPendingChange={handleOwnerPendingChange}
              onChange={(owners) => updateDraft("owners", owners)}
            />
          </div>
        </div>

        <div className="add-task-field">
          <label htmlFor="task-priority-input">Priority</label>
          <select
            id="task-priority-input"
            value={draft.priority}
            disabled={interactionPending}
            onChange={(event) => updateDraft(
              "priority",
              event.target.value as NewTaskInput["priority"],
            )}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        <div className="add-task-field">
          <label htmlFor="task-due-date-input">Due date</label>
          <input
            id="task-due-date-input"
            type="date"
            value={draft.dueDate ?? ""}
            disabled={interactionPending}
            onChange={(event) => updateDraft(
              "dueDate",
              event.target.value || null,
            )}
          />
        </div>

        <div className="add-task-field description-field">
          <label htmlFor="task-description-input">Description</label>
          <textarea
            id="task-description-input"
            rows={7}
            value={draft.description}
            placeholder="Add context, acceptance criteria, or links…"
            disabled={interactionPending}
            onChange={(event) => (
              updateDraft("description", event.target.value)
            )}
          />
        </div>
      </form>
    </Drawer>
  );
}
