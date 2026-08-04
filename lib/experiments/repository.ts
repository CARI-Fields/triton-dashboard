import { supabase } from "@/lib/supabase";
import {
  deleteAttachment,
  updateAttachmentCaption,
  uploadAttachment,
} from "@/lib/attachments/repository";
import type {
  Activity,
  Attachment,
  Experiment,
  ExperimentListRow,
  Member,
  Task,
} from "@/lib/types";
import {
  normalizeTaskRow,
  TASK_WITH_ASSIGNEES_SELECT,
  type TaskRelationRow,
} from "@/lib/tasks/assignees";
import {
  buildDuplicateInsert,
  type DuplicateInput,
  type ExperimentInsert,
} from "@/lib/experiments/policy";

export interface NewExperimentInput {
  taskId: string;
  templateId: string;
  name: string;
  ownerId: string;
}

export interface DuplicateExperimentInput {
  name: string;
  ownerId: string;
}

export interface ExperimentBundle {
  experiment: Experiment;
  task: ExperimentListRow["task"];
  owner: Member | null;
  members: Member[];
  attachments: Attachment[];
  activity: Activity[];
}

export interface ExperimentReferenceData {
  tasks: Task[];
  members: Member[];
}

type JoinedExperiment = Experiment & {
  task: ExperimentListRow["task"];
  owner: Member | null;
};

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function requiredValue(value: string, message: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(message);
  return trimmed;
}

const MEMBER_SELECT = "id,name,initials,position,created_at";
const LIST_SELECT = [
  "*",
  "task:tasks(id,title)",
  `owner:members(${MEMBER_SELECT})`,
].join(",");
const BUNDLE_SELECT = [
  LIST_SELECT,
].join(",");

function normalizeExperiment(row: Experiment): Experiment {
  return row;
}

function normalizeJoined(row: JoinedExperiment): ExperimentListRow {
  return {
    ...normalizeExperiment(row),
    task: row.task,
    owner: row.owner,
  };
}

export async function listExperimentRows(): Promise<ExperimentListRow[]> {
  const { data, error } = await client()
    .from("experiments")
    .select(LIST_SELECT)
    .order("updated_at", { ascending: false });
  throwIfError(error);
  return ((data ?? []) as unknown as JoinedExperiment[]).map(normalizeJoined);
}

export async function loadExperimentReferenceData(): Promise<ExperimentReferenceData> {
  const [tasksResult, membersResult] = await Promise.all([
    client()
      .from("tasks")
      .select(TASK_WITH_ASSIGNEES_SELECT)
      .order("position"),
    client().from("members").select("*").order("position"),
  ]);
  throwIfError(tasksResult.error);
  throwIfError(membersResult.error);
  return {
    tasks: ((tasksResult.data ?? []) as unknown as TaskRelationRow[])
      .map(normalizeTaskRow),
    members: (membersResult.data ?? []) as Member[],
  };
}

async function nextPosition(taskId: string): Promise<number> {
  const { data, error } = await client()
    .from("experiments")
    .select("position")
    .eq("task_id", taskId)
    .order("position", { ascending: false })
    .order("experiment_no", { ascending: false })
    .limit(1);
  throwIfError(error);
  return data?.length ? Number(data[0].position) + 1 : 0;
}

export async function nextExperimentPosition(taskId: string): Promise<number> {
  return nextPosition(taskId);
}

export async function createExperiment(
  input: NewExperimentInput,
): Promise<Experiment> {
  const taskId = requiredValue(input.taskId, "Task is required.");
  const templateId = requiredValue(input.templateId, "Template is required.");
  const name = requiredValue(input.name, "Experiment name is required.");
  const ownerId = requiredValue(input.ownerId, "Experiment owner is required.");
  const position = await nextPosition(taskId);
  const insert: ExperimentInsert = {
    task_id: taskId,
    template_id: templateId,
    owner_id: ownerId,
    name,
    status: "planned",
    position,
  };
  const { data, error } = await client()
    .from("experiments")
    .insert(insert)
    .select("*")
    .single();
  throwIfError(error);
  return normalizeExperiment(data as Experiment);
}

