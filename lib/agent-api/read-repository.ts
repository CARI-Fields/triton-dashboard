import type { SupabaseClient } from "@supabase/supabase-js";
import { AgentApiError } from "@/lib/agent-api/errors";
import { getServerSupabase } from "@/lib/agent-api/server";
import { isRfc3339Timestamp } from "@/lib/agent-api/timestamps";
import type { AgentContext } from "@/lib/agent-api/types";
import {
  isConfig,
  isDataSpec,
  isEnvironmentSpec,
  isMetrics,
  isObjectSpec,
} from "@/lib/experiments/schema";
import {
  normalizeTaskRow,
  TASK_WITH_ASSIGNEES_SELECT,
  type TaskRelationRow,
} from "@/lib/tasks/assignees";
import type {
  Activity,
  Attachment,
  Experiment,
  ExperimentListRow,
  ExperimentStatus,
  Member,
  Module,
  Status,
  Task,
} from "@/lib/types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_JSON_BODY_BYTES = 256 * 1024;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const WRITES_PER_MINUTE = 30;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

const TASK_STATUSES = new Set<Status>([
  "todo",
  "in_progress",
  "done",
  "blocked",
]);
const EXPERIMENT_STATUSES = new Set<ExperimentStatus>([
  "planned",
  "running",
  "analyzing",
  "completed",
  "blocked",
  "cancelled",
]);

const MODULE_SELECT = "id,name,kind,objective,position,created_at";
const MEMBER_SELECT = "id,name,initials,position,created_at";
const EXPERIMENT_COLUMNS = [
  "id",
  "experiment_no",
  "task_id",
  "owner_id",
  "name",
  "status",
  "baseline_experiment_id",
  "data_spec",
  "object_spec",
  "environment_spec",
  "config",
  "notes",
  "metrics",
  "featured_metric_keys",
  "result_summary",
  "decision_outcome",
  "decision_notes",
  "position",
  "started_at",
  "completed_at",
  "created_at",
  "updated_at",
].join(",");
const EXPERIMENT_SELECT = [
  EXPERIMENT_COLUMNS,
  "task:tasks(id,title)",
  `owner:members(${MEMBER_SELECT})`,
].join(",");
const ATTACHMENT_SELECT = [
  "id",
  "task_id",
  "experiment_id",
  "url",
  "path",
  "caption",
  "position",
  "created_at",
  "updated_at",
].join(",");
const EXPERIMENT_DETAIL_SELECT = [
  EXPERIMENT_SELECT,
  `attachments(${ATTACHMENT_SELECT})`,
].join(",");
const ACTIVITY_SELECT =
  "id,task_id,experiment_id,text,kind,created_at";

export interface UpdatedCursor {
  updated_at: string;
  id: string;
}

export interface TaskListFilters {
  moduleId?: string;
  assigneeId?: string;
  status?: Status;
  updatedAfter?: string;
  cursor?: UpdatedCursor;
  limit: number;
}

export interface ExperimentListFilters {
  taskId?: string;
  ownerId?: string;
  status?: ExperimentStatus;
  updatedAfter?: string;
  cursor?: UpdatedCursor;
  limit: number;
}

export interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
}

export interface CapabilitiesDto {
  key_prefix: string;
  member: { id: string; name: string };
  scopes: string[];
  expires_at: string | null;
  limits: {
    default_page_size: number;
    max_page_size: number;
    max_json_body_bytes: number;
    max_attachment_bytes: number;
    successful_writes_per_60_seconds: number;
  };
}

export interface BoardSummaryDto {
  modules: number;
  members: number;
  tasks: number;
  experiments: number;
  task_statuses: Record<Status, number>;
  experiment_statuses: Record<ExperimentStatus, number>;
}

export type ExperimentDetailDto = ExperimentListRow & {
  attachments: Attachment[];
};

