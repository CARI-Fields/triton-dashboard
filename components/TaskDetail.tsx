"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import MarkdownField from "@/components/MarkdownField";
import { supabase } from "@/lib/supabase";
import { KIND_COLOR, logActivity } from "@/lib/activity";
import { STATUS_OPTIONS, statusLabel } from "@/lib/status";
import { fmtDate, relTime } from "@/lib/time";
import type { Activity, Attachment, Experiment, Member, Module, Task } from "@/lib/types";

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function avatarText(name: string, members: Member[]): string {
  return members.find((m) => m.name === name)?.initials || initialsFromName(name);
}
function formatNum(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  if (Number.isInteger(v)) return v.toLocaleString();
  return parseFloat(v.toPrecision(5)).toString();
}
function nextPosition(items: { position: number }[]): number {
  return items.length ? Math.max(...items.map((i) => i.position)) + 1 : 0;
}

/** Close a popover when clicking outside of it. */
function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onOutside]);
  return ref;
}

/* ---------- Inline editable text ---------- */
function EditableText({
  value,
  onSave,
  placeholder,
  multiline = false,
  className = "",
  ariaLabel,
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function commit() {
    setEditing(false);
    const t = draft.trim();
    if (t !== value) onSave(t);
  }
  if (editing) {
    const p = {
      className: `edit-input ${className}`,
      value: draft,
      autoFocus: true,
      "aria-label": ariaLabel,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: commit,
    };
    return multiline ? (
      <textarea
        {...p}
        rows={2}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
      />
    ) : (
      <input
        {...p}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
      />
    );
  }
  return (
    <span
      className={`editable ${className} ${value ? "" : "placeholder"}`}
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setEditing(true); } }}
    >
      {value || placeholder || "Click to edit"}
    </span>
  );
}

