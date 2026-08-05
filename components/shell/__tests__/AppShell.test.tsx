import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/shell/AppShell";

const sessionState = vi.hoisted(() => ({ session: null as null | { user: { email: string } } }));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: sessionState.session } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword: vi.fn(async ({ password }: { password: string }) =>
        password === "correct"
          ? { data: { session: { user: { email: "team@triton-board.app" } } }, error: null }
          : { data: { session: null }, error: { message: "bad" } },
      ),
      signOut: vi.fn(async () => ({})),
    },
  },
}));

describe("AppShell", () => {
  afterEach(() => {
    cleanup();
    sessionState.session = null;
  });

  it("shows the login form when there is no session", async () => {
    render(
      <AppShell>
        <div>secret content</div>
      </AppShell>,
    );
    await waitFor(() => expect(screen.getByText("Enter the team password")).toBeDefined());
    expect(screen.queryByText("secret content")).toBeNull();
  });

  it("renders children after a successful login", async () => {
    render(
      <AppShell>
        <div>secret content</div>
      </AppShell>,
    );
    await waitFor(() => expect(screen.getByPlaceholderText("Password")).toBeDefined());
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "correct" } });
    fireEvent.click(screen.getByRole("button", { name: /Unlock board/i }));
    await waitFor(() => expect(screen.getByText("secret content")).toBeDefined());
  });
});
