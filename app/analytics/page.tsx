import Analytics from "@/components/Analytics";
import AuthGate from "@/components/AuthGate";

export default function AnalyticsPage() {
  return (
    <AuthGate>
      <Analytics />
    </AuthGate>
  );
}
