"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import PageHeader from "@/components/ui/PageHeader";
import StatusDot from "@/components/ui/StatusDot";
import WorkspaceSkeleton from "@/components/ui/WorkspaceSkeleton";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import {
  deriveTaskAnalytics,
  taskAnalyticsCsv,
} from "@/lib/tasks/analytics";
import {
  taskFromStorage,
  taskTypeFromStorage,
} from "@/lib/tasks/model";
import { statusLabel } from "@/lib/status";
import { relTime } from "@/lib/time";
import type {
  Member,
  Module,
  Task,
  TaskModel,
  TaskType,
} from "@/lib/types";

function ownerSummary(owners: string[]): string {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const owner of owners) {
    const name = owner.trim();
    const key = name.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names.join(", ") || "No owner yet";
}

export default function Analytics() {
  const [types, setTypes] = useState<TaskType[]>([]);
  const [tasks, setTasks] = useState<TaskModel[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const reloadGenerationRef = useRef(0);

  const reload = useCallback(async () => {
    const generation = reloadGenerationRef.current + 1;
    reloadGenerationRef.current = generation;
    if (!supabase) {
      if (generation === reloadGenerationRef.current) {
        setLoading(false);
      }
      return;
    }

    try {
      const [typeResult, taskResult, memberResult] = await Promise.all([
        supabase.from("modules").select("*").order("position"),
        supabase.from("tasks").select("*").order("position"),
        supabase.from("members").select("*").order("position"),
      ]);
      if (generation !== reloadGenerationRef.current) return;

      const failedPart = typeResult.error
        ? "Type"
        : taskResult.error
          ? "Task"
          : memberResult.error
            ? "Owner"
            : null;
      if (failedPart) {
        setLoadError(
          `Could not load analytics. ${failedPart} data is unavailable.`,
        );
        return;
      }

      const nextTypes = (typeResult.data ?? []).map((row) => (
        taskTypeFromStorage(row as Module)
      ));
      const nextTasks = (taskResult.data ?? []).map((row) => (
        taskFromStorage(row as Task)
      ));
      const nextMembers = (memberResult.data ?? []) as Member[];
      setTypes(nextTypes);
      setTasks(nextTasks);
      setMembers(nextMembers);
      setHasSnapshot(true);
      setLoadError(null);
    } catch {
      if (generation !== reloadGenerationRef.current) return;
      setLoadError("Could not load analytics. Try again.");
    } finally {
      if (generation === reloadGenerationRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    const client = supabase;
    void reload();
    const refresh = () => {
      void reload();
    };
    const channel = client
      .channel("analytics-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "modules" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "members" },
        refresh,
      )
      .subscribe();

    return () => {
      reloadGenerationRef.current += 1;
      void client.removeChannel(channel);
    };
  }, [reload]);

  const analytics = useMemo(
    () => deriveTaskAnalytics(tasks, types, members),
    [members, tasks, types],
  );
  const typeNameById = useMemo(
    () => new Map(types.map((type) => [type.id, type.name])),
    [types],
  );

  function exportCsv() {
    if (!hasSnapshot) return;
    const blob = new Blob([taskAnalyticsCsv(analytics)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "triton-task-analytics.csv";
      anchor.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const errorBanner = loadError ? (
    <div className="error-banner analytics-error" role="alert">
      <span>{loadError}</span>
      <button
        type="button"
        className="btn"
        onClick={() => void reload()}
      >
        Retry
      </button>
    </div>
  ) : null;

  if (!isSupabaseConfigured) {
    return (
      <div className="workspace-page analytics-page analytics-state-page">
        <p className="state-note">
          Connect Supabase first — open the board for setup instructions.
        </p>
      </div>
    );
  }

  return (
    <div className="workspace-page analytics-page">
      <PageHeader
        eyebrow="Live snapshot"
        title="Analytics"
        description={
          "Current Task progress, attention, Type coverage, and Owner workload."
        }
        actions={(
          <button
            type="button"
            className="btn"
            onClick={exportCsv}
            disabled={loading || !hasSnapshot}
          >
            Export CSV
          </button>
        )}
      />

      {loading ? (
        <WorkspaceSkeleton variant="analytics" label="Loading Analytics" />
      ) : !hasSnapshot ? (
        errorBanner
      ) : (
        <>
          {errorBanner}
          <dl className="kpi-strip">
            {([
              ["Total tasks", analytics.kpis.total],
              ["In progress", analytics.kpis.inProgress],
              ["Done", analytics.kpis.done],
              ["Blocked", analytics.kpis.blocked],
              ["Completion", `${analytics.kpis.completion}%`],
            ] as Array<[string, string | number]>).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>

          <div className="analytics-split">
            <section aria-labelledby="progress-status-title">
              <h2 id="progress-status-title">Progress by status</h2>
              <div
                className="status-progress-track"
                role="img"
                aria-label={`${analytics.kpis.completion}% complete`}
              >
                {analytics.byStatus.map((item) => (
                  <span
                    key={item.status}
                    className={`status-segment status-${item.status}`}
                    style={{ width: `${item.percentage}%` }}
                    aria-hidden="true"
                  />
                ))}
              </div>
              <ul className="status-legend">
                {analytics.byStatus.map((item) => (
                  <li key={item.status}>
                    <StatusDot
                      status={item.status}
                      label={statusLabel(item.status)}
                    />
                    <strong>{item.count}</strong>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="needs-attention-title">
              <h2 id="needs-attention-title">Needs attention</h2>
              {analytics.needsAttention.length === 0 ? (
                <p className="muted">No blocked Tasks.</p>
              ) : (
                <ul className="attention-list">
                  {analytics.needsAttention.map((task) => (
                    <li key={task.id}>
                      <Link href={`/task/${task.id}`}>{task.title}</Link>
                      <span>
                        {task.typeId
                          ? typeNameById.get(task.typeId) ?? "No type"
                          : "No type"}
                        {" · "}
                        {ownerSummary(task.owners)}
                        {" · "}
                        {relTime(task.updated_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section
            className="analytics-table-section"
            aria-labelledby="progress-type-title"
          >
            <h2 id="progress-type-title">Progress by type</h2>
            <div
              className="analytics-table-scroll"
              role="region"
              tabIndex={0}
              aria-label="Progress by type table"
              aria-describedby="progress-type-scroll-help"
            >
              <table
                className="analytics-table"
                aria-labelledby="progress-type-title"
              >
                <thead>
                  <tr>
                    <th scope="col">Type</th>
                    <th scope="col">Tasks</th>
                    <th scope="col">Done</th>
                    <th scope="col">In progress</th>
                    <th scope="col">Blocked</th>
                    <th scope="col">Owner coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.byType.map((row) => (
                    <tr key={row.id}>
                      <th scope="row">{row.name}</th>
                      <td>{row.total}</td>
                      <td>{row.done}</td>
                      <td>{row.inProgress}</td>
                      <td>{row.blocked}</td>
                      <td>{row.ownerCoverage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p id="progress-type-scroll-help" className="sr-only">
              Scroll horizontally to inspect every Progress by type column.
            </p>
          </section>

          <section
            className="analytics-table-section"
            aria-labelledby="workload-owner-title"
          >
            <h2 id="workload-owner-title">Workload by owner</h2>
            <div
              className="analytics-table-scroll"
              role="region"
              tabIndex={0}
              aria-label="Workload by owner table"
              aria-describedby="workload-owner-scroll-help"
            >
              <table
                className="analytics-table"
                aria-labelledby="workload-owner-title"
              >
                <thead>
                  <tr>
                    <th scope="col">Owner</th>
                    <th scope="col">Tasks</th>
                    <th scope="col">Workload</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.byOwner.map((row) => (
                    <tr key={row.name}>
                      <th scope="row">{row.name}</th>
                      <td>{row.total}</td>
                      <td>
                        <span
                          className="workload-segments"
                          aria-label={
                            `${row.done} done, `
                            + `${row.inProgress} in progress, `
                            + `${row.todo} to do, ${row.blocked} blocked`
                          }
                        >
                          {([
                            "done",
                            "inProgress",
                            "todo",
                            "blocked",
                          ] as const).map((key) => (
                            <i
                              key={key}
                              className={
                                `status-${
                                  key === "inProgress"
                                    ? "in_progress"
                                    : key
                                }`
                              }
                              style={{
                                width: `${
                                  row.total
                                    ? (row[key] / row.total) * 100
                                    : 0
                                }%`,
                              }}
                              aria-hidden="true"
                            />
                          ))}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p id="workload-owner-scroll-help" className="sr-only">
              Scroll horizontally to inspect every Workload by owner column.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
