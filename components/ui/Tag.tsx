// components/ui/Tag.tsx
"use client";

import { Tag as BPTag, type Intent, type TagProps } from "@blueprintjs/core";
import type { ReactNode } from "react";
import type { Status, ExperimentStatus, DecisionOutcome } from "@/lib/types";

export function Tag({ children, ...rest }: { children: ReactNode } & TagProps) {
  return <BPTag {...rest}>{children}</BPTag>;
}

export function StatusTag({ intent, children }: { intent: Intent; children: ReactNode }) {
  return (
    <BPTag minimal intent={intent}>
      {children}
    </BPTag>
  );
}

const TASK_STATUS_CLASS: Record<Status, string> = {
  todo: "todo",
  in_progress: "in_progress",
  done: "done",
  blocked: "blocked",
};

export function StatusDot({ status }: { status: Status }) {
  return <span className={`dot ${TASK_STATUS_CLASS[status]}`} aria-hidden />;
}

export function taskStatusIntent(s: Status): Intent {
  return s === "in_progress"
    ? "primary"
    : s === "done"
      ? "success"
      : s === "blocked"
        ? "danger"
        : "none";
}

export function experimentStatusIntent(s: ExperimentStatus): Intent {
  switch (s) {
    case "running":
      return "primary";
    case "analyzing":
      return "warning";
    case "completed":
      return "success";
    case "blocked":
      return "danger";
    default:
      return "none";
  }
}

export function decisionIntent(d: DecisionOutcome): Intent {
  return d === "accepted"
    ? "success"
    : d === "rejected"
      ? "danger"
      : d === "inconclusive"
        ? "warning"
        : "none";
}