export interface AuditDto {
  id: string;
  key: { id: string; prefix: string };
  member: { id: string };
  request_id: string;
  resource_type: string;
  resource_id: string;
  task_id: string | null;
  action: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  response_status: number;
  created_at: string;
}

interface OrFilterQuery {
  or(filters: string): unknown;
}

function invalidQuery(field: string, message?: string): never {
  throw new AgentApiError(
    400,
    "INVALID_QUERY",
    message ?? `${field} has an invalid value.`,
    false,
    { field },
  );
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function parseResourceId(value: string, field: string): string {
  if (!isUuid(value)) invalidQuery(field);
  return value;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/")
    + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function encodeUpdatedCursor(cursor: UpdatedCursor): string {
  return bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify(cursor)),
  );
}

export function decodeUpdatedCursor(value: string): UpdatedCursor {
  if (!BASE64URL_PATTERN.test(value)) invalidQuery("cursor");
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true })
      .decode(base64UrlToBytes(value));
    const parsed = JSON.parse(decoded) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return invalidQuery("cursor");
    }
    const record = parsed as Record<string, unknown>;
    if (
      Object.keys(record).length !== 2
      || !Object.hasOwn(record, "updated_at")
      || !Object.hasOwn(record, "id")
      || !isRfc3339Timestamp(record.updated_at)
      || !isUuid(record.id)
    ) {
      return invalidQuery("cursor");
    }
    const cursor = {
      updated_at: record.updated_at,
      id: record.id,
    };
    if (encodeUpdatedCursor(cursor) !== value) invalidQuery("cursor");
    return cursor;
  } catch (reason) {
    if (reason instanceof AgentApiError) throw reason;
    return invalidQuery("cursor");
  }
}

function oneValue(
  params: URLSearchParams,
  field: string,
): string | undefined {
  const values = params.getAll(field);
  if (values.length > 1) invalidQuery(field);
  return values[0];
}

function parseUuidParameter(
  params: URLSearchParams,
  field: string,
): string | undefined {
  const value = oneValue(params, field);
  if (value === undefined) return undefined;
  if (!isUuid(value)) invalidQuery(field);
  return value;
}

function parseTimestampParameter(
  params: URLSearchParams,
  field: string,
): string | undefined {
  const value = oneValue(params, field);
  if (value === undefined) return undefined;
  if (!isRfc3339Timestamp(value)) invalidQuery(field);
  return value;
}

function parseLimit(params: URLSearchParams): number {
  const value = oneValue(params, "limit");
  if (value === undefined) return DEFAULT_LIMIT;
  if (!/^[1-9]\d*$/.test(value)) invalidQuery("limit");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > MAX_LIMIT) {
    invalidQuery("limit");
  }
  return parsed;
}

function assertAllowedParameters(
  params: URLSearchParams,
  allowed: ReadonlySet<string>,
): void {
  for (const field of params.keys()) {
    if (!allowed.has(field)) {
      invalidQuery(field, `${field} is not a supported query parameter.`);
    }
  }
}

export function assertNoQueryParameters(request: Request): void {
  const params = new URL(request.url).searchParams;
  const first = params.keys().next();
  if (!first.done) {
    invalidQuery(
      first.value,
      `${first.value} is not a supported query parameter.`,
    );
  }
}

export function parseTaskListFilters(request: Request): TaskListFilters {
  const params = new URL(request.url).searchParams;
  assertAllowedParameters(params, new Set([
    "module_id",
    "assignee_id",
    "status",
    "updated_after",
    "cursor",
    "limit",
  ]));
  const status = oneValue(params, "status");
  if (status !== undefined && !TASK_STATUSES.has(status as Status)) {
    invalidQuery("status");
  }
  const moduleId = parseUuidParameter(params, "module_id");
  const assigneeId = parseUuidParameter(params, "assignee_id");
  const updatedAfter = parseTimestampParameter(params, "updated_after");
  const cursor = oneValue(params, "cursor");
  return {
    ...(moduleId === undefined ? {} : { moduleId }),
    ...(assigneeId === undefined ? {} : { assigneeId }),
    ...(status === undefined ? {} : { status: status as Status }),
    ...(updatedAfter === undefined ? {} : { updatedAfter }),
    ...(cursor === undefined
      ? {}
      : { cursor: decodeUpdatedCursor(cursor) }),
    limit: parseLimit(params),
  };
}

