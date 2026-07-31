import { supabase } from "@/lib/supabase";
import type {
  ExperimentTemplate,
  TemplateField,
  TemplateKey,
  TemplateKeyOption,
  TemplateValueType,
} from "@/lib/types";

export interface TemplateOptionDraft {
  id: string | null;
  label: string;
  position: number;
  archived: boolean;
}

export interface TemplateKeyDraft {
  id: string | null;
  key: string;
  valueType: TemplateValueType;
  required: boolean;
  position: number;
  archived: boolean;
  options: TemplateOptionDraft[];
  valueCount: number;
}

export interface TemplateFieldDraft {
  id: string | null;
  label: string;
  colorToken: string;
  position: number;
  archived: boolean;
  keys: TemplateKeyDraft[];
}

export interface TemplateDraft {
  templateId: string;
  name: string;
  description: string;
  schemaRevision: number;
  fields: TemplateFieldDraft[];
}

export interface TemplateSummary {
  template: ExperimentTemplate;
  fieldCount: number;
  keyCount: number;
  experimentCount: number;
}

export interface SaveTemplateResult {
  template_id: string;
  schema_revision: number;
  version_no: number;
}

export interface TemplateVersionSummary {
  id: string;
  version_no: number;
  reason: string;
  source: string;
  schema_revision: number;
  created_at: string;
}

interface SnapshotFieldRow {
  id: string;
  label: string;
  color_token: string;
  position: number;
  archived_at: string | null;
  keys: Array<{
    id: string;
    key: string;
    value_type: TemplateValueType;
    required: boolean;
    position: number;
    archived_at: string | null;
    options: Array<{
      id: string;
      label: string;
      position: number;
      archived_at: string | null;
    }>;
  }>;
}

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function countBy(
  rows: Array<{ template_id: string | null; archived_at?: string | null }>,
  activeOnly: boolean,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.template_id) continue;
    if (activeOnly && row.archived_at !== null) continue;
    counts.set(row.template_id, (counts.get(row.template_id) ?? 0) + 1);
  }
  return counts;
}

export async function listTemplateSummaries(): Promise<TemplateSummary[]> {
  const c = client();
  const [templates, fields, keys, experiments] = await Promise.all([
    c.from("experiment_templates")
      .select("id,name,description,schema_revision,archived_at,created_at,updated_at")
      .order("name"),
    c.from("experiment_template_fields")
      .select("template_id,archived_at"),
    c.from("experiment_template_keys")
      .select("template_id,archived_at"),
    c.from("experiments")
      .select("template_id"),
  ]);
  throwIfError(templates.error);
  throwIfError(fields.error);
  throwIfError(keys.error);
  throwIfError(experiments.error);

  const fieldCounts = countBy(fields.data ?? [], true);
  const keyCounts = countBy(keys.data ?? [], true);
  const experimentCounts = countBy(experiments.data ?? [], false);

  return (templates.data ?? []).map((row) => ({
    template: row as ExperimentTemplate,
    fieldCount: fieldCounts.get(row.id) ?? 0,
    keyCount: keyCounts.get(row.id) ?? 0,
    experimentCount: experimentCounts.get(row.id) ?? 0,
  }));
}

function toDraft(
  template: ExperimentTemplate,
  fields: TemplateField[],
  keys: TemplateKey[],
  options: TemplateKeyOption[],
  valueCounts: Map<string, number>,
): TemplateDraft {
  const keysByField = new Map<string, TemplateKey[]>();
  for (const key of keys) {
    const group = keysByField.get(key.field_id) ?? [];
    group.push(key);
    keysByField.set(key.field_id, group);
  }
  const optionsByKey = new Map<string, TemplateKeyOption[]>();
  for (const option of options) {
    const group = optionsByKey.get(option.key_id) ?? [];
    group.push(option);
    optionsByKey.set(option.key_id, group);
  }
  return {
    templateId: template.id,
    name: template.name,
    description: template.description,
    schemaRevision: template.schema_revision,
    fields: fields.map((field) => ({
      id: field.id,
      label: field.label,
      colorToken: field.color_token,
      position: field.position,
      archived: false,
      keys: (keysByField.get(field.id) ?? []).map((key) => ({
        id: key.id,
        key: key.key,
        valueType: key.value_type,
        required: key.required,
        position: key.position,
        archived: false,
        options: (optionsByKey.get(key.id) ?? []).map((option) => ({
          id: option.id,
          label: option.label,
          position: option.position,
          archived: false,
        })),
        valueCount: valueCounts.get(key.id) ?? 0,
      })),
    })),
  };
}

