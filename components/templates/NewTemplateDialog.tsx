"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useModalFocus } from "@/components/ui/useModalFocus";

export default function NewTemplateDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, description: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dialogRef = useModalFocus({ open, onClose, blocked: saving });

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setError("");
  }, [open]);

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      await onCreate(name.trim(), description.trim());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the Template.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={() => { if (!saving) onClose(); }}
    >
      <section
        ref={dialogRef}
        className="experiment-dialog template-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-template-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">Schema</p>
            <h2 id="new-template-title">New template</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close" disabled={saving}>
            ×
          </button>
        </header>
        <form onSubmit={submit} aria-busy={saving}>
          <label>
            <span>Name</span>
            <input
              aria-label="Template name"
              data-modal-initial-focus
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            <span>Description</span>
            <textarea
              aria-label="Template description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="dialog-actions">
            <button type="button" className="btn ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? "Creating…" : "Create template"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
