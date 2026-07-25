import AuthGate from "@/components/AuthGate";
import ExperimentDetail from "@/components/experiments/ExperimentDetail";

export default async function ExperimentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AuthGate>
      <ExperimentDetail id={id} />
    </AuthGate>
  );
}
