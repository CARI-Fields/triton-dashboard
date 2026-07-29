import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  assignTaskMember,
  normalizeTaskRow,
  TASK_WITH_ASSIGNEES_SELECT,
  unassignTaskMember,
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

  it("skips relationships whose Member was deleted", () => {
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
        { member_id: "member-deleted", member: null },
        { member_id: "member-1", member: { name: "Alice" } },
      ],
    });

    expect(task.assignees).toEqual(["Alice"]);
  });
});

function insertClient(error: { code: string; message: string } | null) {
  const insert = vi.fn().mockResolvedValue({ error });
  return {
    client: {
      from: vi.fn(() => ({ insert })),
    } as unknown as SupabaseClient,
    insert,
  };
}

function deleteClient(error: { code: string; message: string } | null) {
  const response = Promise.resolve({ error });
  const query = {
    eq: vi.fn(),
    then: response.then.bind(response),
  };
  query.eq.mockReturnValue(query);
  const remove = vi.fn(() => query);
  return {
    client: {
      from: vi.fn(() => ({ delete: remove })),
    } as unknown as SupabaseClient,
    query,
  };
}

describe("Task assignee mutations", () => {
  it("treats a duplicate assignment as already assigned", async () => {
    const { client } = insertClient({
      code: "23505",
      message: "duplicate key",
    });

    await expect(assignTaskMember(client, "task-1", "member-1"))
      .resolves.toBeUndefined();
  });

  it("throws other assignment errors", async () => {
    const { client } = insertClient({
      code: "42501",
      message: "insert denied",
    });

    await expect(assignTaskMember(client, "task-1", "member-1"))
      .rejects.toThrow("insert denied");
  });

  it("throws unassignment errors after targeting both UUIDs", async () => {
    const { client, query } = deleteClient({
      code: "42501",
      message: "delete denied",
    });

    await expect(unassignTaskMember(client, "task-1", "member-1"))
      .rejects.toThrow("delete denied");
    expect(query.eq).toHaveBeenNthCalledWith(1, "task_id", "task-1");
    expect(query.eq).toHaveBeenNthCalledWith(2, "member_id", "member-1");
  });
});
