import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthGate, { useAuthActions } from "@/components/AuthGate";

const mockAuth = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: Session | null) => void),
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

const SESSION = {
  access_token: "test-access-token",
  refresh_token: "test-refresh-token",
  expires_in: 3600,
  expires_at: 1_785_380_400,
  token_type: "bearer",
  user: {
    id: "10000000-0000-4000-8000-000000000001",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    email: "team@example.test",
    created_at: "2026-07-29T12:00:00.000Z",
  },
} satisfies Session;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("AuthGate", () => {
  beforeEach(() => {
    mockAuth.listener = null;
    mockAuth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockAuth.onAuthStateChange.mockImplementation((listener) => {
      mockAuth.listener = listener;
      return {
        data: { subscription: { unsubscribe: mockAuth.unsubscribe } },
      };
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
      data: { session: SESSION },
      error: null,
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

  it("shows a safe retryable boundary when initial session verification fails", async () => {
    mockAuth.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: new Error("token-native-marker"),
    });

    render(
      <AuthGate>
        <div data-testid="authenticated-shell">Shell</div>
      </AuthGate>,
    );

    expect(await screen.findByText(
      "Could not verify your session. Sign in again.",
    )).toBeDefined();
    expect(screen.queryByTestId("authenticated-shell")).toBeNull();
    expect(document.body.textContent).not.toContain("token-native-marker");
  });

  it("keeps a newer auth event authoritative over a late initial session", async () => {
    const initial = deferred<{
      data: { session: Session | null };
      error: Error | null;
    }>();
    mockAuth.getSession.mockReturnValueOnce(initial.promise);

    render(
      <AuthGate>
        <div data-testid="authenticated-shell">Shell</div>
      </AuthGate>,
    );
    expect(screen.getByText("Loading…")).toBeDefined();

    act(() => mockAuth.listener?.("SIGNED_IN", SESSION));
    expect(await screen.findByTestId("authenticated-shell")).toBeDefined();

    await act(async () => {
      initial.resolve({ data: { session: null }, error: null });
    });

    expect(screen.getByTestId("authenticated-shell")).toBeDefined();
    expect(screen.queryByText("Enter the team password")).toBeNull();
  });
});
