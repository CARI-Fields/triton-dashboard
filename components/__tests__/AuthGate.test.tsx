import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthGate, { useAuthActions } from "@/components/AuthGate";

const mockAuth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: mockAuth.getSession,
      onAuthStateChange: mockAuth.onAuthStateChange,
      signInWithPassword: mockAuth.signInWithPassword,
      signOut: mockAuth.signOut,
    },
  },
}));

function AuthenticatedShell() {
  const { logout } = useAuthActions();

  return (
    <button type="button" onClick={() => void logout()}>
      Log out through shell
    </button>
  );
}

describe("AuthGate", () => {
  beforeEach(() => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null } });
    mockAuth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockAuth.unsubscribe } },
    });
    mockAuth.signInWithPassword.mockResolvedValue({ error: null });
    mockAuth.signOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("keeps the authenticated shell hidden behind one session boundary", async () => {
    render(
      <AuthGate>
        <div data-testid="authenticated-shell">Shell</div>
      </AuthGate>,
    );

    expect(screen.queryByTestId("authenticated-shell")).toBeNull();
    expect(
      await screen.findByRole("heading", { name: "Enter the team password" }),
    ).toBeDefined();
    expect(mockAuth.onAuthStateChange).toHaveBeenCalledOnce();
  });

  it("provides the existing logout action to authenticated shell controls", async () => {
    mockAuth.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "test-access-token",
          refresh_token: "test-refresh-token",
        },
      },
    });

    render(
      <AuthGate>
        <AuthenticatedShell />
      </AuthGate>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Log out through shell" }),
    );

    await waitFor(() => expect(mockAuth.signOut).toHaveBeenCalledOnce());
  });
});
