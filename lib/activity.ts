import { supabase } from "@/lib/supabase";
import type { ActivityKind } from "@/lib/types";

/** Fire-and-forget timeline event. Realtime pushes it to open task pages. */
export async function logActivity(
  taskId: string,
  text: string,
  kind: ActivityKind,
  experimentId: string | null = null,
): Promise<string | null> {
  if (!supabase) return "Supabase is not configured.";
  const { error } = await supabase.from("activity").insert({
    task_id: taskId,
    experiment_id: experimentId,
    text,
    kind,
  });
  return error?.message ?? null;
}

export const KIND_COLOR: Record<ActivityKind, string> = {
  create: "var(--good)",
  status: "var(--warn)",
  assign: "var(--accent)",
  experiment: "var(--accent)",
  note: "var(--todo)",
  edit: "var(--todo)",
  comment: "var(--good)",
};
