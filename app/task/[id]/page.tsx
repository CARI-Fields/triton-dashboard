"use client";

import { useParams } from "next/navigation";
import TaskDetail from "@/components/TaskDetail";
import AuthGate from "@/components/AuthGate";

export default function TaskPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  return (
    <AuthGate>
      <TaskDetail id={id ?? ""} />
    </AuthGate>
  );
}
