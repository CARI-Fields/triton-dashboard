export type Status = "todo" | "in_progress" | "done" | "blocked";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type ModuleKind = "pipeline" | "foundation";

export interface Module {
  id: string;
  name: string;
  kind: ModuleKind;
  objective: string;
  position: number;
  created_at: string;
}

export interface Task {
  id: string;
  module_id: string | null;
  title: string;
  status: Status;
  assignees: string[];
  notes: string;
  tags: string[];
  priority: TaskPriority;
  due_date: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface TaskType {
  id: string;
  name: string;
  description: string;
  position: number;
  created_at: string;
}

export interface TaskModel {
  id: string;
  typeId: string | null;
  title: string;
  status: Status;
  owners: string[];
  notes: string;
  tags: string[];
  priority: TaskPriority;
  dueDate: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export type TaskPatch = Partial<Pick<
  TaskModel,
  | "typeId"
  | "title"
  | "status"
  | "owners"
  | "notes"
  | "tags"
  | "priority"
  | "dueDate"
  | "position"
>>;

export interface NewTaskInput {
  title: string;
  status: Status;
  typeId: string | null;
  tags: string[];
  owners: string[];
  priority: TaskPriority;
  dueDate: string | null;
  description: string;
}

export interface Member {
  id: string;
  name: string;
  initials: string;
  position: number;
  created_at: string;
}

export type ExperimentStatus =
  | "planned"
  | "running"
  | "analyzing"
  | "completed"
  | "blocked"
  | "cancelled";

export type TemplateValueType =
  | "short_text"
  | "long_text"
  | "number"
  | "boolean"
  | "single_select"
  | "multi_select"
  | "date_time"
  | "url"
  | "attachment";

export interface ExperimentTemplate {
  id: string;
  name: string;
  description: string;
  schema_revision: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateField {
  id: string;
  template_id: string;
  label: string;
  color_token: string;
  position: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateKey {
  id: string;
  template_id: string;
  field_id: string;
  key: string;
  value_type: TemplateValueType;
  required: boolean;
  position: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateKeyOption {
  id: string;
  template_id: string;
  key_id: string;
  label: string;
  position: number;
  archived_at: string | null;
}

export interface ExperimentValue {
  experiment_id: string;
  template_id: string;
  key_id: string;
  text_value: string | null;
  number_value: number | null;
  boolean_value: boolean | null;
  datetime_value: string | null;
  option_id: string | null;
  cell_revision: number;
  created_at: string;
  updated_at: string;
}

export interface ExperimentValueOption {
  experiment_id: string;
  template_id: string;
  key_id: string;
  option_id: string;
  position: number;
}

export type VersionSource = "browser" | "agent" | "migration" | "system";

export interface ExperimentVersion {
  id: string;
  experiment_id: string;
  version_no: number;
  reason: string;
  source: VersionSource;
  edit_session_id: string | null;
  template_schema_revision: number;
  snapshot: unknown;
  actor_member_id: string | null;
  created_at: string;
}

export interface TemplateVersion {
  id: string;
  template_id: string;
  version_no: number;
  reason: string;
  source: VersionSource;
  schema_revision: number;
  snapshot: unknown;
  actor_member_id: string | null;
  created_at: string;
}

export interface Experiment {
  id: string;
  experiment_no: number;
  task_id: string;
  owner_id: string | null;
  name: string;
  status: ExperimentStatus;
  template_id: string | null;
  archived_at: string | null;
  core_revision: number;
  position: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExperimentListRow extends Experiment {
  task: Pick<Task, "id" | "title"> | null;
  owner: Member | null;
}

export interface Attachment {
  id: string;
  task_id: string;
  experiment_id: string | null;
  url: string;
  path: string;
  caption: string;
  position: number;
  template_key_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ActivityKind =
  | "create"
  | "status"
  | "assign"
  | "experiment"
  | "note"
  | "edit"
  | "comment";

export interface Activity {
  id: string;
  task_id: string;
  experiment_id: string | null;
  text: string;
  kind: ActivityKind;
  created_at: string;
}
