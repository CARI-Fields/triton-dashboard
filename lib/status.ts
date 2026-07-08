import type { Status } from "@/lib/types";

export const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "blocked", label: "Blocked" },
];

export function statusLabel(s: Status): string {
  return STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;
}

export function nextStatus(s: Status): Status {
  const order = STATUS_OPTIONS.map((o) => o.value);
  return order[(order.indexOf(s) + 1) % order.length];
}