export function parseExperimentListFilters(
  request: Request,
): ExperimentListFilters {
  const params = new URL(request.url).searchParams;
  assertAllowedParameters(params, new Set([
    "task_id",
    "owner_id",
    "status",
    "updated_after",
    "cursor",
    "limit",
  ]));
  const status = oneValue(params, "status");
  if (
    status !== undefined
    && !EXPERIMENT_STATUSES.has(status as ExperimentStatus)
  ) {
    invalidQuery("status");
  }
  const taskId = parseUuidParameter(params, "task_id");
  const ownerId = parseUuidParameter(params, "owner_id");
  const updatedAfter = parseTimestampParameter(params, "updated_after");
  const cursor = oneValue(params, "cursor");
  return {
    ...(taskId === undefined ? {} : { taskId }),
    ...(ownerId === undefined ? {} : { ownerId }),
    ...(status === undefined
      ? {}
      : { status: status as ExperimentStatus }),
    ...(updatedAfter === undefined ? {} : { updatedAfter }),
    ...(cursor === undefined
      ? {}
      : { cursor: decodeUpdatedCursor(cursor) }),
    limit: parseLimit(params),
  };
}

function throwIfError(error: unknown): void {
  if (error) throw new Error("Agent API read query failed.");
}

function taskDto(row: Record<string, unknown>): Task {
  const relationRow: TaskRelationRow = {
    id: row.id as string,
    module_id: row.module_id as string | null,
    title: row.title as string,
    status: row.status as Status,
    notes: row.notes as string,
    tags: row.tags as string[],
    priority: row.priority as Task["priority"],
    due_date: row.due_date as string | null,
    position: row.position as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    task_assignees: row.task_assignees as TaskRelationRow["task_assignees"],
  };
  return normalizeTaskRow(relationRow);
}

function moduleDto(row: Record<string, unknown>): Module {
  return {
    id: row.id as string,
    name: row.name as string,
    kind: row.kind as Module["kind"],
    objective: row.objective as string,
    position: row.position as number,
    created_at: row.created_at as string,
  };
}

