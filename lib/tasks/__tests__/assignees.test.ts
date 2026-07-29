import { describe, expect, it } from "vitest";
import {
  normalizeTaskRow,
  TASK_WITH_ASSIGNEES_SELECT,
} from "@/lib/tasks/assignees";

describe("normalizeTaskRow", () => {
  it("derives display names from UUID relationships", () => {
    const task = normalizeTaskRow({
      id: "task-1",
      module_id: "module-1",
      title: "Kernel",
      status: "todo",
      assignees: ["stale name"],
      notes: "",
      position: 0,
      created_at: "2026-07-28T00:00:00Z",
      updated_at: "2026-07-28T00:00:00Z",
      task_assignees: [
        { member_id: "member-2", member: { name: "Alice" } },
        { member_id: "member-1", member: { name: "Bruce" } },
      ],
    });

    expect(task.assignees).toEqual(["Alice", "Bruce"]);
    expect("task_assignees" in task).toBe(false);
    expect(TASK_WITH_ASSIGNEES_SELECT).toContain("task_assignees");
  });
});
