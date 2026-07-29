import { AgentApiError } from "@/lib/agent-api/errors";
import {
  isConfig,
  isDataSpec,
  isEnvironmentSpec,
  isMetrics,
  isObjectSpec,
} from "@/lib/experiments/schema";
import type {
  DecisionOutcome,
  Experiment,
  ExperimentStatus,
  Status,
  Task,
} from "@/lib/types";

const MAX_JSON_BYTES = 256 * 1024;
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
const DECISION_OUTCOMES = new Set<DecisionOutcome>([
  "reference",
  "accepted",
  "rejected",
  "inconclusive",
]);
const DATA_SPEC_FIELDS = new Set(["datasets"]);
const DATASET_FIELDS = new Set([
  "role",
  "name",
  "split",
  "revision",
  "task_count",
  "samples_per_task",
]);
const OBJECT_SPEC_FIELDS = new Set([
  "model",
  "harness",
  "parent_harness",
  "prompt",
  "prompt_change",
  "skills",
  "tools",
]);
const ENVIRONMENT_SPEC_FIELDS = new Set([
  "platform",
  "server",
  "devices",
  "hardware",
  "evaluator",
  "revision",
  "precision_policy",
]);

const TASK_WRITABLE_FIELDS = new Set([
  "title",
  "status",
  "notes",
  "position",
]);
const TASK_PROTECTED_FIELDS = new Set([
  "id",
  "module_id",
  "assignees",
  "task_assignees",
  "created_at",
  "updated_at",
]);

const EXPERIMENT_WRITABLE_FIELDS = new Set([
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
]);
const EXPERIMENT_PROTECTED_FIELDS = new Set([
  "id",
  "experiment_no",
  "task_id",
  "owner_id",
  "started_at",
  "completed_at",
  "created_at",
  "updated_at",
]);
const EXPERIMENT_DECLARED_FIELDS = new Set([
  ...EXPERIMENT_WRITABLE_FIELDS,
  ...EXPERIMENT_PROTECTED_FIELDS,
]);
const ACTIVITY_PROTECTED_FIELDS = new Set([
  "id",
  "task_id",
  "experiment_id",
  "member_id",
  "kind",
  "created_at",
  "updated_at",
]);
const ATTACHMENT_PROTECTED_FIELDS = new Set([
  "id",
  "task_id",
  "experiment_id",
  "owner_id",
  "path",
  "url",
  "position",
  "created_at",
  "updated_at",
]);
const ATTACHMENT_MIME_EXTENSIONS = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
] as const);
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export type TaskPatch = Partial<
  Pick<Task, "title" | "status" | "notes" | "position">
>;

export type ExperimentPatch = Partial<
  Pick<
    Experiment,
    | "name"
    | "status"
    | "baseline_experiment_id"
    | "data_spec"
    | "object_spec"
    | "environment_spec"
    | "config"
    | "notes"
    | "metrics"
    | "featured_metric_keys"
    | "result_summary"
    | "decision_outcome"
    | "decision_notes"
    | "position"
  >
>;

export interface ExperimentCreate {
  name: string;
}

export interface ActivityCreate {
  text: string;
}

export interface AttachmentPatch {
  caption: string;
}

export interface AttachmentFormInput {
  file: File;
  caption: string;
  mime: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  extension: "png" | "jpg" | "webp" | "gif";
}

type JsonDomainIssue = "invalid_shape" | "non_finite_number" | null;
type JsonInspectionFrame =
  | { kind: "enter"; value: unknown }
  | { kind: "exit"; value: object };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isFileValue(value: unknown): value is File {
  return typeof value === "object"
    && value !== null
    && "name" in value
    && typeof value.name === "string"
    && "size" in value
    && typeof value.size === "number"
    && "type" in value
    && typeof value.type === "string"
    && "arrayBuffer" in value
    && typeof value.arrayBuffer === "function";
}

