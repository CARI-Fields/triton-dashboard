import type { SupabaseClient } from "@supabase/supabase-js";
import type { Task } from "@/lib/types";

export const TASK_WITH_ASSIGNEES_SELECT = [
  "id",
  "module_id",
  "title",
  "status",
  "notes",
  "tags",
  "priority",
  "due_date",
  "position",
  "created_at",
  "updated_at",
  "task_assignees(member_id,member:members(name))",
].join(",");

export type TaskRelationRow = Omit<Task, "assignees"> & {
  task_assignees: Array<{
    member_id: string;
    member: { name: string } | null;
  }>;
};

export function normalizeTaskRow(row: TaskRelationRow): Task {
  const { task_assignees, ...task } = row;
  return {
    ...task,
    assignees: task_assignees
      .flatMap((relation) => relation.member?.name ?? [])
      .sort((left, right) => {
        const leftKey = left.toLowerCase();
        const rightKey = right.toLowerCase();
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      }),
  };
}

export async function assignTaskMember(
  client: SupabaseClient,
  taskId: string,
  memberId: string,
): Promise<void> {
  const { error } = await client
    .from("task_assignees")
    .insert({ task_id: taskId, member_id: memberId });
  if (error && error.code !== "23505") throw new Error(error.message);
}

export async function unassignTaskMember(
  client: SupabaseClient,
  taskId: string,
  memberId: string,
): Promise<void> {
  const { error } = await client
    .from("task_assignees")
    .delete()
    .eq("task_id", taskId)
    .eq("member_id", memberId);
  if (error) throw new Error(error.message);
}
