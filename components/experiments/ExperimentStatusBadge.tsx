import type { ExperimentStatus } from "@/lib/types";
import { EXPERIMENT_STATUS_LABELS } from "@/lib/experiments/policy";

export default function ExperimentStatusBadge({
  status,
}: {
  status: ExperimentStatus;
}) {
  return (
    <span className={`experiment-status experiment-status-${status}`}>
      {EXPERIMENT_STATUS_LABELS[status]}
    </span>
  );
}
