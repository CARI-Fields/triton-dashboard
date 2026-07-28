import { describe, expect, it } from "vitest";
import {
  deriveTaskAnalytics,
  taskAnalyticsCsv,
} from "@/lib/tasks/analytics";
import type {
  Member,
  Status,
  TaskModel,
  TaskType,
} from "@/lib/types";

function task(
  id: string,
  status: Status,
  overrides: Partial<TaskModel> = {},
): TaskModel {
  return {
    id,
    typeId: null,
    title: id,
    status,
    owners: [],
    notes: "",
    tags: [],
    priority: "medium",
    dueDate: null,
    position: 0,
    created_at: "2026-07-27T12:00:00.000Z",
    updated_at: "2026-07-27T12:00:00.000Z",
    ...overrides,
  };
}

function type(
  id: string,
  name: string,
  position: number,
): TaskType {
  return {
    id,
    name,
    description: "",
    position,
    created_at: "2026-07-27T00:00:00.000Z",
  };
}

function member(
  id: string,
  name: string,
  position: number,
): Member {
  return {
    id,
    name,
    initials: "",
    position,
    created_at: "2026-07-27T00:00:00.000Z",
  };
}

describe("deriveTaskAnalytics", () => {
  it("derives only the current Status, Type, and Owner snapshot", () => {
    const analytics = deriveTaskAnalytics(
      [
        task("Draft verifier plan", "todo", {
          typeId: "infrastructure",
          owners: ["Sam"],
        }),
        task("Run evaluation", "in_progress", {
          typeId: "evaluation",
          owners: ["Theo"],
        }),
        task("Publish results", "done", {
          typeId: "evaluation",
          owners: ["Sam"],
        }),
        task("Recover failed NPU runner", "blocked", {
          typeId: "infrastructure",
          owners: ["Legacy Owner"],
          updated_at: "2026-07-27T18:00:00.000Z",
        }),
      ],
      [
        type("evaluation", "Evaluation", 1),
        type("infrastructure", "Infrastructure", 0),
      ],
      [
        member("sam", "Sam", 0),
        member("theo", "Theo", 1),
      ],
    );

    expect(analytics.kpis).toEqual({
      total: 4,
      inProgress: 1,
      done: 1,
      blocked: 1,
      completion: 25,
    });
    expect(analytics.byStatus).toEqual([
      { status: "todo", count: 1, percentage: 25 },
      { status: "in_progress", count: 1, percentage: 25 },
      { status: "done", count: 1, percentage: 25 },
      { status: "blocked", count: 1, percentage: 25 },
    ]);
    expect(analytics.needsAttention.map((item) => item.title)).toEqual([
      "Recover failed NPU runner",
    ]);
    expect(analytics.byType).toEqual([
      {
        id: "infrastructure",
        name: "Infrastructure",
        total: 2,
        todo: 1,
        inProgress: 0,
        done: 0,
        blocked: 1,
        ownerCoverage: 100,
      },
      {
        id: "evaluation",
        name: "Evaluation",
        total: 2,
        todo: 0,
        inProgress: 1,
        done: 1,
        blocked: 0,
        ownerCoverage: 100,
      },
    ]);
    expect(analytics).not.toHaveProperty("trend");
    expect(analytics).not.toHaveProperty("forecast");
    expect(analytics).not.toHaveProperty("significance");
  });

  it("rounds completion, is zero-safe, and adds No type only when needed", () => {
    const infrastructure = type("infrastructure", "Infrastructure", 0);
    const empty = deriveTaskAnalytics([], [infrastructure], []);

    expect(empty.kpis).toEqual({
      total: 0,
      inProgress: 0,
      done: 0,
      blocked: 0,
      completion: 0,
    });
    expect(empty.byStatus.every((item) => item.percentage === 0)).toBe(true);
    expect(empty.byType.map((row) => row.name)).toEqual(["Infrastructure"]);

    const analytics = deriveTaskAnalytics(
      [
        task("one", "done", { typeId: "infrastructure" }),
        task("two", "done", { typeId: null }),
        task("three", "todo", { typeId: "removed-type" }),
      ],
      [infrastructure],
      [],
    );

    expect(analytics.kpis.completion).toBe(67);
    expect(analytics.byType.map((row) => row.name)).toEqual([
      "Infrastructure",
      "No type",
    ]);
    expect(analytics.byType[1]).toMatchObject({
      id: "no-type",
      total: 2,
      todo: 1,
      done: 1,
      ownerCoverage: 0,
    });
  });

  it("deduplicates invalid Owner inputs while retaining stale legacy names", () => {
    const analytics = deriveTaskAnalytics(
      [
        task("owned", "in_progress", {
          owners: [
            " Sam ",
            "sam",
            "",
            "  ",
            "Zed Legacy",
            "Zed Legacy",
            "Amy Legacy",
          ],
        }),
      ],
      [],
      [
        member("sam", "Sam", 0),
        member("duplicate-sam", " sam ", 1),
        member("blank", "", 2),
        member("theo", "Theo", 3),
      ],
    );

    expect(analytics.byOwner.map((row) => row.name)).toEqual([
      "Sam",
      "Theo",
      "Amy Legacy",
      "Zed Legacy",
    ]);
    expect(analytics.byOwner).toEqual([
      {
        name: "Sam",
        total: 1,
        todo: 0,
        inProgress: 1,
        done: 0,
        blocked: 0,
      },
      {
        name: "Theo",
        total: 0,
        todo: 0,
        inProgress: 0,
        done: 0,
        blocked: 0,
      },
      {
        name: "Amy Legacy",
        total: 1,
        todo: 0,
        inProgress: 1,
        done: 0,
        blocked: 0,
      },
      {
        name: "Zed Legacy",
        total: 1,
        todo: 0,
        inProgress: 1,
        done: 0,
        blocked: 0,
      },
    ]);
  });

  it("sorts only blocked attention Tasks by updated time without mutating input", () => {
    const tasks = [
      task("older", "blocked", {
        updated_at: "2026-07-27T12:00:00.000Z",
      }),
      task("not-blocked", "in_progress", {
        updated_at: "2026-07-27T20:00:00.000Z",
      }),
      task("newer", "blocked", {
        updated_at: "2026-07-27T19:00:00.000Z",
      }),
    ];

    const analytics = deriveTaskAnalytics(tasks, [], []);

    expect(analytics.needsAttention.map((item) => item.id)).toEqual([
      "newer",
      "older",
    ]);
    expect(tasks.map((item) => item.id)).toEqual([
      "older",
      "not-blocked",
      "newer",
    ]);
  });
});

