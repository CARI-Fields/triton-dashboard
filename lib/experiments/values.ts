import { supabase } from "@/lib/supabase";
import type {
  ExperimentValue,
  ExperimentValueOption,
  TemplateValueType,
} from "@/lib/types";
import type { Attachment } from "@/lib/types";
import { typedValueFromRow } from "@/lib/experiments/values-internal";

export type TypedValue =
  | { kind: "short_text"; text: string }
  | { kind: "long_text"; text: string }
  | { kind: "number"; number: number }
  | { kind: "boolean"; boolean: boolean }
  | { kind: "date_time"; datetime: string }
  | { kind: "url"; url: string }
  | { kind: "single_select"; optionId: string }
  | { kind: "multi_select"; optionIds: string[] }
  | { kind: "attachment"; attachmentIds: string[] };

export type SaveValueResult =
  | { status: "ok"; cell_revision: number; version_no: number }
  | {
    status: "conflict";
    remote: unknown;
    remote_cell_revision: number;
  };

export interface SaveValueInput {
  experimentId: string;
  keyId: string;
  expectedCellRevision: number;
  value: TypedValue | null;
  editSessionId: string;
}

export interface ExperimentValueMap {
  get(keyId: string): {
    value: TypedValue | null;
    cellRevision: number;
  } | undefined;
}

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function serializeValue(value: TypedValue | null): unknown {
  if (!value) return null;
  switch (value.kind) {
    case "short_text":
    case "long_text":
      return value.text;
    case "number":
      return value.number;
    case "boolean":
      return value.boolean;
    case "date_time":
      return value.datetime;
    case "url":
      return value.url;
    case "single_select":
      return value.optionId;
    case "multi_select":
      return value.optionIds;
    case "attachment":
      return value.attachmentIds;
  }
}

export async function saveValue(
  input: SaveValueInput,
): Promise<SaveValueResult> {
  const { data, error } = await client().rpc("save_experiment_value", {
    p_experiment_id: input.experimentId,
    p_key_id: input.keyId,
    p_expected_cell_revision: input.expectedCellRevision,
    p_value: serializeValue(input.value),
    p_edit_session_id: input.editSessionId,
  });
  throwIfError(error);
  return data as SaveValueResult;
}

export async function syncAttachmentValue(
  experimentId: string,
  keyId: string,
  activeAttachmentIds: string[],
  editSessionId: string,
): Promise<SaveValueResult> {
  const { data, error } = await client().rpc("sync_experiment_attachment_value", {
    p_experiment_id: experimentId,
    p_key_id: keyId,
    p_active_attachment_ids: activeAttachmentIds,
    p_edit_session_id: editSessionId,
  });
  throwIfError(error);
  return data as SaveValueResult;
}

export async function saveExperimentCore(
  experimentId: string,
  input: { name: string; ownerId: string | null; status: string },
  editSessionId: string,
): Promise<{ status: "ok"; version_no: number; core_revision: number }> {
  const { data, error } = await client().rpc("save_experiment_core", {
    p_experiment_id: experimentId,
    p_name: input.name,
    p_owner_id: input.ownerId,
    p_status: input.status,
    p_edit_session_id: editSessionId,
  });
  throwIfError(error);
  return data;
}

export async function archiveExperiment(
  experimentId: string,
): Promise<{ status: "ok"; version_no: number }> {
  const { data, error } = await client().rpc("archive_experiment", {
    p_experiment_id: experimentId,
  });
  throwIfError(error);
  return data;
}

export async function unarchiveExperiment(
  experimentId: string,
): Promise<{ status: "ok"; version_no: number }> {
  const { data, error } = await client().rpc("unarchive_experiment", {
    p_experiment_id: experimentId,
  });
  throwIfError(error);
  return data;
}

export async function restoreExperimentVersion(
  experimentId: string,
  versionNo: number,
): Promise<{ status: "ok"; version_no: number; core_revision: number }> {
  const { data, error } = await client().rpc("restore_experiment_version", {
    p_experiment_id: experimentId,
    p_version_no: versionNo,
  });
  throwIfError(error);
  return data;
}

export interface ExperimentVersionSummary {
  id: string;
  version_no: number;
  reason: string;
  source: string;
  edit_session_id: string | null;
  template_schema_revision: number;
  created_at: string;
}

export async function listExperimentVersions(
  experimentId: string,
): Promise<ExperimentVersionSummary[]> {
  const { data, error } = await client()
    .from("experiment_versions")
    .select(
      "id,version_no,reason,source,edit_session_id,template_schema_revision,created_at",
    )
    .eq("experiment_id", experimentId)
    .order("version_no", { ascending: false });
  throwIfError(error);
  return (data ?? []) as ExperimentVersionSummary[];
}

export interface DuplicateTemplateInput {
  sourceId: string;
  name: string;
  ownerId: string | null;
  position: number;
  keyIds: string[];
  editSessionId: string;
}

export async function duplicateTemplateExperiment(
  input: DuplicateTemplateInput,
): Promise<{ id: string; name: string }> {
  const { data, error } = await client().rpc("duplicate_experiment", {
    p_source_id: input.sourceId,
    p_name: input.name,
    p_owner_id: input.ownerId,
    p_position: input.position,
    p_key_ids: input.keyIds,
    p_edit_session_id: input.editSessionId,
  });
  throwIfError(error);
  return data;
}

export async function loadExperimentValues(
  experimentId: string,
): Promise<Map<string, { value: TypedValue | null; cellRevision: number }>> {
  const c = client();
  const [values, valueOptions, attachments] = await Promise.all([
    c.from("experiment_values")
      .select("*,template_key:experiment_template_keys(value_type)")
      .eq("experiment_id", experimentId),
    c.from("experiment_value_options")
      .select("key_id,option_id,position")
      .eq("experiment_id", experimentId)
      .order("position"),
    c.from("attachments")
      .select("*")
      .eq("experiment_id", experimentId)
      .not("template_key_id", "is", null)
      .is("archived_at", null),
  ]);
  throwIfError(values.error);
  throwIfError(valueOptions.error);
  throwIfError(attachments.error);

  const optionsByKey = new Map<string, string[]>();
  for (const row of (valueOptions.data ?? []) as ExperimentValueOption[]) {
    const group = optionsByKey.get(row.key_id) ?? [];
    group.push(row.option_id);
    optionsByKey.set(row.key_id, group);
  }
  const attachmentsByKey = new Map<string, string[]>();
  for (const row of (attachments.data ?? []) as Attachment[]) {
    if (!row.template_key_id) continue;
    const group = attachmentsByKey.get(row.template_key_id) ?? [];
    group.push(row.id);
    attachmentsByKey.set(row.template_key_id, group);
  }

  const map = new Map<string, { value: TypedValue | null; cellRevision: number }>();
  for (const row of (values.data ?? []) as Array<ExperimentValue & {
    template_key?: { value_type: TemplateValueType };
  }>) {
    const type = row.template_key?.value_type ?? "short_text";
    map.set(row.key_id, {
      value: typedValueFromRow(
        row,
        type,
        optionsByKey.get(row.key_id) ?? [],
        attachmentsByKey.get(row.key_id) ?? [],
      ),
      cellRevision: row.cell_revision,
    });
  }
  return map;
}

export function createEditSessionId(): string {
  return crypto.randomUUID();
}

export interface EditSessionClock {
  id: string;
  lastMutationAt: number;
}

export function touchEditSession(session: EditSessionClock, now = Date.now()): string {
  if (now - session.lastMutationAt > 5 * 60 * 1000) {
    session.id = createEditSessionId();
  }
  session.lastMutationAt = now;
  return session.id;
}