export async function duplicateExperiment(
  source: Experiment,
  input: DuplicateExperimentInput,
): Promise<Experiment> {
  const name = requiredValue(input.name, "Experiment name is required.");
  const ownerId = requiredValue(input.ownerId, "Experiment owner is required.");
  const duplicateInput: DuplicateInput = {
    name,
    ownerId,
    position: await nextPosition(source.task_id),
  };
  const { data, error } = await client()
    .from("experiments")
    .insert(buildDuplicateInsert(source, duplicateInput))
    .select("*")
    .single();
  throwIfError(error);
  return normalizeExperiment(data as Experiment);
}

export async function loadExperimentBundle(
  id: string,
): Promise<ExperimentBundle | null> {
  const { data, error } = await client()
    .from("experiments")
    .select(BUNDLE_SELECT)
    .eq("id", id)
    .maybeSingle();
  throwIfError(error);
  if (!data) return null;
  const row = normalizeJoined(data as unknown as JoinedExperiment);
  const [membersResult, attachmentsResult, activityResult] =
    await Promise.all([
      client().from("members").select("*").order("position"),
      client()
        .from("attachments")
        .select("*")
        .eq("experiment_id", id)
        .order("position"),
      client()
        .from("activity")
        .select("*")
        .eq("experiment_id", id)
        .order("created_at", { ascending: false }),
    ]);
  throwIfError(membersResult.error);
  throwIfError(attachmentsResult.error);
  throwIfError(activityResult.error);
  return {
    experiment: row,
    task: row.task,
    owner: row.owner,
    members: (membersResult.data ?? []) as Member[],
    attachments: (attachmentsResult.data ?? []) as Attachment[],
    activity: (activityResult.data ?? []) as Activity[],
  };
}

export async function loadExperimentsForCompare(
  ids: string[],
): Promise<ExperimentListRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await client()
    .from("experiments")
    .select(LIST_SELECT)
    .in("id", ids);
  throwIfError(error);
  const rows = ((data ?? []) as unknown as JoinedExperiment[]).map(
    normalizeJoined,
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

export async function addExperimentTimelineNote(
  experiment: Experiment,
  text: string,
): Promise<void> {
  const { error } = await client().from("activity").insert({
    task_id: experiment.task_id,
    experiment_id: experiment.id,
    text: text.trim(),
    kind: "comment",
  });
  throwIfError(error);
}

export async function deleteExperiment(experiment: Experiment): Promise<void> {
  const { data: attachments, error: attachmentError } = await client()
    .from("attachments")
    .select("path")
    .eq("experiment_id", experiment.id);
  throwIfError(attachmentError);
  const { error } = await client()
    .from("experiments")
    .delete()
    .eq("id", experiment.id);
  throwIfError(error);
  const paths = (attachments ?? [])
    .map((attachment) => attachment.path)
    .filter((path): path is string => Boolean(path));
  if (paths.length > 0) {
    const removal = await client().storage.from("task-images").remove(paths);
    if (removal.error) {
      throw new Error(
        `Experiment was deleted, but Storage cleanup failed: ${removal.error.message}`,
      );
    }
  }
}

export async function uploadExperimentAttachment(
  experiment: Experiment,
  file: File,
  position: number,
): Promise<void> {
  return uploadAttachment(
    { taskId: experiment.task_id, experimentId: experiment.id },
    file,
    position,
  );
}

export const updateExperimentAttachment = updateAttachmentCaption;
export const deleteExperimentAttachment = deleteAttachment;

export function watchExperiment(
  id: string,
  onExperimentChange: () => void,
  onRelatedChange: () => void,
): () => void {
  if (!supabase) return () => undefined;
  const supabaseClient = supabase;
  const channel = supabaseClient
    .channel(`experiment-detail-${id}-${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "experiments" },
      (payload) => {
        const changedId =
          (payload.new as { id?: string } | null)?.id ??
          (payload.old as { id?: string } | null)?.id;
        if (changedId === id) onExperimentChange();
        else onRelatedChange();
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "activity",
        filter: `experiment_id=eq.${id}`,
      },
      onRelatedChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "attachments",
        filter: `experiment_id=eq.${id}`,
      },
      onRelatedChange,
    )
    .subscribe();
  return () => {
    void supabaseClient.removeChannel(channel);
  };
}

export function watchExperimentIndex(onChange: () => void): () => void {
  if (!supabase) return () => undefined;
  const supabaseClient = supabase;
  const channel = supabaseClient
    .channel(`experiment-index-${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "experiments" },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tasks" },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "task_assignees" },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "members" },
      onChange,
    )
    .subscribe();
  return () => {
    void supabaseClient.removeChannel(channel);
  };
}