describe("taskAnalyticsCsv", () => {
  it("exports every visible snapshot section with escaped values and no legacy terminology", () => {
    const analytics = deriveTaskAnalytics(
      [
        task('Recover "quoted", runner\nnow', "blocked", {
          typeId: "evaluation",
          owners: ["Sam, Sr."],
          updated_at: "2026-07-27T19:00:00.000Z",
        }),
      ],
      [type("evaluation", 'Evaluation, "NPU"', 0)],
      [member("sam", "Sam, Sr.", 0)],
    );

    const csv = taskAnalyticsCsv(analytics);

    expect(csv).toContain("Metric,Value");
    expect(csv).toContain("Status,Tasks,Percentage");
    expect(csv).toContain("Title,Type,Owner,Updated");
    expect(csv).toContain(
      "Type,Tasks,Done,In progress,Blocked,Owner coverage",
    );
    expect(csv).toContain(
      "Owner,Tasks,Done,In progress,To do,Blocked",
    );
    expect(csv).toContain('"Evaluation, ""NPU"""');
    expect(csv).toContain('"Recover ""quoted"", runner\nnow"');
    expect(csv).toContain('"Sam, Sr."');
    expect(csv).not.toMatch(/\b(Module|Trend|Forecast|Significance)\b/i);
  });
});
