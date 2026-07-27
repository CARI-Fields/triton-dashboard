import type {
  Module,
  NewTaskInput,
  Task,
  TaskModel,
  TaskPatch,
  TaskType,
} from "@/lib/types";

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags.flatMap((tag) => {
    const trimmed = tag.trim();
    const key = trimmed.toLocaleLowerCase();
    if (!trimmed || seen.has(key)) return [];
    seen.add(key);
    return [trimmed];
  });
}

export function tagTone(tag: string): number {
  let hash = 2166136261;
  for (const character of tag.trim().toLocaleLowerCase()) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 6;
}

export function taskFromStorage(row: Task): TaskModel {
  return {
    id: row.id,
    typeId: row.module_id,
    title: row.title,
    status: row.status,
    owners: [...row.assignees],
    notes: row.notes,
    tags: normalizeTags(row.tags),
    priority: row.priority,
    dueDate: row.due_date,
    position: row.position,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function taskPatchToStorage(
  patch: TaskPatch,
): Record<string, unknown> {
  const storage: Record<string, unknown> = {};
  if ("typeId" in patch) storage.module_id = patch.typeId;
  if ("title" in patch) storage.title = patch.title;
  if ("status" in patch) storage.status = patch.status;
  if ("owners" in patch) storage.assignees = patch.owners;
  if ("notes" in patch) storage.notes = patch.notes;
  if ("tags" in patch) storage.tags = normalizeTags(patch.tags ?? []);
  if ("priority" in patch) storage.priority = patch.priority;
  if ("dueDate" in patch) storage.due_date = patch.dueDate;
  if ("position" in patch) storage.position = patch.position;
  return storage;
}

export function newTaskToStorage(
  input: NewTaskInput,
  position: number,
): Record<string, unknown> {
  return {
    module_id: input.typeId,
    title: input.title.trim(),
    status: input.status,
    assignees: input.owners,
    notes: input.description.trim(),
    tags: normalizeTags(input.tags),
    priority: input.priority,
    due_date: input.dueDate,
    position,
  };
}

export function taskTypeFromStorage(row: Module): TaskType {
  return {
    id: row.id,
    name: row.name,
    description: row.objective,
    position: row.position,
    created_at: row.created_at,
  };
}

export function taskTypePatchToStorage(
  patch: Partial<Pick<TaskType, "name" | "description" | "position">>,
): Record<string, unknown> {
  const storage: Record<string, unknown> = {};
  if ("name" in patch) storage.name = patch.name;
  if ("description" in patch) storage.objective = patch.description;
  if ("position" in patch) storage.position = patch.position;
  return storage;
}
