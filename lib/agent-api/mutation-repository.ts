import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AgentApiError } from "@/lib/agent-api/errors";
import { getServerSupabase } from "@/lib/agent-api/server";
import type {
  ExperimentPatch,
  TaskPatch,
} from "@/lib/agent-api/schemas";
import { isDateOnly } from "@/lib/agent-api/timestamps";
import type { AgentContext } from "@/lib/agent-api/types";
import {
  isConfig,
  isDataSpec,
  isEnvironmentSpec,
  isMetrics,
  isObjectSpec,
} from "@/lib/experiments/schema";
import type {
  Activity,
  Attachment,
  DecisionOutcome,
  Experiment,
  ExperimentStatus,
  Status,
  Task,
  TaskPriority,
} from "@/lib/types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TASK_STATUSES = new Set<Status>([
  "todo",
  "in_progress",
  "done",
  "blocked",
]);
const TASK_PRIORITIES = new Set<TaskPriority>([
  "low",
  "medium",
  "high",
  "urgent",
]);
const EXPERIMENT_STATUSES = new Set<ExperimentStatus>([
  "planned",
  "running",
  "analyzing",
  "completed",
  "blocked",
  "cancelled",
]);
const DECISION_OUTCOMES = new Set<DecisionOutcome>([
  "reference",
  "accepted",
  "rejected",
  "inconclusive",
]);

export type TaskMutationDto = Pick<
  Task,
  | "id"
  | "module_id"
  | "title"
  | "status"
  | "notes"
  | "tags"
  | "priority"
  | "due_date"
  | "position"
  | "created_at"
  | "updated_at"
>;
export type ExperimentMutationDto = Experiment;
export type ActivityMutationDto = Activity;
export type AttachmentMutationDto = Attachment;

export interface MutationResult<T> {
  data: T;
  idempotencyReplayed: boolean;
}

export class MutationRpcRejectedError extends Error {
  constructor() {
    super("Agent API mutation RPC failed.");
  }
}

interface PatchTaskInput {
  context: AgentContext;
  taskId: string;
  expectedUpdatedAt: string;
  changes: TaskPatch;
  requestId: string;
}

interface CreateExperimentInput {
  context: AgentContext;
  taskId: string;
  name: string;
  idempotencyKey: string;
  requestHash: string;
  requestId: string;
}

interface PatchExperimentInput {
  context: AgentContext;
  experimentId: string;
  expectedUpdatedAt: string;
  changes: ExperimentPatch;
  requestId: string;
}

interface CreateActivityInput {
  context: AgentContext;
  taskId: string;
  text: string;
  idempotencyKey: string;
  requestHash: string;
  requestId: string;
}

interface CreateAttachmentInput {
  context: AgentContext;
  experimentId: string;
  path: string;
  url: string;
  caption: string;
  idempotencyKey: string;
  requestHash: string;
  requestId: string;
}

