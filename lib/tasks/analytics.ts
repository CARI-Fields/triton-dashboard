import { STATUS_OPTIONS } from "@/lib/status";
import type {
  Member,
  Status,
  TaskModel,
  TaskType,
} from "@/lib/types";

export interface TaskAnalytics {
  kpis: {
    total: number;
    inProgress: number;
    done: number;
    blocked: number;
    completion: number;
  };
  byStatus: Array<{
    status: Status;
    count: number;
    percentage: number;
  }>;
  needsAttention: TaskModel[];
  byType: Array<{
    id: string;
    name: string;
    total: number;
    todo: number;
    inProgress: number;
    done: number;
    blocked: number;
    ownerCoverage: number;
  }>;
  byOwner: Array<{
    name: string;
    total: number;
    todo: number;
    inProgress: number;
    done: number;
    blocked: number;
  }>;
}

type StatusCounts = Pick<
  TaskAnalytics["byType"][number],
  "todo" | "inProgress" | "done" | "blocked"
>;

const NO_TYPE_ID = "no-type";

function emptyCounts(): StatusCounts {
  return {
    todo: 0,
    inProgress: 0,
    done: 0,
    blocked: 0,
  };
}

function incrementStatus(counts: StatusCounts, status: Status) {
  if (status === "in_progress") {
    counts.inProgress += 1;
  } else {
    counts[status] += 1;
  }
}

function normalizedName(name: string): string {
  return name.trim().toLowerCase();
}

