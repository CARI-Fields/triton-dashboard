import Board from "@/components/Board";
import AuthGate from "@/components/AuthGate";

export default function Home() {
  return (
    <AuthGate>
      <Board />
    </AuthGate>
  );
}
