"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Experiment, Member, Task } from "@/lib/types";
import { createExperiment } from "@/lib/experiments/repository";

export default function CreateExperimentDialog({
  open,
  tasks,
  members,
  fixedTaskId,
  onClose,
  onCreated,
}: {
  open: boolean;
  tasks: Task[];
  members: Member[];
  fixedTaskId?: string;
  onClose: () => void;
  onCreated: (experiment: Experiment) => void;
}) {
  const [name, setName] = useState("");
  const [taskId, setTaskId] = useState(fixedTaskId ?? "");
  const [ownerId, setOwnerId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setTaskId(fixedTaskId ?? "");
    setOwnerId("");
    setError("");
    setSaving(false);
  }, [fixedTaskId, open]);

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !taskId || !ownerId) {
      setError("Name, Owner, and Task are required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const experiment = await createExperiment({
        taskId,
        ownerId,
        name: name.trim(),
      });
      onCreated(experiment);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the experiment.");
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="experiment-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-experiment-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">New record</p>
            <h2 id="new-experiment-title">Create experiment</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <form onSubmit={submit}>
          <label>
            <span>Name</span>
            <input
              aria-label="Experiment name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </label>
          <label>
            <span>Task</span>
            <select
              aria-label="Task"
              value={taskId}
              onChange={(event) => setTaskId(event.target.value)}
              disabled={Boolean(fixedTaskId)}
            >
              <option value="">Choose a Task</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>{task.title}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Owner</span>
            <select
              aria-label="Owner"
              value={ownerId}
              onChange={(event) => setOwnerId(event.target.value)}
            >
              <option value="">Choose an Owner</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </select>
          </label>
          <p className="dialog-help">
            Starts as Planned with empty Data, Object, Environment, Config, Result,
            Decision, and Note.
          </p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <footer>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? "Creating…" : "Create experiment"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