/* ---------- Horizontal bar chart (dependency-free) ---------- */
function BarChart({ title, data }: { title: string; data: { label: string; value: number }[] }) {
  const values = data.map((d) => d.value);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const pct = (v: number) => ((v - lo) / span) * 100;
  const zero = pct(0);
  return (
    <div className="bar-chart">
      <div className="chart-title">{title}</div>
      <div className="bars">
        {data.map((d, i) => {
          const p = pct(d.value);
          return (
            <div className="bar-row" key={i}>
              <span className="bar-label" title={d.label}>{d.label}</span>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ left: `${Math.min(zero, p)}%`, width: `${Math.abs(p - zero)}%` }}
                />
              </div>
              <span className="bar-value">{formatNum(d.value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Metrics editor for one experiment ---------- */
function MetricsEditor({
  metrics,
  onChange,
}: {
  metrics: Record<string, number>;
  onChange: (m: Record<string, number>) => void;
}) {
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const entries = Object.entries(metrics);

  function setValue(k: string, raw: string) {
    const next = { ...metrics, [k]: raw === "" ? 0 : Number(raw) };
    onChange(next);
  }
  function remove(k: string) {
    const next = { ...metrics };
    delete next[k];
    onChange(next);
  }
  function add() {
    const k = newKey.trim();
    if (!k) return;
    onChange({ ...metrics, [k]: newVal === "" ? 0 : Number(newVal) });
    setNewKey("");
    setNewVal("");
  }

  return (
    <div className="metrics">
      {entries.length > 0 && (
        <div className="metric-grid">
          {entries.map(([k, v]) => (
            <div className="metric-row" key={k}>
              <span className="metric-key">{k}</span>
              <input
                className="metric-val"
                type="number"
                defaultValue={String(v)}
                onBlur={(e) => setValue(k, e.target.value)}
                aria-label={`${k} value`}
              />
              <button className="icon-btn" onClick={() => remove(k)} aria-label={`Remove ${k}`}>✕</button>
            </div>
          ))}
        </div>
      )}
      <div className="metric-add">
        <input
          placeholder="metric (e.g. reward)"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        />
        <input
          placeholder="value"
          type="number"
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        />
        <button className="btn" onClick={add}>Add metric</button>
      </div>
    </div>
  );
}

/* ---------- One experiment card ---------- */
function ExperimentCard({
  exp,
  attachments,
  uploading,
  onUpdate,
  onDelete,
  onUpload,
  onDeleteAttachment,
  onUpdateAttachment,
}: {
  exp: Experiment;
  attachments: Attachment[];
  uploading: boolean;
  onUpdate: (patch: Partial<Experiment>) => void;
  onDelete: () => void;
  onUpload: (files: FileList) => void;
  onDeleteAttachment: (att: Attachment) => void;
  onUpdateAttachment: (attId: string, patch: Partial<Attachment>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="exp-card">
      <div className="exp-head">
        <EditableText
          value={exp.name}
          className="exp-name"
          ariaLabel="Experiment name"
          onSave={(v) => onUpdate({ name: v })}
        />
        <span className="exp-updated">Updated {relTime(exp.updated_at)}</span>
        <button className="icon-btn" onClick={onDelete} aria-label="Delete experiment">✕</button>
      </div>
      <div className="exp-notes">
        <MarkdownField
          value={exp.notes}
          placeholder="Notes for this run — setup, observations… (Markdown)"
          onSave={(v) => onUpdate({ notes: v })}
        />
      </div>
      <MetricsEditor metrics={exp.metrics} onChange={(m) => onUpdate({ metrics: m })} />

      <div className="exp-plots">
        <div className="exp-sub-head">
          <span className="exp-sub-label">Plots &amp; images</span>
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? "Uploading…" : "⬆ Upload"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) onUpload(e.target.files);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
        </div>
        {attachments.length === 0 ? (
          <p className="muted small">No plots yet — upload PNG/JPG (matplotlib output, W&amp;B screenshots).</p>
        ) : (
          <div className="img-grid">
            {attachments.map((att) => (
              <figure className="img-card" key={att.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <a href={att.url} target="_blank" rel="noreferrer">
                  <img src={att.url} alt={att.caption || "plot"} loading="lazy" />
                </a>
                <figcaption>
                  <EditableText
                    value={att.caption}
                    placeholder="Add a caption…"
                    ariaLabel="Image caption"
                    onSave={(v) => onUpdateAttachment(att.id, { caption: v })}
                  />
                  <button className="icon-btn" onClick={() => onDeleteAttachment(att)} aria-label="Delete image">✕</button>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Main detail view ---------- */
export default function TaskDetail({ id }: { id: string }) {
  const [task, setTask] = useState<Task | null>(null);
  const [module, setModule] = useState<Module | null>(null);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [draftNote, setDraftNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [uploadingExpId, setUploadingExpId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const assignRef = useClickOutside(() => setAssignOpen(false));

  const reload = useCallback(async () => {
    if (!supabase || !id) return;
    const { data: t } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
    if (!t) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setTask(t as Task);
    const [modRes, expRes, attRes, memRes, actRes] = await Promise.all([
      supabase.from("modules").select("*").eq("id", (t as Task).module_id).maybeSingle(),
      supabase.from("experiments").select("*").eq("task_id", id).order("position"),
      supabase.from("attachments").select("*").eq("task_id", id).order("position"),
      supabase.from("members").select("*").order("position"),
      supabase.from("activity").select("*").eq("task_id", id).order("created_at", { ascending: false }),
    ]);
    setModule((modRes.data as Module) ?? null);
    setExperiments((expRes.data ?? []) as Experiment[]);
    setAttachments((attRes.data ?? []) as Attachment[]);
    setMembers((memRes.data ?? []) as Member[]);
    setActivity((actRes.data ?? []) as Activity[]);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (!supabase || !id) {
      setLoading(false);
      return;
    }
    const client = supabase;
    reload();
    const channel = client
      .channel(`task-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "experiments" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "attachments" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "activity" }, reload)
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, [id, reload]);

  const updateTask = useCallback(
    async (patch: Partial<Task>) => {
      if (!supabase) return;
      await supabase.from("tasks").update(patch).eq("id", id);
      if (patch.status) logActivity(id, `Status set to ${statusLabel(patch.status)}`, "status");
      if (patch.title) logActivity(id, `Renamed to “${patch.title}”`, "edit");
      if (patch.notes !== undefined) logActivity(id, "Updated progress notes", "note");
      reload();
    },
    [id, reload]
  );

  async function addExperiment() {
    if (!supabase) return;
    const name = `Experiment ${experiments.length + 1}`;
    await supabase.from("experiments").insert({
      task_id: id,
      name,
      notes: "",
      metrics: {},
      position: nextPosition(experiments),
    });
    logActivity(id, `Added experiment “${name}”`, "experiment");
    reload();
  }
  async function updateExperiment(expId: string, patch: Partial<Experiment>) {
    if (!supabase) return;
    await supabase.from("experiments").update(patch).eq("id", expId);
    reload();
  }
  async function deleteExperiment(expId: string) {
    if (!supabase) return;
    const exp = experiments.find((e) => e.id === expId);
    await supabase.from("experiments").delete().eq("id", expId);
    if (exp) logActivity(id, `Removed experiment “${exp.name}”`, "experiment");
    reload();
  }

  function toggleAssignee(name: string) {
    if (!task) return;
    const had = task.assignees.includes(name);
    const next = had
      ? task.assignees.filter((a) => a !== name)
      : [...task.assignees, name];
    updateTask({ assignees: next });
    logActivity(id, `${had ? "Unassigned" : "Assigned"} ${name}`, "assign");
  }

  async function addTimelineNote() {
    const v = draftNote.trim();
    if (!v) return;
    await logActivity(id, v, "comment");
    setDraftNote("");
    reload();
  }

  async function uploadToExperiment(expId: string, files: FileList) {
    if (!supabase) return;
    setUploadingExpId(expId);
    setErr(null);
    const client = supabase;
    const existing = attachments.filter((a) => a.experiment_id === expId);
    for (const file of Array.from(files)) {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${id}/${expId}/${crypto.randomUUID()}-${safe}`;
      const up = await client.storage.from("task-images").upload(path, file, { upsert: false });
      if (up.error) {
        setErr(up.error.message);
        continue;
      }
      const { data: pub } = client.storage.from("task-images").getPublicUrl(path);
      await client.from("attachments").insert({
        task_id: id,
        experiment_id: expId,
        url: pub.publicUrl,
        path,
        caption: "",
        position: nextPosition(existing),
      });
    }
    setUploadingExpId(null);
    reload();
  }

  async function deleteAttachment(att: Attachment) {
    if (!supabase) return;
    if (att.path) await supabase.storage.from("task-images").remove([att.path]);
    await supabase.from("attachments").delete().eq("id", att.id);
    reload();
  }
  async function updateAttachment(attId: string, patch: Partial<Attachment>) {
    if (!supabase) return;
    await supabase.from("attachments").update(patch).eq("id", attId);
    reload();
  }

  const metricKeys = useMemo(() => {
    const set = new Set<string>();
    for (const e of experiments) for (const k of Object.keys(e.metrics || {})) set.add(k);
    return Array.from(set).sort();
  }, [experiments]);

  if (loading) return <div className="wrap"><p className="state-note">Loading task…</p></div>;
  if (notFound || !task)
    return (
      <div className="wrap">
        <Link href="/" className="back-link">← Back to board</Link>
        <p className="state-note">Task not found. It may have been deleted.</p>
      </div>
    );

  return (
    <div className="wrap detail">
      <Link href="/" className="back-link">← Back to board</Link>

      <header className="detail-head">
        {module && (
          <span className={`mod-chip ${module.kind === "foundation" ? "found" : ""}`}>{module.name}</span>
        )}
        <h1 className="detail-title">
          <EditableText value={task.title} ariaLabel="Task title" onSave={(v) => updateTask({ title: v })} />
        </h1>
        <div className="detail-meta">
          <select
            className={`pill ${task.status}`}
            value={task.status}
            aria-label="Status"
            onChange={(e) => updateTask({ status: e.target.value as Task["status"] })}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <div className="assignees-inline">
            <div className="owners">
              {task.assignees.map((name) => (
                <span className="owner-chip" key={name} title={name}>
                  <span className="av">{avatarText(name, members)}</span>
                  <button
                    className="owner-x"
                    onClick={() => toggleAssignee(name)}
                    aria-label={`Unassign ${name}`}
                    title={`Unassign ${name}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
              <div className="picker" ref={assignRef}>
                <button
                  className="add-owner"
                  onClick={() => setAssignOpen((o) => !o)}
                  aria-label="Assign people"
                  title="Assign people"
                >
                  +
                </button>
                {assignOpen && (
                  <div className="menu" role="menu">
                    {members
                      .filter((m) => !task.assignees.includes(m.name))
                      .map((m) => (
                        <button key={m.id} className="menu-item" onClick={() => toggleAssignee(m.name)}>
                          <span className="av">{m.initials || initialsFromName(m.name)}</span>
                          {m.name}
                        </button>
                      ))}
                    {members.length === 0 && (
                      <div className="menu-empty">Add teammates on the board first.</div>
                    )}
                    {members.length > 0 && members.every((m) => task.assignees.includes(m.name)) && (
                      <div className="menu-empty">Everyone is assigned.</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <span className="detail-dates">
            Created {fmtDate(task.created_at)} · Updated {relTime(task.updated_at)}
          </span>
        </div>
      </header>

      {err && <div className="error-banner">{err}</div>}

      {/* Notes / progress */}
      <section className="detail-section">
        <div className="detail-section-head"><h2>Progress &amp; notes</h2></div>
        <MarkdownField
          value={task.notes}
          minHeight={160}
          placeholder="Click to add progress, findings, and decisions… (Markdown supported: headings, lists, **bold**, tables)"
          onSave={(v) => updateTask({ notes: v })}
        />
      </section>

      {/* Charts */}
      {metricKeys.length > 0 && (
        <section className="detail-section">
          <div className="detail-section-head"><h2>Results at a glance</h2></div>
          <div className="chart-grid">
            {metricKeys.map((key) => {
              const data = experiments
                .filter((e) => key in (e.metrics || {}))
                .map((e) => ({ label: e.name, value: Number(e.metrics[key]) }));
              return <BarChart key={key} title={key} data={data} />;
            })}
          </div>
        </section>
      )}

      {/* Experiments */}
      <section className="detail-section">
        <div className="detail-section-head">
          <h2>Experiments</h2>
          <button className="btn primary" onClick={addExperiment}>+ Add experiment</button>
        </div>
        {experiments.length === 0 ? (
          <p className="muted">No experiments yet. Add one to log a run and its metrics.</p>
        ) : (
          <div className="exp-list">
            {experiments.map((exp) => (
              <ExperimentCard
                key={exp.id}
                exp={exp}
                attachments={attachments.filter((a) => a.experiment_id === exp.id)}
                uploading={uploadingExpId === exp.id}
                onUpdate={(patch) => updateExperiment(exp.id, patch)}
                onDelete={() => deleteExperiment(exp.id)}
                onUpload={(files) => uploadToExperiment(exp.id, files)}
                onDeleteAttachment={deleteAttachment}
                onUpdateAttachment={updateAttachment}
              />
            ))}
          </div>
        )}
      </section>

      {/* Activity timeline */}
      <section className="detail-section">
        <div className="detail-section-head"><h2>Activity timeline</h2></div>
        <div className="timeline-add">
          <input
            value={draftNote}
            placeholder="Add a note to the timeline…"
            onChange={(e) => setDraftNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addTimelineNote(); }}
            aria-label="Add a note to the timeline"
          />
          <button className="btn primary" onClick={addTimelineNote}>Add note</button>
        </div>
        {activity.length === 0 ? (
          <p className="muted">No activity yet.</p>
        ) : (
          <div className="timeline">
            {activity.map((ev, i) => (
              <div className="tl-row" key={ev.id}>
                <div className="tl-rail">
                  <span className="tl-dot" style={{ background: KIND_COLOR[ev.kind] ?? "var(--todo)" }} />
                  {i < activity.length - 1 && <span className="tl-line" />}
                </div>
                <div className="tl-body">
                  <div className="tl-text">{ev.text}</div>
                  <div className="tl-time">{relTime(ev.created_at)} · {fmtDate(ev.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
