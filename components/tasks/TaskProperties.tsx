"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeTags } from "@/lib/tasks/model";
import { STATUS_OPTIONS } from "@/lib/status";
import type {
  Member,
  TaskModel,
  TaskPatch,
  TaskPriority,
  TaskType,
} from "@/lib/types";

interface TaskPropertiesProps {
  task: TaskModel;
  types: TaskType[];
  members: Member[];
  onPatch: (patch: TaskPatch) => void;
}

const PRIORITIES: Array<{ value: TaskPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

function sameValues(left: string[], right: string[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

export default function TaskProperties({
  task,
  types,
  members,
  onPatch,
}: TaskPropertiesProps) {
  const [ownerDraft, setOwnerDraft] = useState(task.owners);
  const ownerDraftRef = useRef(task.owners);
  const [tagDraft, setTagDraft] = useState(task.tags);
  const tagDraftRef = useRef(task.tags);
  const [tagInput, setTagInput] = useState("");
  const ownerKey = task.owners.join("\u0000");
  const tagKey = task.tags.join("\u0000");

  useEffect(() => {
    const next = [...task.owners];
    ownerDraftRef.current = next;
    setOwnerDraft(next);
  }, [ownerKey, task.id, task.owners]);

  useEffect(() => {
    const next = normalizeTags(task.tags);
    tagDraftRef.current = next;
    setTagDraft(next);
    setTagInput("");
  }, [tagKey, task.id, task.tags]);

  function toggleOwner(name: string) {
    const current = ownerDraftRef.current;
    const next = current.includes(name)
      ? current.filter((owner) => owner !== name)
      : [...current, name];
    ownerDraftRef.current = next;
    setOwnerDraft(next);
    onPatch({ owners: next });
  }

  function commitTags() {
    const additions = tagInput.split(",");
    const next = normalizeTags([...tagDraftRef.current, ...additions]);
    setTagInput("");
    if (sameValues(next, tagDraftRef.current)) return;
    tagDraftRef.current = next;
    setTagDraft(next);
    onPatch({ tags: next });
  }

  function removeTag(tag: string) {
    const next = tagDraftRef.current.filter((candidate) => candidate !== tag);
    tagDraftRef.current = next;
    setTagDraft(next);
    onPatch({ tags: next });
  }

  return (
    <section className="task-properties" aria-label="Task properties">
      <div className="task-property">
        <label htmlFor={`task-status-${task.id}`}>Status</label>
        <select
          id={`task-status-${task.id}`}
          aria-label="Task status"
          value={task.status}
          onChange={(event) => onPatch({
            status: event.target.value as TaskModel["status"],
          })}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="task-property">
        <label htmlFor={`task-type-${task.id}`}>Type</label>
        <select
          id={`task-type-${task.id}`}
          aria-label="Task type"
          value={task.typeId ?? ""}
          onChange={(event) => onPatch({
            typeId: event.target.value || null,
          })}
        >
          <option value="">No type</option>
          {types.map((type) => (
            <option key={type.id} value={type.id}>{type.name}</option>
          ))}
        </select>
      </div>

      <div className="task-property task-property-tags">
        <label htmlFor={`task-tags-${task.id}`}>Tags</label>
        <div className="task-tag-editor">
          <div className="task-tag-list">
            {tagDraft.map((tag) => (
              <span className="task-tag" key={tag}>
                {tag}
                <button
                  type="button"
                  aria-label={`Remove ${tag}`}
                  onClick={() => removeTag(tag)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <input
            id={`task-tags-${task.id}`}
            aria-label="Task tags"
            value={tagInput}
            placeholder={tagDraft.length ? "Add tag" : "Add tags"}
            onChange={(event) => setTagInput(event.target.value)}
            onBlur={() => {
              if (tagInput.trim()) commitTags();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                commitTags();
              }
            }}
          />
        </div>
      </div>

      <fieldset className="task-property task-property-owner">
        <legend>Owner</legend>
        <div className="task-owner-options">
          {members.length === 0 ? (
            <span className="muted">No members yet</span>
          ) : members.map((member) => (
            <label key={member.id}>
              <input
                type="checkbox"
                checked={ownerDraft.includes(member.name)}
                onChange={() => toggleOwner(member.name)}
              />
              <span>{member.name}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="task-property">
        <label htmlFor={`task-priority-${task.id}`}>Priority</label>
        <select
          id={`task-priority-${task.id}`}
          aria-label="Task priority"
          value={task.priority}
          onChange={(event) => onPatch({
            priority: event.target.value as TaskPriority,
          })}
        >
          {PRIORITIES.map((priority) => (
            <option key={priority.value} value={priority.value}>
              {priority.label}
            </option>
          ))}
        </select>
      </div>

      <div className="task-property">
        <label htmlFor={`task-due-date-${task.id}`}>Due date</label>
        <input
          id={`task-due-date-${task.id}`}
          aria-label="Task due date"
          type="date"
          value={task.dueDate ?? ""}
          onChange={(event) => onPatch({
            dueDate: event.target.value || null,
          })}
        />
      </div>
    </section>
  );
}