function validOwnerNames(owners: string[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const owner of owners) {
    const name = owner.trim();
    const key = normalizedName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function compareNames(first: string, second: string): number {
  return first.localeCompare(second, "en", {
    sensitivity: "base",
    numeric: true,
  }) || first.localeCompare(second, "en", {
    sensitivity: "variant",
    numeric: true,
  });
}

function percentage(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

export function deriveTaskAnalytics(
  tasks: TaskModel[],
  types: TaskType[],
  members: Member[],
): TaskAnalytics {
  const statusCounts: Record<Status, number> = {
    todo: 0,
    in_progress: 0,
    done: 0,
    blocked: 0,
  };

  const sortedTypes = [...types].sort((first, second) => (
    first.position - second.position
    || compareNames(first.name, second.name)
    || first.id.localeCompare(second.id)
  ));
  const typeRows: TaskAnalytics["byType"] = [];
  const typeRowsById = new Map<string, TaskAnalytics["byType"][number]>();
  for (const taskType of sortedTypes) {
    if (typeRowsById.has(taskType.id)) continue;
    const row = {
      id: taskType.id,
      name: taskType.name,
      total: 0,
      ...emptyCounts(),
      ownerCoverage: 0,
    };
    typeRows.push(row);
    typeRowsById.set(taskType.id, row);
  }

  const sortedMembers = [...members].sort((first, second) => (
    first.position - second.position
    || compareNames(first.name, second.name)
    || first.id.localeCompare(second.id)
  ));
  const canonicalOwnerByKey = new Map<string, string>();
  const memberOwnerNames: string[] = [];
  for (const item of sortedMembers) {
    const name = item.name.trim();
    const key = normalizedName(name);
    if (!key || canonicalOwnerByKey.has(key)) continue;
    canonicalOwnerByKey.set(key, name);
    memberOwnerNames.push(name);
  }

  const staleOwnerByKey = new Map<string, string>();
  for (const task of tasks) {
    for (const owner of validOwnerNames(task.owners)) {
      const key = normalizedName(owner);
      if (canonicalOwnerByKey.has(key)) continue;
      const current = staleOwnerByKey.get(key);
      if (!current || compareNames(owner, current) < 0) {
        staleOwnerByKey.set(key, owner);
      }
    }
  }
  const staleOwnerNames = [...staleOwnerByKey.values()].sort(compareNames);
  const ownerRows: TaskAnalytics["byOwner"] = [
    ...memberOwnerNames,
    ...staleOwnerNames,
  ].map((name) => ({
    name,
    total: 0,
    ...emptyCounts(),
  }));
  const ownerRowsByKey = new Map(
    ownerRows.map((row) => [normalizedName(row.name), row]),
  );

  let noTypeRow: TaskAnalytics["byType"][number] | null = null;
  const ownerCoveredByType = new Map<string, number>();

  for (const task of tasks) {
    statusCounts[task.status] += 1;

    let typeRow = task.typeId
      ? typeRowsById.get(task.typeId) ?? null
      : null;
    if (!typeRow) {
      noTypeRow ??= {
        id: NO_TYPE_ID,
        name: "No type",
        total: 0,
        ...emptyCounts(),
        ownerCoverage: 0,
      };
      typeRow = noTypeRow;
    }
    typeRow.total += 1;
    incrementStatus(typeRow, task.status);

    const taskOwnerNames = validOwnerNames(task.owners);
    if (taskOwnerNames.length > 0) {
      ownerCoveredByType.set(
        typeRow.id,
        (ownerCoveredByType.get(typeRow.id) ?? 0) + 1,
      );
    }
    for (const owner of taskOwnerNames) {
      const ownerRow = ownerRowsByKey.get(normalizedName(owner));
      if (!ownerRow) continue;
      ownerRow.total += 1;
      incrementStatus(ownerRow, task.status);
    }
  }

  if (noTypeRow) typeRows.push(noTypeRow);
  for (const row of typeRows) {
    row.ownerCoverage = percentage(
      ownerCoveredByType.get(row.id) ?? 0,
      row.total,
    );
  }

  const total = tasks.length;
  return {
    kpis: {
      total,
      inProgress: statusCounts.in_progress,
      done: statusCounts.done,
      blocked: statusCounts.blocked,
      completion: percentage(statusCounts.done, total),
    },
    byStatus: STATUS_OPTIONS.map(({ value }) => ({
      status: value,
      count: statusCounts[value],
      percentage: percentage(statusCounts[value], total),
    })),
    needsAttention: tasks
      .filter((task) => task.status === "blocked")
      .toSorted((first, second) => {
        const firstTime = Date.parse(first.updated_at);
        const secondTime = Date.parse(second.updated_at);
        const validFirstTime = Number.isNaN(firstTime) ? -Infinity : firstTime;
        const validSecondTime = Number.isNaN(secondTime)
          ? -Infinity
          : secondTime;
        return validSecondTime - validFirstTime
          || first.position - second.position
          || first.id.localeCompare(second.id);
      }),
    byType: typeRows,
    byOwner: ownerRows,
  };
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

function csvRow(values: Array<string | number>): string {
  return values.map(csvCell).join(",");
}

export function taskAnalyticsCsv(analytics: TaskAnalytics): string {
  const typeNameById = new Map(
    analytics.byType.map((row) => [row.id, row.name]),
  );
  const output: Array<Array<string | number>> = [
    ["Metric", "Value"],
    ["Total tasks", analytics.kpis.total],
    ["In progress", analytics.kpis.inProgress],
    ["Done", analytics.kpis.done],
    ["Blocked", analytics.kpis.blocked],
    ["Completion", `${analytics.kpis.completion}%`],
    [],
    ["Status", "Tasks", "Percentage"],
    ...analytics.byStatus.map((row) => [
      STATUS_OPTIONS.find(({ value }) => value === row.status)?.label
        ?? row.status,
      row.count,
      `${row.percentage}%`,
    ]),
    [],
    ["Title", "Type", "Owner", "Updated"],
    ...analytics.needsAttention.map((task) => [
      task.title,
      task.typeId
        ? typeNameById.get(task.typeId) ?? "No type"
        : "No type",
      validOwnerNames(task.owners).join(", ") || "No owner yet",
      task.updated_at,
    ]),
    [],
    [
      "Type",
      "Tasks",
      "Done",
      "In progress",
      "Blocked",
      "Owner coverage",
    ],
    ...analytics.byType.map((row) => [
      row.name,
      row.total,
      row.done,
      row.inProgress,
      row.blocked,
      `${row.ownerCoverage}%`,
    ]),
    [],
    ["Owner", "Tasks", "Done", "In progress", "To do", "Blocked"],
    ...analytics.byOwner.map((row) => [
      row.name,
      row.total,
      row.done,
      row.inProgress,
      row.todo,
      row.blocked,
    ]),
  ];

  return output.map(csvRow).join("\r\n");
}
