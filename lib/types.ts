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

export type DecisionOutcome =
  | "reference"
  | "accepted"
  | "rejected"
  | "inconclusive";

export type DatasetRole = "training" | "evaluation";

export interface DatasetSpec {
  role: DatasetRole;
  name: string;
  split: string;
  revision: string;
  task_count: number | null;
  samples_per_task: number | null;
}

export interface DataSpec {
  datasets: DatasetSpec[];
}

export interface ObjectSpec {
  model: string;
  harness: string;
  parent_harness: string;
  prompt: string;
  prompt_change: string;
  skills: string[];
  tools: string[];
}

export interface EnvironmentSpec {
  platform: "npu" | "gpu" | "";
  server: string;
  devices: string[];
  hardware: string;
  evaluator: string;
  revision: string;
  precision_policy: string;
}

export type ConfigValue = string | number | boolean | null;
export type ExperimentConfig = Record<string, ConfigValue>;

export interface Experiment {
  id: string;
  experiment_no: number;
  task_id: string;
  owner_id: string | null;
  name: string;
  status: ExperimentStatus;
  baseline_experiment_id: string | null;
  data_spec: DataSpec;
  object_spec: ObjectSpec;
  environment_spec: EnvironmentSpec;
  config: ExperimentConfig;
  notes: string;
  metrics: Record<string, number>;
  featured_metric_keys: string[];
  result_summary: string;
  decision_outcome: DecisionOutcome | null;
  decision_notes: string;
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
