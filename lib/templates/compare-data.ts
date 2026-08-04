import { supabase } from "@/lib/supabase";
import type {
  Attachment,
  Experiment,
  ExperimentValue,
  ExperimentValueOption,
  Member,
  Task,
  TemplateValueType,
} from "@/lib/types";
import { typedValueFromRow } from "@/lib/experiments/values-internal";
import type { CompareRow, CompareRowValue } from "@/lib/templates/compare";

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function loadTemplateCompareRows(
  templateId: string,
  includeArchived: boolean,
): Promise<CompareRow[]> {
  const c = client();
  let experimentsQuery = c
    .from("experiments")
    .select("*")
    .eq("template_id", templateId)
    .order("experiment_no");
  if (!includeArchived) {
    experimentsQuery = experimentsQuery.is("archived_at", null);
  }
  const [experiments, values, valueOptions, attachments, tasks, members] = await Promise.all([
    experimentsQuery,
    c.from("experiment_values")
      .select("*,template_key:experiment_template_keys(value_type)")
      .in("template_id", [templateId]),
    c.from("experiment_value_options")
      .select("experiment_id,key_id,option_id,position")
      .in("template_id", [templateId])
      .order("position"),
    c.from("attachments")
      .select("id,experiment_id,template_key_id,position,caption")
      .not("template_key_id", "is", null)
      .is("archived_at", null),
    c.from("tasks")
      .select("id,title"),
    c.from("members")
      .select("id,name"),
  ]);
  throwIfError(experiments.error);
  throwIfError(values.error);
  throwIfError(valueOptions.error);
  throwIfError(attachments.error);
  throwIfError(tasks.error);
  throwIfError(members.error);

  const taskTitles = new Map(
    (tasks.data ?? [] as Task[]).map((task) => [task.id, task.title]),
  );
  const ownerNames = new Map(
    (members.data ?? [] as Member[]).map((member) => [member.id, member.name]),
  );
  const optionsByCell = new Map<string, string[]>();
  for (const row of (valueOptions.data ?? []) as ExperimentValueOption[]) {
    const key = `${row.experiment_id}:${row.key_id}`;
    const group = optionsByCell.get(key) ?? [];
    group.push(row.option_id);
    optionsByCell.set(key, group);
  }
  const attachmentsByCell = new Map<string, string[]>();
  for (const row of (attachments.data ?? []) as Attachment[]) {
    if (!row.template_key_id) continue;
    const key = `${row.experiment_id}:${row.template_key_id}`;
    const group = attachmentsByCell.get(key) ?? [];
    group.push(row.id);
    attachmentsByCell.set(key, group);
  }

  const rows = new Map<string, CompareRow>();
  for (const row of (experiments.data ?? []) as Experiment[]) {
    rows.set(row.id, {
      experimentId: row.id,
      experimentNo: row.experiment_no,
      name: row.name,
      taskTitle: row.task_id ? taskTitles.get(row.task_id) ?? null : null,
      ownerName: row.owner_id ? ownerNames.get(row.owner_id) ?? null : null,
      status: row.status,
      archivedAt: row.archived_at,
      values: new Map<string, CompareRowValue>(),
    });
  }

  for (const row of (values.data ?? []) as Array<ExperimentValue & {
    template_key?: { value_type: TemplateValueType };
  }>) {
    const compareRow = rows.get(row.experiment_id);
    if (!compareRow) continue;
    const type = row.template_key?.value_type ?? "short_text";
    const value = typedValueFromRow(
      row,
      type,
      optionsByCell.get(`${row.experiment_id}:${row.key_id}`) ?? [],
      attachmentsByCell.get(`${row.experiment_id}:${row.key_id}`) ?? [],
    );
    compareRow.values.set(row.key_id, { value, cellRevision: row.cell_revision });
  }

  return [...rows.values()];
}
