import { useEffect, useRef, useState } from "react";
import Drawer from "@/components/ui/Drawer";
import { Icon } from "@/components/ui/Icons";
import OwnerAvatar from "@/components/ui/OwnerAvatar";
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
  onCreateType: (name: string) => Promise<void>;
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
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setDraft(draftFromDefaults(defaults));
      setTagInput("");
      setError(null);
      setCreatingType(false);
      setNewTypeName("");
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
    if (pending) return;
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
      setPending(false);
    }
  }

  async function submitType() {
    const name = newTypeName.trim();
    if (!name || typePending) return;
    setTypePending(true);
    setError(null);
    try {
      await onCreateType(name);
      setNewTypeName("");
      setCreatingType(false);
    } catch (caught) {
      setError(`Could not create type. ${errorMessage(caught)}`);
    } finally {
      setTypePending(false);
    }
  }

  return (
    <Drawer
      open={open}
      titleId="add-task-title"
      onClose={onClose}
      blocked={pending || typePending}
      footer={(
        <>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={pending || typePending}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-task-form"
            className="btn primary"
            disabled={pending || typePending}
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
          onClick={onClose}
          disabled={pending || typePending}
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
            onChange={(event) => updateDraft("title", event.target.value)}
          />
        </div>

        <div className="add-task-field">
          <label htmlFor="task-status-input">Status</label>
          <select
            id="task-status-input"
            value={draft.status}
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
                  disabled={typePending}
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

        <fieldset className="add-task-field owner-field">
          <legend>Owner</legend>
          <div className="field-control owner-options">
            {members.length > 0 ? members.map((member) => {
              const checked = draft.owners.includes(member.name);
              return (
                <label key={member.id} className="owner-option">
                  <input
                    type="checkbox"
                    aria-label={member.name}
                    checked={checked}
                    onChange={() => updateDraft(
                      "owners",
                      checked
                        ? draft.owners.filter((name) => name !== member.name)
                        : [...draft.owners, member.name],
                    )}
                  />
                  <OwnerAvatar
                    name={member.name}
                    initials={member.initials}
                    size={24}
                  />
                  <span>{member.name}</span>
                </label>
              );
            }) : (
              <span className="field-help">No owners yet.</span>
            )}
          </div>
        </fieldset>

        <div className="add-task-field">
          <label htmlFor="task-priority-input">Priority</label>
          <select
            id="task-priority-input"
            value={draft.priority}
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
            onChange={(event) => (
              updateDraft("description", event.target.value)
            )}
          />
        </div>
      </form>
    </Drawer>
  );
}
