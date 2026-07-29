import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import AuthGate from "@/components/AuthGate";

const mocks = vi.hoisted(() => ({
  authListener: null as null | ((event: string, session: unknown) => void),
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
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
    },
  },
}));

const SESSION: Session = {
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
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, reject, resolve };
}

function emitAuth(event: string, session: Session | null) {
  if (!mocks.authListener) throw new Error("Auth listener was not registered.");
  act(() => mocks.authListener?.(event, session));
}

function renderGate() {
  return render(
    <AuthGate>
      <p>Protected child</p>
    </AuthGate>,
  );
}

describe("AuthGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authListener = null;
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mocks.onAuthStateChange.mockImplementation((listener) => {
      mocks.authListener = listener;
      return {
        data: {
          subscription: { unsubscribe: mocks.unsubscribe },
        },
      };
    });
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: SESSION, user: SESSION.user },
      error: null,
    });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each([
    {
      name: "a synchronous throw",
      arrange: () => mocks.getSession.mockImplementationOnce(() => {
        throw new Error("token-native-marker synchronous failure");
      }),
    },
    {
      name: "a rejected promise",
      arrange: () => mocks.getSession.mockRejectedValueOnce(
        new Error("token-native-marker rejected failure"),
      ),
    },
    {
      name: "a resolved Auth error",
      arrange: () => mocks.getSession.mockResolvedValueOnce({
        data: { session: null },
        error: new Error("token-native-marker resolved failure"),
      }),
    },
  ])("safely finishes initial loading after $name", async ({ arrange }) => {
    arrange();
    renderGate();

    expect(await screen.findByText(
      "Could not verify your session. Sign in again.",
    )).toBeDefined();
    expect(screen.queryByText("Loading…")).toBeNull();
    expect(screen.queryByText("Protected child")).toBeNull();
    expect(document.body.textContent).not.toContain("token-native-marker");
  });

  it("renders its real child after a valid initial session", async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: { session: SESSION },
      error: null,
    });

    renderGate();

    expect(await screen.findByText("Protected child")).toBeDefined();
    expect(screen.queryByText("Enter the team password")).toBeNull();
  });

  it.each(["resolve", "reject"])(
    "ignores a late initial session %s after unmount",
    async (outcome) => {
      const initial = deferred<{
        data: { session: Session | null };
        error: Error | null;
      }>();
      mocks.getSession.mockReturnValueOnce(initial.promise);
      const { unmount } = renderGate();
      expect(screen.getByText("Loading…")).toBeDefined();

      unmount();
      await act(async () => {
        if (outcome === "resolve") {
          initial.resolve({ data: { session: SESSION }, error: null });
        } else {
          initial.reject(new Error("token-native-marker late rejection"));
        }
      });

      expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
      expect(document.body.textContent).not.toContain("token-native-marker");
    },
  );

  it("clears verification errors across auth logout and login transitions", async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: new Error("token-native-marker resolved failure"),
    });
    renderGate();
    expect(await screen.findByText(
      "Could not verify your session. Sign in again.",
    )).toBeDefined();

    emitAuth("SIGNED_IN", SESSION);
    expect(await screen.findByText("Protected child")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Log out/ }));
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
    emitAuth("SIGNED_OUT", null);
    expect(await screen.findByText("Enter the team password")).toBeDefined();
    expect(screen.queryByText(
      "Could not verify your session. Sign in again.",
    )).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "test-team-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Unlock board" }));
    await waitFor(() => {
      expect(mocks.signInWithPassword).toHaveBeenCalledTimes(1);
    });
    emitAuth("SIGNED_IN", SESSION);
    expect(await screen.findByText("Protected child")).toBeDefined();
    expect(document.body.textContent).not.toContain("token-native-marker");
  });
});
