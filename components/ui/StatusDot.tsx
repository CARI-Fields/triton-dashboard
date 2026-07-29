import type { ExperimentStatus, Status as TaskStatus } from "@/lib/types";

export interface StatusDotProps {
  status: TaskStatus | ExperimentStatus;
  label: string;
}

export default function StatusDot({ status, label }: StatusDotProps) {
  return (
    <span className={`status-dot status-${status}`}>
      <i aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