function inspectJsonDomain(value: unknown): JsonDomainIssue {
  const ancestors = new WeakSet<object>();
  const stack: JsonInspectionFrame[] = [{ kind: "enter", value }];
  let issue: JsonDomainIssue = null;
  try {
    while (stack.length > 0) {
      const frame = stack.pop()!;
      if (frame.kind === "exit") {
        ancestors.delete(frame.value);
        continue;
      }

      const current = frame.value;
      if (
        current === null
        || typeof current === "string"
        || typeof current === "boolean"
      ) {
        continue;
      }
      if (typeof current === "number") {
        if (!Number.isFinite(current)) issue = "non_finite_number";
        continue;
      }
      if (typeof current !== "object" || ancestors.has(current)) {
        return "invalid_shape";
      }

      ancestors.add(current);
      stack.push({ kind: "exit", value: current });

      if (Array.isArray(current)) {
        if (Object.getPrototypeOf(current) !== Array.prototype) {
          return "invalid_shape";
        }
        const keys = Reflect.ownKeys(current);
        if (keys.length !== current.length + 1 || !keys.includes("length")) {
          return "invalid_shape";
        }
        for (let index = 0; index < current.length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(
            current,
            String(index),
          );
          if (
            !descriptor
            || !descriptor.enumerable
            || !("value" in descriptor)
          ) {
            return "invalid_shape";
          }
          stack.push({ kind: "enter", value: descriptor.value });
        }
        continue;
      }

      if (!isPlainObject(current)) return "invalid_shape";
      for (const key of Reflect.ownKeys(current)) {
        if (typeof key !== "string") return "invalid_shape";
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (
          !descriptor
          || !descriptor.enumerable
          || !("value" in descriptor)
        ) {
          return "invalid_shape";
        }
        stack.push({ kind: "enter", value: descriptor.value });
      }
    }
    return issue;
  } catch {
    return "invalid_shape";
  }
}

function hasOnlyFields(
  value: unknown,
  allowedFields: ReadonlySet<string>,
): boolean {
  return isRecord(value)
    && Object.keys(value).every((field) => allowedFields.has(field));
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(value);
}

function invalidBody(message: string): never {
  throw new AgentApiError(400, "INVALID_BODY", message);
}

function invalidField(field: string): never {
  throw new AgentApiError(
    422,
    "INVALID_FIELD",
    `${field} has an invalid value.`,
    false,
    { field },
  );
}

function cloneJsonField<T>(field: string, value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return invalidField(field);
  }
}

function validateFieldName(
  field: string,
  writable: ReadonlySet<string>,
  protectedFields: ReadonlySet<string>,
): void {
  if (protectedFields.has(field)) {
    throw new AgentApiError(
      422,
      "FIELD_NOT_WRITABLE",
      `${field} cannot be modified by the Agent API.`,
      false,
      { field },
    );
  }
  if (!writable.has(field)) {
    throw new AgentApiError(
      422,
      "UNKNOWN_FIELD",
      `${field} is not a recognized field.`,
      false,
      { field },
    );
  }
}

function parsePatchEnvelope(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) {
    return invalidBody("PATCH body must be a JSON object.");
  }
  const topLevelFields = Object.keys(body);
  if (
    topLevelFields.length !== 1
    || topLevelFields[0] !== "changes"
    || !isRecord(body.changes)
  ) {
    return invalidBody(
      'PATCH body must contain exactly one "changes" object.',
    );
  }
  if (Object.keys(body.changes).length === 0) {
    throw new AgentApiError(
      422,
      "EMPTY_PATCH",
      "PATCH changes cannot be empty.",
    );
  }
  return body.changes;
}

export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) {
    throw new AgentApiError(
      413,
      "BODY_TOO_LARGE",
      "JSON request body exceeds 256 KiB.",
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new AgentApiError(400, "INVALID_JSON", "Request body is not valid JSON.");
  }
  if (!isRecord(body)) {
    return invalidBody("Request body must be a JSON object.");
  }
  return body;
}

