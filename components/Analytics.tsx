"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { STATUS_OPTIONS } from "@/lib/status";
import type { Member, Module, Status, Task } from "@/lib/types";

const STATUS_COLOR: Record<Status, string> = {
  todo: "#abb3bf",
  in_progress: "var(--warn)",
  done: "var(--good)",
  blocked: "var(--crit)",
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Analytics() {
  const [modules, setModules] = useState<Module[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!supabase) return;
    const [m, t, mem] = await Promise.all([
      supabase.from("modules").select("*").order("position"),
      supabase.from("tasks").select("*").order("position"),
      supabase.from("members").select("*").order("position"),
    ]);
    setModules((m.data ?? []) as Module[]);
    setTasks((t.data ?? []) as Task[]);
    setMembers((mem.data ?? []) as Member[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    const client = supabase;
    reload();
    const channel = client
      .channel("analytics-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "modules" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "members" }, reload)
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [reload]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const counts: Record<Status, number> = { todo: 0, in_progress: 0, done: 0, blocked: 0 };
    for (const t of tasks) counts[t.status] += 1;
    const completion = total ? counts.done / total : 0;
    const maxCount = Math.max(1, ...Object.values(counts));

    const statusBars = STATUS_OPTIONS.map((o) => ({
      label: o.label,
      count: counts[o.value],
      width: `${((counts[o.value] / maxCount) * 100).toFixed(1)}%`,
      color: STATUS_COLOR[o.value],
    }));

    const workload = members
      .map((m) => {
        const mine = tasks.filter((t) => t.assignees.includes(m.name));
        const done = mine.filter((t) => t.status === "done").length;
        const prog = mine.filter((t) => t.status === "in_progress").length;
        const tot = mine.length || 1;
        return {
          name: m.name,
          initials: m.initials || initialsFromName(m.name),
          summary: `${mine.length} task${mine.length === 1 ? "" : "s"}`,
          doneWidth: `${((done / tot) * 100).toFixed(1)}%`,
          progWidth: `${((prog / tot) * 100).toFixed(1)}%`,
          count: mine.length,
        };
      })
      .filter((w) => w.count > 0);

    const moduleStats = modules.map((m) => {
      const mine = tasks.filter((t) => t.module_id === m.id);
      const done = mine.filter((t) => t.status === "done").length;
      const pct = mine.length ? done / mine.length : 0;
      return {
        id: m.id,
        name: m.name,
        kindLabel: m.kind === "foundation" ? "Foundation" : "Pipeline",
        pct,
        complete: pct >= 1,
        summary: `${done} / ${mine.length} done`,
      };
    });

    const kpis = [
      { label: "Total tasks", value: total, color: "var(--ink)" },
      { label: "In progress", value: counts.in_progress, color: "var(--warn)" },
      { label: "Done", value: counts.done, color: "var(--good)" },
      { label: "Blocked", value: counts.blocked, color: "var(--crit)" },
    ];

    return { total, counts, completion, statusBars, workload, moduleStats, kpis };
  }, [tasks, members, modules]);

  if (!isSupabaseConfigured) {
    return (
      <div className="wrap">
        <p className="state-note">Connect Supabase first — open the board for setup instructions.</p>
      </div>
    );
  }
  if (loading) return <div className="wrap"><p className="state-note">Loading analytics…</p></div>;

  return (
    <div className="wrap">
      <p className="eyebrow">Overview</p>
      <h1>Project Analytics</h1>

      <div className="kpi-grid">
        {stats.kpis.map((k) => (
          <div className="kpi" key={k.label}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="panel-grid">
        <div className="panel">
          <div className="panel-title">Overall completion</div>
          <div className="progress">
            <div className="progress-fill" style={{ width: `${stats.completion * 100}%` }} />
          </div>
          <div className="panel-sub">
            {Math.round(stats.completion * 100)}% of tasks done ({stats.counts.done} / {stats.total})
          </div>
          <div className="status-bars">
            {stats.statusBars.map((s) => (
              <div className="bar-row status-bar-row" key={s.label}>
                <span className="bar-label">{s.label}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: s.width, background: s.color }} />
                </div>
                <span className="bar-value">{s.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">Workload by member</div>
          {stats.workload.length === 0 ? (
            <p className="muted">No assignments yet.</p>
          ) : (
            <div className="workload">
              {stats.workload.map((w) => (
                <div key={w.name}>
                  <div className="workload-head">
                    <span className="av">{w.initials}</span>
                    <span className="workload-name">{w.name}</span>
                    <span className="workload-summary">{w.summary}</span>
                  </div>
                  <div className="workload-track">
                    <div style={{ width: w.doneWidth, background: "var(--good)" }} />
                    <div style={{ width: w.progWidth, background: "var(--warn)" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="section-label">
        Module progress<span className="rule" />
      </div>
      <div className="module-grid">
        {stats.moduleStats.map((m) => (
          <div className="panel module-panel" key={m.id}>
            <div className="module-head">
              <span className="module-name">{m.name}</span>
              <span className="module-kind">{m.kindLabel}</span>
            </div>
            <div className="progress slim">
              <div
                className="progress-fill"
                style={{ width: `${m.pct * 100}%`, background: m.complete ? "var(--good)" : "var(--accent)" }}
              />
            </div>
            <div className="panel-sub">{m.summary}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
