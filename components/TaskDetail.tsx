"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import MarkdownField from "@/components/MarkdownField";
import { supabase } from "@/lib/supabase";
import type { Attachment, Experiment, Member, Module, Status, Task } from "@/lib/types";

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "blocked", label: "Blocked" },
];

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
  onUpdate,
  onDelete,
}: {
  exp: Experiment;
  onUpdate: (patch: Partial<Experiment>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="exp-card">
      <div className="exp-head">
        <EditableText
          value={exp.name}
          className="exp-name"
          ariaLabel="Experiment name"
          onSave={(v) => onUpdate({ name: v })}
        />
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
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    if (!supabase || !id) return;
    const { data: t } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
    if (!t) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setTask(t as Task);
    const [modRes, expRes, attRes, memRes] = await Promise.all([
      supabase.from("modules").select("*").eq("id", (t as Task).module_id).maybeSingle(),
      supabase.from("experiments").select("*").eq("task_id", id).order("position"),
      supabase.from("attachments").select("*").eq("task_id", id).order("position"),
      supabase.from("members").select("*").order("position"),
    ]);
    setModule((modRes.data as Module) ?? null);
    setExperiments((expRes.data ?? []) as Experiment[]);
    setAttachments((attRes.data ?? []) as Attachment[]);
    setMembers((memRes.data ?? []) as Member[]);
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
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, [id, reload]);

  const updateTask = useCallback(
    async (patch: Partial<Task>) => {
      if (!supabase) return;
      await supabase.from("tasks").update(patch).eq("id", id);
      reload();
    },
    [id, reload]
  );

  async function addExperiment() {
    if (!supabase) return;
    await supabase.from("experiments").insert({
      task_id: id,
      name: `Experiment ${experiments.length + 1}`,
      notes: "",
      metrics: {},
      position: nextPosition(experiments),
    });
    reload();
  }
  async function updateExperiment(expId: string, patch: Partial<Experiment>) {
    if (!supabase) return;
    await supabase.from("experiments").update(patch).eq("id", expId);
    reload();
  }
  async function deleteExperiment(expId: string) {
    if (!supabase) return;
    await supabase.from("experiments").delete().eq("id", expId);
    reload();
  }

  function toggleAssignee(name: string) {
    if (!task) return;
    const next = task.assignees.includes(name)
      ? task.assignees.filter((a) => a !== name)
      : [...task.assignees, name];
    updateTask({ assignees: next });
  }

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (!supabase || !e.target.files?.length) return;
    setUploading(true);
    setErr(null);
    const client = supabase;
    for (const file of Array.from(e.target.files)) {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${id}/${crypto.randomUUID()}-${safe}`;
      const up = await client.storage.from("task-images").upload(path, file, { upsert: false });
      if (up.error) {
        setErr(up.error.message);
        continue;
      }
      const { data: pub } = client.storage.from("task-images").getPublicUrl(path);
      await client.from("attachments").insert({
        task_id: id,
        url: pub.publicUrl,
        path,
        caption: "",
        position: nextPosition(attachments),
      });
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
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
            onChange={(e) => updateTask({ status: e.target.value as Status })}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <div className="assignees-inline">
            <div className="owners">
              {task.assignees.map((name) => (
                <span className="av" key={name} title={name}>{avatarText(name, members)}</span>
              ))}
            </div>
            <details className="picker-details">
              <summary className="add-owner" aria-label="Assign people">+</summary>
              <div className="menu">
                {members.map((m) => {
                  const checked = task.assignees.includes(m.name);
                  return (
                    <button key={m.id} className="menu-item" onClick={() => toggleAssignee(m.name)}>
                      <span className="av">{m.initials || initialsFromName(m.name)}</span>
                      {m.name}
                      {checked && <span className="check">✓</span>}
                    </button>
                  );
                })}
                {members.length === 0 && <div className="menu-empty">Add teammates on the board first.</div>}
              </div>
            </details>
          </div>
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
                onUpdate={(patch) => updateExperiment(exp.id, patch)}
                onDelete={() => deleteExperiment(exp.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Attachments */}
      <section className="detail-section">
        <div className="detail-section-head">
          <h2>Plots &amp; images</h2>
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? "Uploading…" : "⬆ Upload images"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={onPickFiles}
          />
        </div>
        {attachments.length === 0 ? (
          <p className="muted">No images yet. Upload plots (PNG/JPG) — matplotlib output, W&amp;B screenshots, etc.</p>
        ) : (
          <div className="img-grid">
            {attachments.map((att) => (
              <figure className="img-card" key={att.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <a href={att.url} target="_blank" rel="noreferrer">
                  <img src={att.url} alt={att.caption || "attachment"} loading="lazy" />
                </a>
                <figcaption>
                  <EditableText
                    value={att.caption}
                    placeholder="Add a caption…"
                    ariaLabel="Image caption"
                    onSave={(v) => updateAttachment(att.id, { caption: v })}
                  />
                  <button className="icon-btn" onClick={() => deleteAttachment(att)} aria-label="Delete image">✕</button>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
