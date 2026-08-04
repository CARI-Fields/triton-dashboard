import { describe, expect, it } from "vitest";
import type { ExperimentListRow } from "@/lib/types";
import {
  applyExperimentFilters,
  EMPTY_EXPERIMENT_FILTERS,
} from "@/lib/experiments/filters";

function row(
  id: string,
  status: ExperimentListRow["status"],
  overrides: Partial<ExperimentListRow> = {},
): ExperimentListRow {
  return {
    id,
    experiment_no: Number(id.slice(-1)),
    task_id: "00000000-0000-4000-8000-000000000010",
    owner_id: "00000000-0000-4000-8000-000000000020",
    name: `run-${id.slice(-1)}`,
    status,
    template_id: null,
    archived_at: null,
    core_revision: 1,
    position: 0,
    started_at: null,
    completed_at: null,
    created_at: "2026-07-20T00:00:00.000Z",
    updated_at: "2026-07-24T00:00:00.000Z",
    task: { id: "00000000-0000-4000-8000-000000000010", title: "Optimize conv2d" },
    owner: {
      id: "00000000-0000-4000-8000-000000000020",
      name: "Bruce",
      initials: "BX",
      position: 0,
      created_at: "2026-07-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

const rows = [
  row("00000000-0000-4000-8000-000000000001", "running", {
    name: "Warmup convolution",
    updated_at: "2026-07-24T04:00:00.000Z",
  }),
  row("00000000-0000-4000-8000-000000000002", "blocked", {
    name: "Matmul recovery",
    task_id: "00000000-0000-4000-8000-000000000011",
    task: { id: "00000000-0000-4000-8000-000000000011", title: "Tune matmul" },
    owner_id: "00000000-0000-4000-8000-000000000021",
    owner: {
      id: "00000000-0000-4000-8000-000000000021",
      name: "Ada",
      initials: "AD",
      position: 1,
      created_at: "2026-07-01T00:00:00.000Z",
    },
    updated_at: "2026-07-24T03:00:00.000Z",
  }),
  row("00000000-0000-4000-8000-000000000003", "analyzing", {
    name: "Unassigned analysis",
    owner_id: null,
    owner: null,
    updated_at: "2026-07-24T02:00:00.000Z",
  }),
];

const now = new Date("2026-07-24T00:00:00.000Z").getTime();

function ids(filters: typeof EMPTY_EXPERIMENT_FILTERS): string[] {
  return applyExperimentFilters(rows, filters, now).map((item) => item.id);
}

describe("experiment filters", () => {
  it("implements the saved views", () => {
    expect(ids({ ...EMPTY_EXPERIMENT_FILTERS, savedView: "running" }))
      .toEqual(["00000000-0000-4000-8000-000000000001"]);
    expect(ids({ ...EMPTY_EXPERIMENT_FILTERS, savedView: "blocked" }))
      .toEqual(["00000000-0000-4000-8000-000000000002"]);
    expect(ids(EMPTY_EXPERIMENT_FILTERS)).toHaveLength(3);
  });

  it("applies each row field filter independently", () => {
    expect(ids({ ...EMPTY_EXPERIMENT_FILTERS, ownerId: "00000000-0000-4000-8000-000000000021" }))
      .toEqual(["00000000-0000-4000-8000-000000000002"]);
    expect(ids({ ...EMPTY_EXPERIMENT_FILTERS, ownerId: "unassigned" }))
      .toEqual(["00000000-0000-4000-8000-000000000003"]);
    expect(ids({ ...EMPTY_EXPERIMENT_FILTERS, taskId: "00000000-0000-4000-8000-000000000011" }))
      .toEqual(["00000000-0000-4000-8000-000000000002"]);
    expect(ids({ ...EMPTY_EXPERIMENT_FILTERS, status: "blocked" }))
      .toEqual(["00000000-0000-4000-8000-000000000002"]);
  });

  it("searches names, display IDs, task titles, and owner names", () => {
    expect(ids({ ...EMPTY_EXPERIMENT_FILTERS, search: "warmup" }))
      .toEqual(["00000000-0000-4000-8000-000000000001"]);
    expect(ids({ ...EMPTY_EXPERIMENT_FILTERS, search: "exp-0002" }))
      .toEqual(["00000000-0000-4000-8000-000000000002"]);
    expect(ids({ ...EMPTY_EXPERIMENT_FILTERS, search: "ada" }))
      .toEqual(["00000000-0000-4000-8000-000000000002"]);
  });

  it("orders filtered rows by updated time descending", () => {
    expect(ids(EMPTY_EXPERIMENT_FILTERS)).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
    ]);
  });
});