export function parseTaskPatch(body: unknown): TaskPatch {
  const jsonDomainIssue = inspectJsonDomain(body);
  if (jsonDomainIssue === "invalid_shape") {
    return invalidBody("PATCH body must contain only JSON values.");
  }
  const changes = parsePatchEnvelope(body);
  const parsed: TaskPatch = {};

  for (const [field, value] of Object.entries(changes)) {
    validateFieldName(field, TASK_WRITABLE_FIELDS, TASK_PROTECTED_FIELDS);
    switch (field) {
      case "title":
        if (typeof value !== "string") invalidField(field);
        parsed.title = value;
        break;
      case "status":
        if (
          typeof value !== "string"
          || !TASK_STATUSES.has(value as Status)
        ) {
          invalidField(field);
        }
        parsed.status = value as Status;
        break;
      case "notes":
        if (typeof value !== "string") invalidField(field);
        parsed.notes = value;
        break;
      case "position":
        if (typeof value !== "number" || !Number.isFinite(value)) {
          invalidField(field);
        }
        parsed.position = value;
        break;
    }
  }
  if (jsonDomainIssue !== null) {
    return invalidBody("PATCH body must contain only finite JSON numbers.");
  }
  return parsed;
}

export function parseExperimentPatch(body: unknown): ExperimentPatch {
  const jsonDomainIssue = inspectJsonDomain(body);
  if (jsonDomainIssue === "invalid_shape") {
    return invalidBody("PATCH body must contain only JSON values.");
  }
  const changes = parsePatchEnvelope(body);
  const parsed: ExperimentPatch = {};

  for (const [field, value] of Object.entries(changes)) {
    validateFieldName(
      field,
      EXPERIMENT_WRITABLE_FIELDS,
      EXPERIMENT_PROTECTED_FIELDS,
    );
    switch (field) {
      case "name":
        if (typeof value !== "string") invalidField(field);
        parsed.name = value.trim();
        if (parsed.name.length < 1 || parsed.name.length > 200) {
          invalidField(field);
        }
        break;
      case "status":
        if (
          typeof value !== "string"
          || !EXPERIMENT_STATUSES.has(value as ExperimentStatus)
        ) {
          invalidField(field);
        }
        parsed.status = value as ExperimentStatus;
        break;
      case "baseline_experiment_id":
        if (value !== null && !isUuid(value)) invalidField(field);
        parsed.baseline_experiment_id = value;
        break;
      case "data_spec":
        if (
          !isDataSpec(value)
          || !hasOnlyFields(value, DATA_SPEC_FIELDS)
          || !value.datasets.every(
            (dataset) => hasOnlyFields(dataset, DATASET_FIELDS),
          )
        ) {
          invalidField(field);
        }
        parsed.data_spec = cloneJsonField(field, value);
        break;
      case "object_spec":
        if (
          !isObjectSpec(value)
          || !hasOnlyFields(value, OBJECT_SPEC_FIELDS)
        ) {
          invalidField(field);
        }
        parsed.object_spec = cloneJsonField(field, value);
        break;
      case "environment_spec":
        if (
          !isEnvironmentSpec(value)
          || !hasOnlyFields(value, ENVIRONMENT_SPEC_FIELDS)
        ) {
          invalidField(field);
        }
        parsed.environment_spec = cloneJsonField(field, value);
        break;
      case "config":
        if (!isConfig(value)) invalidField(field);
        parsed.config = cloneJsonField(field, value);
        break;
      case "notes":
        if (typeof value !== "string") invalidField(field);
        parsed.notes = value;
        break;
      case "metrics":
        if (!isMetrics(value)) invalidField(field);
        parsed.metrics = cloneJsonField(field, value);
        break;
      case "featured_metric_keys":
        if (!isStringArray(value)) invalidField(field);
        parsed.featured_metric_keys = [...value];
        break;
      case "result_summary":
        if (typeof value !== "string") invalidField(field);
        parsed.result_summary = value;
        break;
      case "decision_outcome":
        if (
          value !== null
          && (
            typeof value !== "string"
            || !DECISION_OUTCOMES.has(value as DecisionOutcome)
          )
        ) {
          invalidField(field);
        }
        parsed.decision_outcome = value as DecisionOutcome | null;
        break;
      case "decision_notes":
        if (typeof value !== "string") invalidField(field);
        parsed.decision_notes = value;
        break;
      case "position":
        if (typeof value !== "number" || !Number.isFinite(value)) {
          invalidField(field);
        }
        parsed.position = value;
        break;
    }
  }
  if (jsonDomainIssue !== null) {
    return invalidBody("PATCH body must contain only finite JSON numbers.");
  }
  return parsed;
}