interface PatchAttachmentInput {
  context: AgentContext;
  attachmentId: string;
  expectedUpdatedAt: string;
  caption: string;
  requestId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function requestHash(
  method: string,
  path: string,
  body: unknown,
): string {
  return createHash("sha256")
    .update(JSON.stringify([method, path, canonicalize(body)]))
    .digest("hex");
}

export function attachmentRequestHash(
  method: string,
  path: string,
  input: {
    caption: string;
    mime: string;
    fileDigest: string;
    [key: string]: unknown;
  },
): string {
  return requestHash(method, path, {
    caption: input.caption,
    file_digest: input.fileDigest,
    mime: input.mime,
  });
}

function invalidRpcData(): never {
  throw new Error("Agent API mutation RPC returned invalid data.");
}

function requiredString(
  row: Record<string, unknown>,
  field: string,
): string {
  const value = row[field];
  return typeof value === "string" ? value : invalidRpcData();
}

function requiredUuid(
  row: Record<string, unknown>,
  field: string,
): string {
  const value = requiredString(row, field);
  return UUID_PATTERN.test(value) ? value : invalidRpcData();
}

function nullableUuid(
  row: Record<string, unknown>,
  field: string,
): string | null {
  const value = row[field];
  if (value === null) return null;
  return typeof value === "string" && UUID_PATTERN.test(value)
    ? value
    : invalidRpcData();
}

function requiredNumber(
  row: Record<string, unknown>,
  field: string,
): number {
  const value = row[field];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : invalidRpcData();
}

function taskDto(value: unknown): TaskMutationDto {
  if (!isRecord(value)) return invalidRpcData();
  const status = value.status;
  if (typeof status !== "string" || !TASK_STATUSES.has(status as Status)) {
    return invalidRpcData();
  }
  const tags = value.tags;
  if (
    !Array.isArray(tags)
    || !tags.every((item) => typeof item === "string")
  ) {
    return invalidRpcData();
  }
  const priority = value.priority;
  if (
    typeof priority !== "string"
    || !TASK_PRIORITIES.has(priority as TaskPriority)
  ) {
    return invalidRpcData();
  }
  const dueDate = value.due_date;
  if (dueDate !== null && !isDateOnly(dueDate)) return invalidRpcData();
  return {
    id: requiredUuid(value, "id"),
    module_id: nullableUuid(value, "module_id"),
    title: requiredString(value, "title"),
    status: status as Status,
    notes: requiredString(value, "notes"),
    tags: [...tags],
    priority: priority as TaskPriority,
    due_date: dueDate,
    position: requiredNumber(value, "position"),
    created_at: requiredString(value, "created_at"),
    updated_at: requiredString(value, "updated_at"),
  };
}

function experimentDto(value: unknown): ExperimentMutationDto {
  if (!isRecord(value)) return invalidRpcData();
  const status = value.status;
  if (
    typeof status !== "string"
    || !EXPERIMENT_STATUSES.has(status as ExperimentStatus)
  ) {
    return invalidRpcData();
  }
  const decisionOutcome = value.decision_outcome;
  if (
    decisionOutcome !== null
    && (
      typeof decisionOutcome !== "string"
      || !DECISION_OUTCOMES.has(decisionOutcome as DecisionOutcome)
    )
  ) {
    return invalidRpcData();
  }
  const ownerId = nullableUuid(value, "owner_id");
  const startedAt = value.started_at;
  const completedAt = value.completed_at;
  if (
    (startedAt !== null && typeof startedAt !== "string")
    || (completedAt !== null && typeof completedAt !== "string")
  ) {
    return invalidRpcData();
  }
  const dataSpec: Experiment["data_spec"] = isDataSpec(value.data_spec)
    ? {
      datasets: value.data_spec.datasets.map((dataset) => ({
        role: dataset.role,
        name: dataset.name,
        split: dataset.split,
        revision: dataset.revision,
        task_count: dataset.task_count,
        samples_per_task: dataset.samples_per_task,
      })),
    }
    : { datasets: [] };
  const objectSpec: Experiment["object_spec"] = isObjectSpec(value.object_spec)
    ? {
      model: value.object_spec.model,
      harness: value.object_spec.harness,
      parent_harness: value.object_spec.parent_harness,
      prompt: value.object_spec.prompt,
      prompt_change: value.object_spec.prompt_change,
      skills: [...value.object_spec.skills],
      tools: [...value.object_spec.tools],
    }
    : {
      model: "",
      harness: "",
      parent_harness: "",
      prompt: "",
      prompt_change: "",
      skills: [],
      tools: [],
    };
  const environmentSpec: Experiment["environment_spec"] =
    isEnvironmentSpec(value.environment_spec)
      ? {
        platform: value.environment_spec.platform,
        server: value.environment_spec.server,
        devices: [...value.environment_spec.devices],
        hardware: value.environment_spec.hardware,
        evaluator: value.environment_spec.evaluator,
        revision: value.environment_spec.revision,
        precision_policy: value.environment_spec.precision_policy,
      }
      : {
        platform: "",
        server: "",
        devices: [],
        hardware: "",
        evaluator: "",
        revision: "",
        precision_policy: "",
      };
  const featuredMetricKeys = value.featured_metric_keys;

  return {
    id: requiredUuid(value, "id"),
    experiment_no: requiredNumber(value, "experiment_no"),
    task_id: requiredUuid(value, "task_id"),
    owner_id: ownerId,
    name: requiredString(value, "name"),
    status: status as ExperimentStatus,
    baseline_experiment_id: nullableUuid(value, "baseline_experiment_id"),
    data_spec: dataSpec,
    object_spec: objectSpec,
    environment_spec: environmentSpec,
    config: isConfig(value.config) ? { ...value.config } : {},
    notes: requiredString(value, "notes"),
    metrics: isMetrics(value.metrics) ? { ...value.metrics } : {},
    featured_metric_keys:
      Array.isArray(featuredMetricKeys)
      && featuredMetricKeys.every((item) => typeof item === "string")
        ? [...featuredMetricKeys]
        : [],
    result_summary: requiredString(value, "result_summary"),
    decision_outcome: decisionOutcome as DecisionOutcome | null,
    decision_notes: requiredString(value, "decision_notes"),
    position: requiredNumber(value, "position"),
    started_at: startedAt,
    completed_at: completedAt,
    created_at: requiredString(value, "created_at"),
    updated_at: requiredString(value, "updated_at"),
  };
}

function activityDto(value: unknown): ActivityMutationDto {
  if (!isRecord(value) || value.kind !== "comment") return invalidRpcData();
  const experimentId = nullableUuid(value, "experiment_id");
  return {
    id: requiredUuid(value, "id"),
    task_id: requiredUuid(value, "task_id"),
    experiment_id: experimentId,
    text: requiredString(value, "text"),
    kind: "comment",
    created_at: requiredString(value, "created_at"),
  };
}

function attachmentDto(value: unknown): AttachmentMutationDto {
  if (!isRecord(value)) return invalidRpcData();
  return {
    id: requiredUuid(value, "id"),
    task_id: requiredUuid(value, "task_id"),
    experiment_id: nullableUuid(value, "experiment_id"),
    url: requiredString(value, "url"),
    path: requiredString(value, "path"),
    caption: requiredString(value, "caption"),
    position: requiredNumber(value, "position"),
    created_at: requiredString(value, "created_at"),
    updated_at: requiredString(value, "updated_at"),
  };
}

const DOMAIN_ERRORS: Record<
  string,
  () => AgentApiError
> = {
  VERSION_CONFLICT: () => new AgentApiError(
    412,
    "VERSION_CONFLICT",
    "The resource changed since it was read.",
  ),
  TASK_SCOPE_FORBIDDEN: () => new AgentApiError(
    403,
    "TASK_SCOPE_FORBIDDEN",
    "The Agent no longer has access to this Task.",
  ),
  WRITE_RATE_LIMITED: () => new AgentApiError(
    429,
    "WRITE_RATE_LIMITED",
    "The Agent API write rate limit was reached.",
    true,
  ),
  IDEMPOTENCY_KEY_REUSED: () => new AgentApiError(
    409,
    "IDEMPOTENCY_KEY_REUSED",
    "Idempotency-Key was already used for a different request.",
  ),
  IDEMPOTENCY_INPUT_REQUIRED: () => new AgentApiError(
    400,
    "IDEMPOTENCY_INPUT_REQUIRED",
    "Idempotency inputs are required.",
  ),
  INVALID_EXPERIMENT_NAME: () => new AgentApiError(
    422,
    "INVALID_EXPERIMENT_NAME",
    "Experiment name is invalid.",
    false,
    { field: "name" },
  ),
};

function hasTrustedRpcErrorCode(error: unknown): boolean {
  if (!isRecord(error) || typeof error.code !== "string") return false;
  return /^[A-Z0-9]{5}$/.test(error.code)
    || /^PGRST[0-9]{3}$/.test(error.code);
}

function throwRpcError(error: unknown, status: unknown): void {
  if (!error) return;
  if (
    typeof status !== "number"
    || !Number.isInteger(status)
    || status < 400
    || status > 599
    || !hasTrustedRpcErrorCode(error)
  ) {
    throw new Error("Agent API mutation RPC outcome is ambiguous.");
  }
  const message = isRecord(error) && typeof error.message === "string"
    ? error.message
    : "";
  const domainError = DOMAIN_ERRORS[message];
  if (domainError) throw domainError();
  throw new MutationRpcRejectedError();
}

function mutationResult<T>(
  value: unknown,
  project: (data: unknown) => T,
): MutationResult<T> {
  if (
    !isRecord(value)
    || typeof value.idempotency_replayed !== "boolean"
    || !Object.hasOwn(value, "data")
  ) {
    return invalidRpcData();
  }
  return {
    data: project(value.data),
    idempotencyReplayed: value.idempotency_replayed,
  };
}

export function createMutationRepository(client: SupabaseClient) {
  return {
    async patchTask(input: PatchTaskInput): Promise<
      MutationResult<TaskMutationDto>
    > {
      const { data, error, status } = await client.rpc("agent_api_patch_task", {
        p_api_key_id: input.context.apiKeyId,
        p_member_id: input.context.memberId,
        p_task_id: input.taskId,
        p_expected_updated_at: input.expectedUpdatedAt,
        p_changes: input.changes,
        p_request_id: input.requestId,
      });
      throwRpcError(error, status);
      return mutationResult(data, taskDto);
    },

    async createExperiment(input: CreateExperimentInput): Promise<
      MutationResult<ExperimentMutationDto>
    > {
      const { data, error, status } = await client.rpc(
        "agent_api_create_experiment",
        {
          p_api_key_id: input.context.apiKeyId,
          p_member_id: input.context.memberId,
          p_task_id: input.taskId,
          p_name: input.name,
          p_idempotency_key: input.idempotencyKey,
          p_request_hash: input.requestHash,
          p_request_id: input.requestId,
        },
      );
      throwRpcError(error, status);
      return mutationResult(data, experimentDto);
    },

    async patchExperiment(input: PatchExperimentInput): Promise<
      MutationResult<ExperimentMutationDto>
    > {
      const { data, error, status } = await client.rpc(
        "agent_api_patch_experiment",
        {
          p_api_key_id: input.context.apiKeyId,
          p_member_id: input.context.memberId,
          p_experiment_id: input.experimentId,
          p_expected_updated_at: input.expectedUpdatedAt,
          p_changes: input.changes,
          p_request_id: input.requestId,
        },
      );
      throwRpcError(error, status);
      return mutationResult(data, experimentDto);
    },

    async createActivity(input: CreateActivityInput): Promise<
      MutationResult<ActivityMutationDto>
    > {
      const { data, error, status } = await client.rpc(
        "agent_api_create_activity",
        {
          p_api_key_id: input.context.apiKeyId,
          p_member_id: input.context.memberId,
          p_task_id: input.taskId,
          p_text: input.text,
          p_idempotency_key: input.idempotencyKey,
          p_request_hash: input.requestHash,
          p_request_id: input.requestId,
        },
      );
      throwRpcError(error, status);
      return mutationResult(data, activityDto);
    },

    async createAttachment(input: CreateAttachmentInput): Promise<
      MutationResult<AttachmentMutationDto>
    > {
      const { data, error, status } = await client.rpc(
        "agent_api_create_attachment",
        {
          p_api_key_id: input.context.apiKeyId,
          p_member_id: input.context.memberId,
          p_experiment_id: input.experimentId,
          p_path: input.path,
          p_url: input.url,
          p_caption: input.caption,
          p_idempotency_key: input.idempotencyKey,
          p_request_hash: input.requestHash,
          p_request_id: input.requestId,
        },
      );
      throwRpcError(error, status);
      return mutationResult(data, attachmentDto);
    },

    async patchAttachment(input: PatchAttachmentInput): Promise<
      MutationResult<AttachmentMutationDto>
    > {
      const { data, error, status } = await client.rpc(
        "agent_api_patch_attachment",
        {
          p_api_key_id: input.context.apiKeyId,
          p_member_id: input.context.memberId,
          p_attachment_id: input.attachmentId,
          p_expected_updated_at: input.expectedUpdatedAt,
          p_caption: input.caption,
          p_request_id: input.requestId,
        },
      );
      throwRpcError(error, status);
      return mutationResult(data, attachmentDto);
    },
  };
}

function repository() {
  return createMutationRepository(getServerSupabase());
}

export function patchTask(
  input: PatchTaskInput,
): Promise<MutationResult<TaskMutationDto>> {
  return repository().patchTask(input);
}

export function createExperiment(
  input: CreateExperimentInput,
): Promise<MutationResult<ExperimentMutationDto>> {
  return repository().createExperiment(input);
}

export function patchExperiment(
  input: PatchExperimentInput,
): Promise<MutationResult<ExperimentMutationDto>> {
  return repository().patchExperiment(input);
}

export function createActivity(
  input: CreateActivityInput,
): Promise<MutationResult<ActivityMutationDto>> {
  return repository().createActivity(input);
}

export function createAttachment(
  input: CreateAttachmentInput,
): Promise<MutationResult<AttachmentMutationDto>> {
  return repository().createAttachment(input);
}

export function patchAttachment(
  input: PatchAttachmentInput,
): Promise<MutationResult<AttachmentMutationDto>> {
  return repository().patchAttachment(input);
}