export async function loadTemplateDraft(
  templateId: string,
): Promise<TemplateDraft | null> {
  const c = client();
  const [template, fields, keys, options, values] = await Promise.all([
    c.from("experiment_templates")
      .select("*")
      .eq("id", templateId)
      .maybeSingle(),
    c.from("experiment_template_fields")
      .select("*")
      .eq("template_id", templateId)
      .is("archived_at", null)
      .order("position"),
    c.from("experiment_template_keys")
      .select("*")
      .eq("template_id", templateId)
      .is("archived_at", null)
      .order("position"),
    c.from("experiment_template_key_options")
      .select("*")
      .eq("template_id", templateId)
      .is("archived_at", null)
      .order("position"),
    c.from("experiment_values")
      .select("key_id"),
  ]);
  throwIfError(template.error);
  throwIfError(fields.error);
  throwIfError(keys.error);
  throwIfError(options.error);
  throwIfError(values.error);
  if (!template.data) return null;

  const valueCounts = new Map<string, number>();
  for (const row of values.data ?? []) {
    if (!row.key_id) continue;
    valueCounts.set(row.key_id, (valueCounts.get(row.key_id) ?? 0) + 1);
  }

  return toDraft(
    template.data as ExperimentTemplate,
    (fields.data ?? []) as TemplateField[],
    (keys.data ?? []) as TemplateKey[],
    (options.data ?? []) as TemplateKeyOption[],
    valueCounts,
  );
}

function savePayload(draft: TemplateDraft): unknown[] {
  return draft.fields.map((field) => ({
    id: field.id,
    label: field.label,
    color_token: field.colorToken,
    position: field.position,
    archived: field.archived,
    keys: field.keys.map((key) => ({
      id: key.id,
      key: key.key,
      value_type: key.valueType,
      required: key.required,
      position: key.position,
      archived: key.archived,
      options: key.options.map((option) => ({
        id: option.id,
        label: option.label,
        position: option.position,
        archived: option.archived,
      })),
    })),
  }));
}

export async function saveTemplate(
  draft: TemplateDraft,
): Promise<SaveTemplateResult> {
  const { data, error } = await client().rpc("save_experiment_template", {
    p_template_id: draft.templateId,
    p_name: draft.name,
    p_description: draft.description,
    p_expected_schema_revision: draft.schemaRevision,
    p_fields: savePayload(draft),
  });
  throwIfError(error);
  return data as SaveTemplateResult;
}

export async function archiveTemplate(templateId: string): Promise<void> {
  const { error } = await client().rpc("archive_experiment_template", {
    p_template_id: templateId,
  });
  throwIfError(error);
}

export async function unarchiveTemplate(templateId: string): Promise<void> {
  const { error } = await client().rpc("unarchive_experiment_template", {
    p_template_id: templateId,
  });
  throwIfError(error);
}

export async function listTemplateVersions(
  templateId: string,
): Promise<TemplateVersionSummary[]> {
  const { data, error } = await client()
    .from("experiment_template_versions")
    .select("id,version_no,reason,source,schema_revision,created_at")
    .eq("template_id", templateId)
    .order("version_no", { ascending: false });
  throwIfError(error);
  return (data ?? []) as TemplateVersionSummary[];
}

function draftFromSnapshot(
  template: ExperimentTemplate,
  snapshot: SnapshotFieldRow[],
): TemplateDraft {
  return {
    templateId: template.id,
    name: template.name,
    description: template.description,
    schemaRevision: template.schema_revision,
    fields: snapshot
      .filter((field) => field.archived_at === null)
      .map((field) => ({
        id: field.id,
        label: field.label,
        colorToken: field.color_token,
        position: field.position,
        archived: false,
        keys: field.keys
          .filter((key) => key.archived_at === null)
          .map((key) => ({
            id: key.id,
            key: key.key,
            valueType: key.value_type,
            required: key.required,
            position: key.position,
            archived: false,
            options: key.options
              .filter((option) => option.archived_at === null)
              .map((option) => ({
                id: option.id,
                label: option.label,
                position: option.position,
                archived: false,
              })),
            valueCount: 0,
          })),
      })),
  };
}

export async function restoreTemplateVersion(
  templateId: string,
  versionNo: number,
): Promise<SaveTemplateResult> {
  const c = client();
  const [template, version] = await Promise.all([
    c.from("experiment_templates")
      .select("*")
      .eq("id", templateId)
      .maybeSingle(),
    c.from("experiment_template_versions")
      .select("snapshot")
      .eq("template_id", templateId)
      .eq("version_no", versionNo)
      .maybeSingle(),
  ]);
  throwIfError(template.error);
  throwIfError(version.error);
  if (!template.data || !version.data) {
    throw new Error("Template version not found.");
  }
  const draft = draftFromSnapshot(
    template.data as ExperimentTemplate,
    version.data.snapshot as SnapshotFieldRow[],
  );
  return saveTemplate(draft);
}