export function parseExperimentCreate(body: unknown): ExperimentCreate {
  const jsonDomainIssue = inspectJsonDomain(body);
  if (jsonDomainIssue === "invalid_shape") {
    return invalidBody(
      "Experiment create body must contain only JSON values.",
    );
  }
  if (!isRecord(body)) {
    return invalidBody("Experiment create body must be a JSON object.");
  }

  for (const field of Object.keys(body)) {
    if (field === "name") continue;
    if (EXPERIMENT_DECLARED_FIELDS.has(field)) {
      throw new AgentApiError(
        422,
        "FIELD_NOT_WRITABLE",
        `${field} cannot be set when creating an Experiment.`,
        false,
        { field },
      );
    }
    throw new AgentApiError(
      422,
      "UNKNOWN_FIELD",
      `${field} is not a recognized field.`,
      false,
      { field },
    );
  }

  if (Object.keys(body).length !== 1 || typeof body.name !== "string") {
    return invalidField("name");
  }
  const name = body.name.trim();
  if (name.length < 1 || name.length > 200) {
    return invalidField("name");
  }
  if (jsonDomainIssue !== null) {
    return invalidBody(
      "Experiment create body must contain only finite JSON numbers.",
    );
  }
  return { name };
}

export function parseActivityCreate(body: unknown): ActivityCreate {
  const jsonDomainIssue = inspectJsonDomain(body);
  if (jsonDomainIssue !== null || !isRecord(body)) {
    return invalidBody("Activity create body must be a JSON object.");
  }
  for (const field of Object.keys(body)) {
    if (field === "text") continue;
    validateFieldName(field, new Set(["text"]), ACTIVITY_PROTECTED_FIELDS);
  }
  if (Object.keys(body).length !== 1 || typeof body.text !== "string") {
    return invalidField("text");
  }
  const text = body.text.trim();
  if (text.length < 1 || text.length > 10_000) {
    return invalidField("text");
  }
  return { text };
}

export function parseAttachmentPatch(body: unknown): AttachmentPatch {
  const jsonDomainIssue = inspectJsonDomain(body);
  if (jsonDomainIssue !== null) {
    return invalidBody("Attachment PATCH body must contain only JSON values.");
  }
  const changes = parsePatchEnvelope(body);
  for (const field of Object.keys(changes)) {
    validateFieldName(
      field,
      new Set(["caption"]),
      ATTACHMENT_PROTECTED_FIELDS,
    );
  }
  if (
    Object.keys(changes).length !== 1
    || typeof changes.caption !== "string"
  ) {
    return invalidField("caption");
  }
  return { caption: changes.caption.trim() };
}

export function parseAttachmentFormData(
  form: FormData,
): AttachmentFormInput {
  const values = new Map<string, FormDataEntryValue[]>();
  for (const [field, value] of form.entries()) {
    if (field !== "file" && field !== "caption") {
      validateFieldName(
        field,
        new Set(["file", "caption"]),
        ATTACHMENT_PROTECTED_FIELDS,
      );
    }
    const entries = values.get(field) ?? [];
    entries.push(value);
    values.set(field, entries);
  }

  const files = values.get("file") ?? [];
  const captions = values.get("caption") ?? [];
  if (
    files.length !== 1
    || !isFileValue(files[0])
    || captions.length > 1
    || (captions.length === 1 && typeof captions[0] !== "string")
  ) {
    return invalidField(files.length !== 1 ? "file" : "caption");
  }

  const attachmentFile = files[0];
  const extension = ATTACHMENT_MIME_EXTENSIONS.get(
    attachmentFile.type as AttachmentFormInput["mime"],
  );
  if (
    extension === undefined
    || attachmentFile.size < 1
    || attachmentFile.size > MAX_ATTACHMENT_BYTES
  ) {
    return invalidField("file");
  }
  return {
    file: attachmentFile,
    caption: captions.length === 0
      ? ""
      : (captions[0] as string).trim(),
    mime: attachmentFile.type as AttachmentFormInput["mime"],
    extension,
  };
}
