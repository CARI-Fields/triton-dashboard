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
  position: number;
  created_at: string;
}

export interface Member {
  id: string;
  name: string;
  initials: string;
  position: number;
  created_at: string;
}
