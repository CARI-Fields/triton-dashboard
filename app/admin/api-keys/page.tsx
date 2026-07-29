import AuthGate from "@/components/AuthGate";
import ApiKeyAdmin from "@/components/admin/ApiKeyAdmin";

export default function ApiKeysPage() {
  return (
    <AuthGate>
      <ApiKeyAdmin />
    </AuthGate>
  );
}
