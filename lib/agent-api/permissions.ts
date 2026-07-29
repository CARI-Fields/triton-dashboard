import { AgentApiError } from "@/lib/agent-api/errors";
import { getServerSupabase } from "@/lib/agent-api/server";
import type {
  AgentContext,
  ApiScope,
} from "@/lib/agent-api/types";

export function requireScope(
  context: AgentContext,
  scope: ApiScope,
): void {
  if (!context.scopes.has(scope)) {
    throw new AgentApiError(
      403,
      "SCOPE_FORBIDDEN",
      `Missing scope: ${scope}`,
    );
  }
}

export async function requireTaskCollaboration(
  context: AgentContext,
  taskId: string,
): Promise<void> {
  const { data, error } = await getServerSupabase()
    .from("task_assignees")
    .select("task_id")
    .eq("task_id", taskId)
    .eq("member_id", context.memberId)
    .maybeSingle();
  if (error) throw new Error("Task collaboration lookup failed.");
  if (!data) {
    throw new AgentApiError(
      403,
      "TASK_SCOPE_FORBIDDEN",
      "The Agent is not assigned to this Task.",
    );
  }
}

export async function requireExperimentCollaboration(
  context: AgentContext,
  experimentId: string,
): Promise<string> {
  const { data, error } = await getServerSupabase()
    .from("experiments")
    .select("task_id")
    .eq("id", experimentId)
    .maybeSingle();
  if (error) throw new Error("Experiment parent lookup failed.");
  if (!data || typeof data.task_id !== "string") {
    throw new AgentApiError(
      404,
      "EXPERIMENT_NOT_FOUND",
      "Experiment not found.",
    );
  }

  await requireTaskCollaboration(context, data.task_id);
  return data.task_id;
}

export async function requireAttachmentCollaboration(
  context: AgentContext,
  attachmentId: string,
): Promise<string> {
  const { data, error } = await getServerSupabase()
    .from("attachments")
    .select("task_id,experiment_id,experiment:experiments(task_id)")
    .eq("id", attachmentId)
    .maybeSingle();
  if (error) throw new Error("Attachment parent lookup failed.");
  if (data === null) {
    throw new AgentApiError(
      404,
      "ATTACHMENT_NOT_FOUND",
      "Attachment not found.",
    );
  }

  const row: unknown = data;
  if (
    typeof row !== "object"
    || row === null
    || !("task_id" in row)
    || typeof row.task_id !== "string"
    || !("experiment_id" in row)
    || (
      row.experiment_id !== null
      && typeof row.experiment_id !== "string"
    )
  ) {
    throw new Error("Attachment parent relationship is invalid.");
  }

  let taskId = row.task_id;
  if (row.experiment_id !== null) {
    const experiment = "experiment" in row ? row.experiment : null;
    if (
      Array.isArray(experiment)
      || typeof experiment !== "object"
      || experiment === null
      || !("task_id" in experiment)
      || typeof experiment.task_id !== "string"
    ) {
      throw new Error("Attachment parent relationship is invalid.");
    }
    taskId = experiment.task_id;
  }

  await requireTaskCollaboration(context, taskId);
  return taskId;
}
