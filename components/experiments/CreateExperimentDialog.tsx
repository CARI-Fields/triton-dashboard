"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Experiment, Member } from "@/lib/types";
import { createExperiment } from "@/lib/experiments/repository";
import { useModalFocus } from "@/components/ui/useModalFocus";

export default function CreateExperimentDialog({
  open,
  tasks,
  members,
  fixedTaskId,
  onClose,
  onCreated,
}: {
  open: boolean;
  tasks: Array<{ id: string; title: string }>;
  members: Member[];
  fixedTaskId?: string;
  onClose: () => void;
  onCreated: (experiment: Experiment) => void;
}) {
  const mounted = useRef(false);
  const openGeneration = useRef(0);
  const pending = useRef(false);
  const [name, setName] = useState("");
  const [taskId, setTaskId] = useState(fixedTaskId ?? "");
  const [ownerId, setOwnerId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dialogRef = useModalFocus({ open, onClose, blocked: saving });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      openGeneration.current += 1;
    };
  }, []);

  useEffect(() => {
    openGeneration.current += 1;
    if (!open) return;
    setName("");
    setTaskId(fixedTaskId ?? "");
    setOwnerId("");
    setError("");
  }, [fixedTaskId, open]);

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    if (!name.trim() || !taskId || !ownerId) {
      setError("Name, Owner, and Task are required.");
      return;
    }

    const submissionGeneration = openGeneration.current;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const experiment = await createExperiment({
        taskId,
        ownerId,
        name: name.trim(),
      });
      if (mounted.current && submissionGeneration === openGeneration.current) {
        onCreated(experiment);
      }
    } catch (caught) {
      if (mounted.current && submissionGeneration === openGeneration.current) {
        setError(caught instanceof Error ? caught.message : "Could not create the experiment.");
      }
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={() => {
        if (!pending.current) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="experiment-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-experiment-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">New record</p>
            <h2 id="new-experiment-title">Create experiment</h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
            disabled={saving}
          >
            ×
          </button>
        </header>
        <form onSubmit={submit} aria-busy={saving}>
          <label>
            <span>Name</span>
            <input
              aria-label="Experiment name"
              data-modal-initial-focus
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={saving}
            />
          </label>
          <label>
            <span>Task</span>
            <select
              aria-label="Task"
              value={taskId}
              onChange={(event) => setTaskId(event.target.value)}
              disabled={saving || Boolean(fixedTaskId)}
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
              disabled={saving}
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
            <button type="button" className="btn" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? "Creating…" : "Create experiment"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
