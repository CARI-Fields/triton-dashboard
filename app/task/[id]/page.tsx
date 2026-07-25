import AuthGate from "@/components/AuthGate";
import TaskDetail from "@/components/TaskDetail";

export default async function TaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AuthGate>
      <TaskDetail id={id} />
    </AuthGate>
  );
}
