export type Status = "todo" | "in_progress" | "done" | "blocked";

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
  module_id: string;
  title: string;
  status: Status;
  assignees: string[];
  notes: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Member {
  id: string;
  name: string;
  initials: string;
  position: number;
  created_at: string;
}

export interface Experiment {
  id: string;
  task_id: string;
  name: string;
  notes: string;
  metrics: Record<string, number>;
  position: number;
  created_at: string;
  updated_at: string;
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
  text: string;
  kind: ActivityKind;
  created_at: string;
}
