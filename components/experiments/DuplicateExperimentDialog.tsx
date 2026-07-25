"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Experiment, Member } from "@/lib/types";
import { duplicateExperiment } from "@/lib/experiments/repository";
import { formatExperimentId } from "@/lib/experiments/policy";

export default function DuplicateExperimentDialog({
  open,
  source,
  members,
  onClose,
  onCreated,
}: {
  open: boolean;
  source: Experiment;
  members: Member[];
  onClose: () => void;
  onCreated: (experiment: Experiment) => void;
}) {
  const mounted = useRef(false);
  const generation = useRef(0);
  const pending = useRef<object | null>(null);
  const [name, setName] = useState(`${source.name} copy`);
  const [ownerId, setOwnerId] = useState(source.owner_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      pending.current = null;
    };
  }, []);

  useEffect(() => {
    generation.current += 1;
    pending.current = null;
    setSaving(false);
    if (!open) return;
    setName(`${source.name} copy`);
    setOwnerId(source.owner_id ?? "");
    setError("");
  }, [open, source.id, source.name, source.owner_id]);

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    if (!name.trim() || !ownerId) {
      setError("Name and Owner are required.");
      return;
    }

    const submissionGeneration = generation.current;
    const operation = {};
    pending.current = operation;
    setSaving(true);
    setError("");
    try {
      const experiment = await duplicateExperiment(source, {
        name: name.trim(),
        ownerId,
      });
      if (
        mounted.current &&
        generation.current === submissionGeneration &&
        pending.current === operation
      ) {
        onCreated(experiment);
      }
    } catch (caught) {
      if (
        mounted.current &&
        generation.current === submissionGeneration &&
        pending.current === operation
      ) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not duplicate the experiment.",
        );
      }
    } finally {
      if (
        generation.current === submissionGeneration &&
        pending.current === operation
      ) {
        pending.current = null;
        if (mounted.current) setSaving(false);
      }
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
        className="experiment-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="duplicate-experiment-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">New planned record</p>
            <h2 id="duplicate-experiment-title">Duplicate experiment</h2>
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
          <div className="baseline-confirmation">
            Baseline = {formatExperimentId(source.experiment_no)} · {source.name}
          </div>
          <p>Copies: Task, Owner, Data, Object, Environment, Config</p>
          <p>Clears: Result, Decision, Note, attachments, timeline, run times</p>
          <label>
            <span>Name</span>
            <input
              aria-label="Duplicate name"
              value={name}
              disabled={saving}
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            <span>Owner</span>
            <select
              aria-label="Duplicate Owner"
              value={ownerId}
              disabled={saving}
              onChange={(event) => setOwnerId(event.target.value)}
            >
              <option value="">Choose an Owner</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </select>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <footer>
            <button type="button" className="btn" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? "Duplicating…" : "Duplicate experiment"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
