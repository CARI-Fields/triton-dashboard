"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { KIND_COLOR } from "@/lib/activity";
import { addExperimentTimelineNote } from "@/lib/experiments/repository";
import { fmtDate, relTime } from "@/lib/time";
import type { Activity, Experiment } from "@/lib/types";

export default function ExperimentTimeline({
  experiment,
  activity,
  onChanged,
}: {
  experiment: Experiment;
  activity: Activity[];
  onChanged: () => void;
}) {
  const mounted = useRef(false);
  const committedIdentity = useRef({ id: experiment.id, generation: 0 });
  const pending = useRef(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (committedIdentity.current.id !== experiment.id) {
      committedIdentity.current = {
        id: experiment.id,
        generation: committedIdentity.current.generation + 1,
      };
    }
    pending.current = false;
    setNote("");
    setError("");
    setSaving(false);
  }, [experiment.id]);

  async function addNote() {
    if (!note.trim() || pending.current) return;
    const operationIdentity = committedIdentity.current;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      await addExperimentTimelineNote(experiment, note);
      if (
        mounted.current &&
        committedIdentity.current === operationIdentity
      ) {
        setNote("");
        onChanged();
      }
    } catch (caught) {
      if (
        mounted.current &&
        committedIdentity.current === operationIdentity
      ) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not add the timeline note.",
        );
      }
    } finally {
      if (committedIdentity.current === operationIdentity) {
        pending.current = false;
        if (mounted.current) setSaving(false);
      }
    }
  }

  return (
    <section
      className="experiment-timeline"
      aria-label="Experiment activity timeline"
      aria-busy={saving}
    >
      <p className="field-help">Anonymous events from the shared team account.</p>
      <div className="timeline-note-form">
        <textarea
          aria-label="Experiment timeline note"
          value={note}
          disabled={saving}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Add a factual note"
        />
        <button
          type="button"
          className="btn"
          disabled={saving || !note.trim()}
          onClick={() => void addNote()}
        >
          Add note
        </button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="timeline">
        {activity.length === 0 && <p className="muted">No activity yet.</p>}
        {activity.map((event, index) => (
          <div className="tl-row" key={event.id}>
            <div className="tl-rail">
              <span
                className="tl-dot"
                style={{ background: KIND_COLOR[event.kind] }}
              />
              {index < activity.length - 1 && <span className="tl-line" />}
            </div>
            <div className="tl-body">
              <div className="tl-text">{event.text}</div>
              <div className="tl-time">
                {relTime(event.created_at)} · {fmtDate(event.created_at)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