function memberDto(row: Record<string, unknown>): Member {
  return {
    id: row.id as string,
    name: row.name as string,
    initials: row.initials as string,
    position: row.position as number,
    created_at: row.created_at as string,
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizedExperimentFields(
  row: Record<string, unknown>,
): Pick<
  Experiment,
  | "data_spec"
  | "object_spec"
  | "environment_spec"
  | "config"
  | "metrics"
  | "featured_metric_keys"
> {
  const dataSpec: Experiment["data_spec"] = isDataSpec(row.data_spec)
    ? {
      datasets: row.data_spec.datasets.map((dataset) => ({
        role: dataset.role,
        name: dataset.name,
        split: dataset.split,
        revision: dataset.revision,
        task_count: dataset.task_count,
        samples_per_task: dataset.samples_per_task,
      })),
    }
    : { datasets: [] };
  const objectSpec: Experiment["object_spec"] = isObjectSpec(row.object_spec)
    ? {
      model: row.object_spec.model,
      harness: row.object_spec.harness,
      parent_harness: row.object_spec.parent_harness,
      prompt: row.object_spec.prompt,
      prompt_change: row.object_spec.prompt_change,
      skills: [...row.object_spec.skills],
      tools: [...row.object_spec.tools],
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
    isEnvironmentSpec(row.environment_spec)
      ? {
        platform: row.environment_spec.platform,
        server: row.environment_spec.server,
        devices: [...row.environment_spec.devices],
        hardware: row.environment_spec.hardware,
        evaluator: row.environment_spec.evaluator,
        revision: row.environment_spec.revision,
        precision_policy: row.environment_spec.precision_policy,
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
  const featuredMetricKeys = row.featured_metric_keys;
  return {
    data_spec: dataSpec,
    object_spec: objectSpec,
    environment_spec: environmentSpec,
    config: isConfig(row.config) ? { ...row.config } : {},
    metrics: isMetrics(row.metrics) ? { ...row.metrics } : {},
    featured_metric_keys:
      Array.isArray(featuredMetricKeys)
      && featuredMetricKeys.every((key) => typeof key === "string")
        ? [...featuredMetricKeys]
        : [],
  };
}

function taskReferenceDto(
  value: unknown,
): ExperimentListRow["task"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  return {
    id: row.id as string,
    title: row.title as string,
  };
}

function experimentDto(row: Record<string, unknown>): ExperimentListRow {
  const experiment: Experiment = {
    id: row.id as string,
    experiment_no: row.experiment_no as number,
    task_id: row.task_id as string,
    owner_id: row.owner_id as string | null,
    name: row.name as string,
    status: row.status as ExperimentStatus,
    baseline_experiment_id: row.baseline_experiment_id as string | null,
    ...normalizedExperimentFields(row),
    notes: row.notes as string,
    result_summary: row.result_summary as string,
    decision_outcome: row.decision_outcome as Experiment["decision_outcome"],
    decision_notes: row.decision_notes as string,
    position: row.position as number,
    started_at: row.started_at as string | null,
    completed_at: row.completed_at as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
  return {
    ...experiment,
    task: taskReferenceDto(row.task),
    owner: row.owner === null || row.owner === undefined
      ? null
      : memberDto(row.owner as Record<string, unknown>),
  };
}

function attachmentDto(row: Record<string, unknown>): Attachment {
  return {
    id: row.id as string,
    task_id: row.task_id as string,
    experiment_id: row.experiment_id as string | null,
    url: row.url as string,
    path: row.path as string,
    caption: row.caption as string,
    position: row.position as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function activityDto(row: Record<string, unknown>): Activity {
  return {
    id: row.id as string,
    task_id: row.task_id as string,
    experiment_id: row.experiment_id as string | null,
    text: row.text as string,
    kind: row.kind as Activity["kind"],
    created_at: row.created_at as string,
  };
}

const SNAPSHOT_FIELDS: Record<string, readonly string[]> = {
  task: [
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
  ],
  experiment: EXPERIMENT_COLUMNS.split(","),
  attachment: ATTACHMENT_SELECT.split(","),
  activity: ACTIVITY_SELECT.split(","),
};

function snapshotDto(
  resourceType: string,
  value: unknown,
): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    (SNAPSHOT_FIELDS[resourceType] ?? [])
      .filter((field) => Object.hasOwn(source, field))
      .map((field) => [field, source[field]]),
  );
}

function auditDto(row: Record<string, unknown>): AuditDto {
  const resourceType = row.resource_type as string;
  return {
    id: row.id as string,
    key: {
      id: row.api_key_id as string,
      prefix: row.key_prefix as string,
    },
    member: { id: row.member_id as string },
    request_id: row.request_id as string,
    resource_type: resourceType,
    resource_id: row.resource_id as string,
    task_id: row.task_id as string | null,
    action: row.action as string,
    before_state: snapshotDto(resourceType, row.before_state),
    after_state: snapshotDto(resourceType, row.after_state),
    response_status: row.response_status as number,
    created_at: row.created_at as string,
  };
}

function countValue(value: unknown): number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < 0
  ) {
    throw new Error("Agent API read query failed.");
  }
  return value;
}

function boardSummaryDto(value: unknown): BoardSummaryDto {
  const row = recordValue(value);
  const tasks = recordValue(row.task_statuses);
  const experiments = recordValue(row.experiment_statuses);
  return {
    modules: countValue(row.modules),
    members: countValue(row.members),
    tasks: countValue(row.tasks),
    experiments: countValue(row.experiments),
    task_statuses: {
      todo: countValue(tasks.todo),
      in_progress: countValue(tasks.in_progress),
      done: countValue(tasks.done),
      blocked: countValue(tasks.blocked),
    },
    experiment_statuses: {
      planned: countValue(experiments.planned),
      running: countValue(experiments.running),
      analyzing: countValue(experiments.analyzing),
      completed: countValue(experiments.completed),
      blocked: countValue(experiments.blocked),
      cancelled: countValue(experiments.cancelled),
    },
  };
}

function page<T extends { id: string; updated_at: string }>(
  values: T[],
  limit: number,
): CursorPage<T> {
  const hasNext = values.length > limit;
  const items = hasNext ? values.slice(0, limit) : values;
  const last = items.at(-1);
  return {
    items,
    next_cursor: hasNext && last
      ? encodeUpdatedCursor({ updated_at: last.updated_at, id: last.id })
      : null,
  };
}

function applyUpdatedCursor(
  query: OrFilterQuery,
  cursor: UpdatedCursor,
): void {
  query.or(
    `updated_at.lt.${cursor.updated_at},`
    + `and(updated_at.eq.${cursor.updated_at},id.lt.${cursor.id})`,
  );
}

export function createReadRepository(client: SupabaseClient) {
  return {
    getCapabilities(agent: AgentContext): CapabilitiesDto {
      return {
        key_prefix: agent.keyPrefix,
        member: { id: agent.memberId, name: agent.memberName },
        scopes: [...agent.scopes].sort(),
        expires_at: agent.expiresAt,
        limits: {
          default_page_size: DEFAULT_LIMIT,
          max_page_size: MAX_LIMIT,
          max_json_body_bytes: MAX_JSON_BODY_BYTES,
          max_attachment_bytes: MAX_ATTACHMENT_BYTES,
          successful_writes_per_60_seconds: WRITES_PER_MINUTE,
        },
      };
    },

    async getBoardSummary(): Promise<BoardSummaryDto> {
      const { data, error } = await client.rpc("agent_api_board_summary");
      throwIfError(error);
      return boardSummaryDto(data);
    },

    async listModules(): Promise<Module[]> {
      const { data, error } = await client
        .from("modules")
        .select(MODULE_SELECT)
        .order("position", { ascending: true })
        .order("id", { ascending: true });
      throwIfError(error);
      return ((data ?? []) as unknown as Record<string, unknown>[])
        .map(moduleDto);
    },

    async listMembers(): Promise<Member[]> {
      const { data, error } = await client
        .from("members")
        .select(MEMBER_SELECT)
        .order("position", { ascending: true })
        .order("id", { ascending: true });
      throwIfError(error);
      return ((data ?? []) as unknown as Record<string, unknown>[])
        .map(memberDto);
    },

    async listTasks(filters: TaskListFilters): Promise<CursorPage<Task>> {
      const assigneeFilter = filters.assigneeId
        ? ",assignee_filter:task_assignees!inner(member_id)"
        : "";
      let query = client
        .from("tasks")
        .select(`${TASK_WITH_ASSIGNEES_SELECT}${assigneeFilter}`);
      if (filters.moduleId) query = query.eq("module_id", filters.moduleId);
      if (filters.status) query = query.eq("status", filters.status);
      if (filters.assigneeId) {
        query = query.eq(
          "assignee_filter.member_id",
          filters.assigneeId,
        );
      }
      if (filters.updatedAfter) {
        query = query.gt("updated_at", filters.updatedAfter);
      }
      if (filters.cursor) applyUpdatedCursor(query, filters.cursor);
      const { data, error } = await query
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(filters.limit + 1);
      throwIfError(error);
      const tasks = ((data ?? []) as unknown as Record<string, unknown>[])
        .map(taskDto);
      return page(tasks, filters.limit);
    },

    async getTask(id: string): Promise<Task | null> {
      const { data, error } = await client
        .from("tasks")
        .select(TASK_WITH_ASSIGNEES_SELECT)
        .eq("id", id)
        .maybeSingle();
      throwIfError(error);
      return data
        ? taskDto(data as unknown as Record<string, unknown>)
        : null;
    },

    async listExperiments(
      filters: ExperimentListFilters,
    ): Promise<CursorPage<ExperimentListRow>> {
      let query = client.from("experiments").select(EXPERIMENT_SELECT);
      if (filters.taskId) query = query.eq("task_id", filters.taskId);
      if (filters.ownerId) query = query.eq("owner_id", filters.ownerId);
      if (filters.status) query = query.eq("status", filters.status);
      if (filters.updatedAfter) {
        query = query.gt("updated_at", filters.updatedAfter);
      }
      if (filters.cursor) applyUpdatedCursor(query, filters.cursor);
      const { data, error } = await query
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(filters.limit + 1);
      throwIfError(error);
      const experiments =
        ((data ?? []) as unknown as Record<string, unknown>[])
          .map(experimentDto);
      return page(experiments, filters.limit);
    },

    async getExperiment(id: string): Promise<ExperimentDetailDto | null> {
      const { data, error } = await client
        .from("experiments")
        .select(EXPERIMENT_DETAIL_SELECT)
        .eq("id", id)
        .maybeSingle();
      throwIfError(error);
      if (!data) return null;
      const row = data as unknown as Record<string, unknown>;
      return {
        ...experimentDto(row),
        attachments:
          ((row.attachments ?? []) as Record<string, unknown>[])
            .map(attachmentDto),
      };
    },

    async listTaskActivity(
      taskId: string,
      _filters: Record<string, never>,
    ): Promise<Activity[]> {
      const { data, error } = await client
        .from("activity")
        .select(ACTIVITY_SELECT)
        .eq("task_id", taskId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
      throwIfError(error);
      return ((data ?? []) as unknown as Record<string, unknown>[])
        .map(activityDto);
    },

    async listAudit(
      agent: AgentContext,
      _filters: Record<string, never>,
    ): Promise<AuditDto[]> {
      const { data, error } = await client.rpc("agent_api_list_audit", {
        p_member_id: agent.memberId,
      });
      throwIfError(error);
      return ((data ?? []) as unknown as Record<string, unknown>[])
        .map(auditDto);
    },
  };
}

function repository() {
  return createReadRepository(getServerSupabase());
}

export function getCapabilities(context: AgentContext): CapabilitiesDto {
  return repository().getCapabilities(context);
}

export function getBoardSummary(): Promise<BoardSummaryDto> {
  return repository().getBoardSummary();
}

export function listModules(): Promise<Module[]> {
  return repository().listModules();
}

export function listMembers(): Promise<Member[]> {
  return repository().listMembers();
}

export function listTasks(
  filters: TaskListFilters,
): Promise<CursorPage<Task>> {
  return repository().listTasks(filters);
}

export function getTask(id: string): Promise<Task | null> {
  return repository().getTask(id);
}

export function listExperiments(
  filters: ExperimentListFilters,
): Promise<CursorPage<ExperimentListRow>> {
  return repository().listExperiments(filters);
}

export function getExperiment(
  id: string,
): Promise<ExperimentDetailDto | null> {
  return repository().getExperiment(id);
}

export function listTaskActivity(
  taskId: string,
  filters: Record<string, never>,
): Promise<Activity[]> {
  return repository().listTaskActivity(taskId, filters);
}

export function listAudit(
  context: AgentContext,
  filters: Record<string, never>,
): Promise<AuditDto[]> {
  return repository().listAudit(context, filters);
}
