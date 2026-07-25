import AuthGate from "@/components/AuthGate";
import ExperimentsDatabase from "@/components/experiments/ExperimentsDatabase";

export default function ExperimentsPage() {
  return (
    <AuthGate>
      <ExperimentsDatabase />
    </AuthGate>
  );
}
