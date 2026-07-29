import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ApiKeyAdmin from "@/components/admin/ApiKeyAdmin";
import type { ManagedKeyView } from "@/lib/agent-api/admin-keys";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getSession: mocks.getSession, signOut: mocks.signOut },
    from: mocks.from,
  },
}));

const BRUCE_ID = "20000000-0000-4000-8000-000000000001";
const KEY_ID = "40000000-0000-4000-8000-000000000001";
const MEMBERS = [
  { id: BRUCE_ID, name: "Bruce" },
  { id: "20000000-0000-4000-8000-000000000002", name: "Alice" },
];
const VIEW: ManagedKeyView = {
  id: KEY_ID,
  name: "Bruce experiments",
  key_prefix: "tb_live_AAECAwQF",
  member: MEMBERS[0],
  scopes: ["board:read", "experiments:write"],
  expires_at: null,
  revoked_at: null,
  last_used_at: null,
  created_at: "2026-07-29T12:00:00.000Z",
};
const CREATE_SECRET =
  "tb_live_CCCCCCCC_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const ROTATE_SECRET =
  "tb_live_RRRRRRRR_BAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const { created_at: _missingCreatedAt, ...VIEW_WITHOUT_CREATED_AT } = VIEW;

function envelope(data: unknown, status = 200): Response {
  return Response.json(
    { data, meta: { request_id: "req_test" } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function errorEnvelope(
  status: number,
  code: string,
  message: string,
): Response {
  return Response.json(
    {
      error: {
        code,
        message,
        request_id: "req_error",
        retryable: false,
      },
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function textResponse(
  body: string,
  status: number,
  statusText: string,
): Response {
  return new Response(body, {
    status,
    statusText,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain",
    },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, reject, resolve };
}

function installFetch(initial = [VIEW]) {
  let rows: ManagedKeyView[] = initial;
  const fetchMock = vi.fn(async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    expect(new Headers(init?.headers).get("authorization"))
      .toBe("Bearer current-access-token");
    if (method === "GET") return envelope(rows);
    if (method === "POST" && url.endsWith("/rotate")) {
      return envelope({ ...rows[0], secret: ROTATE_SECRET });
    }
    if (method === "POST" && url.endsWith("/revoke")) {
      rows = [{
        ...rows[0],
        revoked_at: "2026-07-29T14:00:00.000Z",
      }];
      return envelope(rows[0]);
    }
    if (method === "POST") {
      const body = JSON.parse(String(init?.body));
      rows = [{
        ...VIEW,
        name: body.name,
        member: MEMBERS.find((member) => member.id === body.member_id)!,
        scopes: body.scopes,
      }];
      return envelope({ ...rows[0], secret: CREATE_SECRET }, 201);
    }
    if (method === "PATCH") {
      const body = JSON.parse(String(init?.body));
      const { member_id: memberId, ...viewChanges } = body;
      rows = [{
        ...rows[0],
        ...viewChanges,
        member: memberId === undefined
          ? rows[0].member
          : MEMBERS.find((member) => member.id === memberId)!,
      }];
      return envelope(rows[0]);
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function fillCreateDraft(name = "Bruce experiments") {
  fireEvent.change(screen.getByLabelText("Key name"), {
    target: { value: name },
  });
  fireEvent.change(screen.getByLabelText("Member"), {
    target: { value: BRUCE_ID },
  });
}

describe("ApiKeyAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.getSession.mockResolvedValue({
      data: {
        session: { access_token: "current-access-token" },
      },
      error: null,
    });
    const order = vi.fn().mockResolvedValue({ data: MEMBERS, error: null });
    const select = vi.fn().mockReturnValue({ order });
    mocks.from.mockReturnValue({ select });
    mocks.signOut.mockResolvedValue({ error: null });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders loading, complete key metadata, and the empty state", async () => {
    const pending = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    render(<ApiKeyAdmin />);

    expect(screen.getByText("Loading API keys…")).toBeDefined();
    await act(async () => pending.resolve(envelope([VIEW])));
    const key = await screen.findByRole("article", {
      name: "Bruce experiments",
    });
    expect(within(key).getByText("Bruce")).toBeDefined();
    expect(within(key).getByText("tb_live_AAECAwQF")).toBeDefined();
    expect(within(key).getByText("board:read")).toBeDefined();
    expect(within(key).getByText("experiments:write")).toBeDefined();
    expect(within(key).getByText("Never expires")).toBeDefined();
    expect(within(key).getByText("Never used")).toBeDefined();
    expect(within(key).getByText("Active")).toBeDefined();

    cleanup();
    installFetch([]);
    render(<ApiKeyAdmin />);
    expect(await screen.findByText("No API keys yet.")).toBeDefined();
  });

  it("creates a Bruce key, copies its one-time secret, then forgets it", async () => {
    const fetchMock = installFetch([]);
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    render(<ApiKeyAdmin />);
    await screen.findByText("No API keys yet.");

    fireEvent.change(screen.getByLabelText("Key name"), {
      target: { value: "Bruce experiments" },
    });
    fireEvent.change(screen.getByLabelText("Member"), {
      target: { value: BRUCE_ID },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "board:read" }));
    fireEvent.click(screen.getByRole("checkbox", {
      name: "experiments:write",
    }));
    fireEvent.click(screen.getByRole("button", { name: "Create API key" }));

    const secret = await screen.findByText(CREATE_SECRET);
    expect(secret).toBeDefined();
    const createCall = fetchMock.mock.calls.find(([, init]) => (
      init?.method === "POST"
      && !String((init as RequestInit | undefined)?.body).includes("rotate")
    ));
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      name: "Bruce experiments",
      member_id: BRUCE_ID,
      scopes: ["board:read", "experiments:write"],
      expires_at: null,
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy secret" }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(CREATE_SECRET);
    });
    expect(screen.getByText("Copied")).toBeDefined();
    expect(storageWrite).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss secret" }));
    expect(screen.queryByText(CREATE_SECRET)).toBeNull();
    fireEvent.click(screen.getByRole("button", {
      name: "Edit Bruce experiments",
    }));
    expect(screen.queryByText(CREATE_SECRET)).toBeNull();
  });

  it("patches, rotates, and revokes a key with guarded controls", async () => {
    const fetchMock = installFetch();
    render(<ApiKeyAdmin />);
    await screen.findByRole("article", { name: "Bruce experiments" });

    fireEvent.click(screen.getByRole("button", {
      name: "Edit Bruce experiments",
    }));
    fireEvent.change(screen.getByLabelText("Key name for Bruce experiments"), {
      target: { value: "Renamed key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save key changes" }));
    expect(await screen.findByRole("article", { name: "Renamed key" }))
      .toBeDefined();
    const patchCall = fetchMock.mock.calls.find(([, init]) => (
      init?.method === "PATCH"
    ));
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
      name: "Renamed key",
      member_id: BRUCE_ID,
      scopes: ["board:read", "experiments:write"],
      expires_at: null,
    });

    fireEvent.click(screen.getByRole("button", { name: "Rotate Renamed key" }));
    expect(await screen.findByText(ROTATE_SECRET)).toBeDefined();
    expect(screen.getByText("Copy this secret now")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss secret" }));

    fireEvent.click(screen.getByRole("button", { name: "Revoke Renamed key" }));
    const key = await screen.findByRole("article", { name: "Renamed key" });
    expect(within(key).getAllByText("Revoked")).toHaveLength(2);
    expect(within(key).queryByRole("button", {
      name: "Rotate Renamed key",
    })).toBeNull();
    expect(within(key).queryByRole("button", {
      name: "Revoke Renamed key",
    })).toBeNull();
  });

  it("reports an expired session and does not call the Admin API", async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });
    const fetchMock = installFetch();
    render(<ApiKeyAdmin />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Your session has expired");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prevents duplicate create submissions and ignores completion after unmount", async () => {
    const create = deferred<Response>();
    const fetchMock = installFetch([]);
    fetchMock.mockImplementationOnce(async () => envelope([]));
    fetchMock.mockImplementationOnce(() => create.promise);
    const { unmount } = render(<ApiKeyAdmin />);
    await screen.findByText("No API keys yet.");

    fireEvent.change(screen.getByLabelText("Key name"), {
      target: { value: "Bruce experiments" },
    });
    fireEvent.change(screen.getByLabelText("Member"), {
      target: { value: BRUCE_ID },
    });
    const submit = screen.getByRole("button", { name: "Create API key" });
    fireEvent.click(submit);
    const busy = screen.getByRole("button", { name: "Creating…" });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(busy);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    unmount();
    await act(async () => create.resolve(envelope({
      ...VIEW,
      secret: CREATE_SECRET,
    }, 201)));
    expect(screen.queryByText(CREATE_SECRET)).toBeNull();
  });

  it("does not allow create and rotate to race two one-time secrets", async () => {
    const create = deferred<Response>();
    const fetchMock = installFetch();
    fetchMock.mockImplementationOnce(async () => envelope([VIEW]));
    fetchMock.mockImplementationOnce(() => create.promise);
    render(<ApiKeyAdmin />);
    await screen.findByRole("article", { name: "Bruce experiments" });

    fireEvent.change(screen.getByLabelText("Key name"), {
      target: { value: "Second Bruce key" },
    });
    fireEvent.change(screen.getByLabelText("Member"), {
      target: { value: BRUCE_ID },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create API key" }));

    const rotate = screen.getByRole("button", {
      name: "Rotate Bruce experiments",
    }) as HTMLButtonElement;
    expect(rotate.disabled).toBe(true);
    fireEvent.click(rotate);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    await act(async () => create.resolve(envelope({
      ...VIEW,
      name: "Second Bruce key",
      secret: CREATE_SECRET,
    }, 201)));
  });

  it("distinguishes active, expired, and revoked keys at the exact current time", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime("2026-07-29T12:00:00.000Z");
    const rows = [
      {
        ...VIEW,
        id: "40000000-0000-4000-8000-000000000002",
        name: "Never expiry",
      },
      {
        ...VIEW,
        id: "40000000-0000-4000-8000-000000000003",
        name: "Future expiry",
        expires_at: "2026-07-29T12:00:00.001Z",
      },
      {
        ...VIEW,
        id: "40000000-0000-4000-8000-000000000004",
        name: "Exact expiry",
        expires_at: "2026-07-29T12:00:00.000Z",
      },
      {
        ...VIEW,
        id: "40000000-0000-4000-8000-000000000005",
        name: "Past expiry",
        expires_at: "2026-07-29T11:59:59.999Z",
      },
      {
        ...VIEW,
        id: "40000000-0000-4000-8000-000000000006",
        name: "Revoked future key",
        expires_at: "2026-07-30T12:00:00.000Z",
        revoked_at: "2026-07-29T11:00:00.000Z",
      },
    ];
    const fetchMock = installFetch(rows);
    render(<ApiKeyAdmin />);

    for (const name of ["Never expiry", "Future expiry"]) {
      const card = await screen.findByRole("article", { name });
      expect(within(card).getByText("Active")).toBeDefined();
      expect(within(card).getByRole("button", {
        name: `Rotate ${name}`,
      })).toBeDefined();
    }
    for (const name of ["Exact expiry", "Past expiry"]) {
      const card = screen.getByRole("article", { name });
      expect(within(card).getByText("Expired")).toBeDefined();
      expect(within(card).queryByRole("button", {
        name: `Rotate ${name}`,
      })).toBeNull();
      expect(within(card).getByRole("button", {
        name: `Edit ${name}`,
      })).toBeDefined();
      expect(within(card).getByRole("button", {
        name: `Revoke ${name}`,
      })).toBeDefined();
    }
    const revoked = screen.getByRole("article", {
      name: "Revoked future key",
    });
    expect(within(revoked).getAllByText("Revoked")).toHaveLength(2);
    expect(within(revoked).queryByText("Expired")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("expires a live key at the exact deadline without another render", async () => {
    vi.useFakeTimers({
      toFake: ["Date", "setTimeout", "clearTimeout"],
    });
    vi.setSystemTime("2026-07-29T12:00:00.000Z");
    const expiring = {
      ...VIEW,
      expires_at: "2026-07-29T12:00:01.000Z",
    };
    const fetchMock = installFetch([expiring]);
    render(<ApiKeyAdmin />);
    await act(async () => {});
    const card = screen.getByRole("article", {
      name: "Bruce experiments",
    });
    expect(within(card).getByText("Active")).toBeDefined();
    const staleRotate = within(card).getByRole("button", {
      name: "Rotate Bruce experiments",
    });

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(within(card).getByText("Expired")).toBeDefined();
    expect(within(card).queryByRole("button", {
      name: "Rotate Bruce experiments",
    })).toBeNull();
    fireEvent.click(staleRotate);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reschedules live expiry after an edit extends the deadline", async () => {
    vi.useFakeTimers({
      toFake: ["Date", "setTimeout", "clearTimeout"],
    });
    vi.setSystemTime("2026-07-29T12:00:00.000Z");
    const expiring = {
      ...VIEW,
      expires_at: "2026-07-29T12:00:01.000Z",
    };
    const fetchMock = installFetch([expiring]);
    render(<ApiKeyAdmin />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", {
      name: "Edit Bruce experiments",
    }));
    fireEvent.change(screen.getByLabelText(
      "Expires at for Bruce experiments",
    ), {
      target: { value: "2026-07-29T08:02" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", {
        name: "Save key changes",
      }));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    const card = screen.getByRole("article", {
      name: "Bruce experiments",
    });
    expect(within(card).getByText("Active")).toBeDefined();
    expect(within(card).getByRole("button", {
      name: "Rotate Bruce experiments",
    })).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(119_000);
    });
    expect(within(card).getByText("Expired")).toBeDefined();
    expect(within(card).queryByRole("button", {
      name: "Rotate Bruce experiments",
    })).toBeNull();
  });

  it("requires explicit confirmation before rotate and explains one-time invalidation", async () => {
    const confirm = vi.mocked(window.confirm);
    confirm.mockReturnValueOnce(false).mockReturnValueOnce(true);
    const fetchMock = installFetch();
    render(<ApiKeyAdmin />);
    await screen.findByRole("article", { name: "Bruce experiments" });

    fireEvent.click(screen.getByRole("button", {
      name: "Rotate Bruce experiments",
    }));
    expect(confirm).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/immediately invalidate the old credential/i),
    );
    expect(confirm.mock.calls[0][0]).toMatch(/shown only once/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(ROTATE_SECRET)).toBeNull();

    fireEvent.click(screen.getByRole("button", {
      name: "Rotate Bruce experiments",
    }));
    expect(await screen.findByText(ROTATE_SECRET)).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("atomically guards rotate before duplicate confirmations", async () => {
    const rotate = deferred<Response>();
    const confirm = vi.mocked(window.confirm);
    const fetchMock = installFetch();
    fetchMock
      .mockImplementationOnce(async () => envelope([VIEW]))
      .mockImplementationOnce(() => rotate.promise);
    render(<ApiKeyAdmin />);
    const button = await screen.findByRole("button", {
      name: "Rotate Bruce experiments",
    });

    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });

    expect(confirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => rotate.resolve(envelope({
      ...VIEW,
      secret: ROTATE_SECRET,
    })));
  });

  it("requires explicit irreversible confirmation before revoke", async () => {
    const confirm = vi.mocked(window.confirm);
    confirm.mockReturnValueOnce(false).mockReturnValueOnce(true);
    const fetchMock = installFetch();
    render(<ApiKeyAdmin />);
    const active = await screen.findByRole("article", {
      name: "Bruce experiments",
    });

    fireEvent.click(within(active).getByRole("button", {
      name: "Revoke Bruce experiments",
    }));
    expect(confirm).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/cannot be undone/i),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(within(active).getByText("Active")).toBeDefined();

    fireEvent.click(within(active).getByRole("button", {
      name: "Revoke Bruce experiments",
    }));
    await waitFor(() => {
      expect(within(active).getAllByText("Revoked")).toHaveLength(2);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("requires a successful reload after a rotation response is lost", async () => {
    const rotatedView = {
      ...VIEW,
      key_prefix: "tb_live_NEWPREFX",
    };
    let rows = [VIEW];
    const fetchMock = vi.fn(async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const method = init?.method ?? "GET";
      if (method === "GET") return envelope(rows);
      if (String(input).endsWith("/rotate")) {
        rows = [rotatedView];
        throw new TypeError("Network connection lost after request.");
      }
      throw new Error(`Unexpected request: ${method} ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ApiKeyAdmin />);
    await screen.findByText(VIEW.key_prefix);

    fireEvent.click(screen.getByRole("button", {
      name: "Rotate Bruce experiments",
    }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/old credential may already be invalid/i);
    expect(alert.textContent).toMatch(/new secret cannot be recovered/i);
    expect(alert.textContent).toMatch(/refresh the list/i);
    expect((screen.getByRole("button", {
      name: "Rotate Bruce experiments",
    }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", {
      name: "Revoke Bruce experiments",
    }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Retry list" }));
    expect(await screen.findByText(rotatedView.key_prefix)).toBeDefined();
    expect(screen.queryByText(VIEW.key_prefix)).toBeNull();
    expect((screen.getByRole("button", {
      name: "Rotate Bruce experiments",
    }) as HTMLButtonElement).disabled).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    {
      name: "a server 500",
      response: () => errorEnvelope(
        500,
        "INTERNAL_ERROR",
        "An internal error occurred.",
      ),
    },
    {
      name: "a malformed successful response",
      response: () => textResponse("{\"data\":", 200, "OK"),
    },
  ])("treats $name as an uncertain rotation outcome", async ({ response }) => {
    const fetchMock = installFetch();
    fetchMock
      .mockImplementationOnce(async () => envelope([VIEW]))
      .mockImplementationOnce(async () => response());
    render(<ApiKeyAdmin />);
    await screen.findByRole("article", { name: "Bruce experiments" });

    fireEvent.click(screen.getByRole("button", {
      name: "Rotate Bruce experiments",
    }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/old credential may already be invalid/i);
    expect(alert.textContent).toMatch(/new secret cannot be recovered/i);
    expect((screen.getByRole("button", {
      name: "Edit Bruce experiments",
    }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("treats a DTO-invalid rotation success as uncertain without exposing it", async () => {
    const fetchMock = installFetch();
    fetchMock
      .mockImplementationOnce(async () => envelope([VIEW]))
      .mockImplementationOnce(async () => envelope({
        ...VIEW,
        secret: "payload-secret-marker",
        key_digest: "digest-leak-marker",
      }));
    render(<ApiKeyAdmin />);
    await screen.findByRole("article", { name: "Bruce experiments" });

    fireEvent.click(screen.getByRole("button", {
      name: "Rotate Bruce experiments",
    }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/new secret cannot be recovered/i);
    expect(alert.textContent).not.toContain("payload-secret-marker");
    expect(alert.textContent).not.toContain("digest-leak-marker");
    expect(screen.queryByText("payload-secret-marker")).toBeNull();
  });

  it("keeps a structured rotation 409 as a known failure", async () => {
    const fetchMock = installFetch();
    fetchMock
      .mockImplementationOnce(async () => envelope([VIEW]))
      .mockImplementationOnce(async () => errorEnvelope(
        409,
        "API_KEY_CONFLICT",
        "The key changed before rotation.",
      ))
      .mockImplementationOnce(async () => envelope({
        ...VIEW,
        secret: ROTATE_SECRET,
      }));
    render(<ApiKeyAdmin />);
    await screen.findByRole("article", { name: "Bruce experiments" });

    fireEvent.click(screen.getByRole("button", {
      name: "Rotate Bruce experiments",
    }));
    expect((await screen.findByRole("alert")).textContent)
      .toContain("The key changed before rotation.");
    expect(screen.queryByText(/new secret cannot be recovered/i)).toBeNull();
    expect((screen.getByRole("button", {
      name: "Rotate Bruce experiments",
    }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", {
      name: "Rotate Bruce experiments",
    }));
    expect(await screen.findByText(ROTATE_SECRET)).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    { name: "a missing token", preflight: "missing" },
    { name: "a session lookup error", preflight: "error" },
    { name: "a rejected session lookup", preflight: "rejected" },
  ])("does not latch uncertain rotation for $name", async ({ preflight }) => {
    const fetchMock = installFetch();
    render(<ApiKeyAdmin />);
    await screen.findByRole("article", { name: "Bruce experiments" });
    if (preflight === "missing") {
      mocks.getSession.mockResolvedValueOnce({
        data: { session: null },
        error: null,
      });
    } else if (preflight === "error") {
      mocks.getSession.mockResolvedValueOnce({
        data: { session: { access_token: "current-access-token" } },
        error: { message: "payload-secret-marker" },
      });
    } else {
      mocks.getSession.mockRejectedValueOnce(
        new Error("payload-secret-marker"),
      );
    }

    fireEvent.click(screen.getByRole("button", {
      name: "Rotate Bruce experiments",
    }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Your session has expired");
    expect(alert.textContent).not.toContain("payload-secret-marker");
    expect(alert.textContent).not.toMatch(/new secret cannot be recovered/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", {
      name: "Rotate Bruce experiments",
    }) as HTMLButtonElement).disabled).toBe(false);

    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "current-access-token" } },
      error: null,
    });
    fireEvent.click(screen.getByRole("button", {
      name: "Rotate Bruce experiments",
    }));
    expect(await screen.findByText(ROTATE_SECRET)).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("locally signs out after a load 401 even when signOut itself fails", async () => {
    mocks.signOut.mockRejectedValueOnce(new Error("Auth endpoint offline."));
    const fetchMock = vi.fn().mockResolvedValueOnce(errorEnvelope(
      401,
      "INVALID_ADMIN_SESSION",
      "Invalid Admin session.",
    ));
    vi.stubGlobal("fetch", fetchMock);
    render(<ApiKeyAdmin />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Your session has expired");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(screen.queryByRole("button", { name: "Retry list" })).toBeNull();
    expect((screen.getByRole("button", {
      name: "Create API key",
    }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Create API key" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: "a Members query error", membersOutcome: "error" },
    { name: "a rejected Members query", membersOutcome: "rejected" },
  ])("prioritizes an Admin 401 over $name", async ({ membersOutcome }) => {
    const order = membersOutcome === "error"
      ? vi.fn().mockResolvedValue({
        data: null,
        error: { message: "payload-secret-marker" },
      })
      : vi.fn().mockRejectedValue(new Error("payload-secret-marker"));
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ order }),
    });
    const fetchMock = vi.fn().mockResolvedValueOnce(errorEnvelope(
      401,
      "INVALID_ADMIN_SESSION",
      "Invalid Admin session.",
    ));
    vi.stubGlobal("fetch", fetchMock);
    render(<ApiKeyAdmin />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Your session has expired");
    expect(alert.textContent).not.toContain("payload-secret-marker");
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("reports a Members error after a valid Admin list response", async () => {
    const order = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "payload-secret-marker" },
    });
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ order }),
    });
    const fetchMock = vi.fn().mockResolvedValueOnce(envelope([VIEW]));
    vi.stubGlobal("fetch", fetchMock);
    render(<ApiKeyAdmin />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not load Members.");
    expect(alert.textContent).not.toContain("payload-secret-marker");
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("prioritizes a safe Admin network error over a Members error", async () => {
    const order = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "members-payload-marker" },
    });
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ order }),
    });
    const fetchMock = vi.fn().mockRejectedValueOnce(
      new Error("transport-payload-marker"),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ApiKeyAdmin />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not load API keys.");
    expect(alert.textContent).not.toContain("members-payload-marker");
    expect(alert.textContent).not.toContain("transport-payload-marker");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("locally signs out after a mutation 401 and blocks same-token reuse", async () => {
    const fetchMock = installFetch([]);
    fetchMock
      .mockImplementationOnce(async () => envelope([]))
      .mockImplementationOnce(async () => errorEnvelope(
        401,
        "INVALID_ADMIN_SESSION",
        "Invalid Admin session.",
      ));
    render(<ApiKeyAdmin />);
    await screen.findByText("No API keys yet.");

    fireEvent.change(screen.getByLabelText("Key name"), {
      target: { value: "Bruce experiments" },
    });
    fireEvent.change(screen.getByLabelText("Member"), {
      target: { value: BRUCE_ID },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create API key" }));

    expect((await screen.findByRole("alert")).textContent)
      .toContain("Your session has expired");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    const create = screen.getByRole("button", {
      name: "Create API key",
    }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    fireEvent.click(create);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not sign out when a mutation 401 arrives after unmount and a new session", async () => {
    const create = deferred<Response>();
    const fetchMock = installFetch([]);
    fetchMock
      .mockImplementationOnce(async () => envelope([]))
      .mockImplementationOnce(() => create.promise);
    const { unmount } = render(<ApiKeyAdmin />);
    await screen.findByText("No API keys yet.");
    fireEvent.change(screen.getByLabelText("Key name"), {
      target: { value: "Bruce experiments" },
    });
    fireEvent.change(screen.getByLabelText("Member"), {
      target: { value: BRUCE_ID },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create API key" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    unmount();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "new-access-token" } },
      error: null,
    });
    await act(async () => create.resolve(errorEnvelope(
      401,
      "INVALID_ADMIN_SESSION",
      "Invalid Admin session.",
    )));

    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("does not sign out when an old-token mutation receives a late 401", async () => {
    const create = deferred<Response>();
    const fetchMock = installFetch([]);
    fetchMock
      .mockImplementationOnce(async () => envelope([]))
      .mockImplementationOnce(() => create.promise);
    render(<ApiKeyAdmin />);
    await screen.findByText("No API keys yet.");
    fireEvent.change(screen.getByLabelText("Key name"), {
      target: { value: "Bruce experiments" },
    });
    fireEvent.change(screen.getByLabelText("Member"), {
      target: { value: BRUCE_ID },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create API key" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "refreshed-access-token" } },
      error: null,
    });
    await act(async () => create.resolve(errorEnvelope(
      401,
      "INVALID_ADMIN_SESSION",
      "Invalid Admin session.",
    )));

    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(screen.queryByText(/session has expired/i)).toBeNull();
    expect((screen.getByRole("button", {
      name: "Create API key",
    }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not sign out when an old-token load receives a late 401", async () => {
    const load = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(load.promise);
    vi.stubGlobal("fetch", fetchMock);
    render(<ApiKeyAdmin />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "refreshed-access-token" } },
      error: null,
    });
    await act(async () => load.resolve(errorEnvelope(
      401,
      "INVALID_ADMIN_SESSION",
      "Invalid Admin session.",
    )));

    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(screen.queryByText(/session has expired/i)).toBeNull();
  });

  it("does not sign out when a load 401 arrives after unmount", async () => {
    const load = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(load.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(<ApiKeyAdmin />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    unmount();
    await act(async () => load.resolve(errorEnvelope(
      401,
      "INVALID_ADMIN_SESSION",
      "Invalid Admin session.",
    )));

    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("classifies empty and truncated 401 bodies for load and mutation", async () => {
    const loadFailure = vi.fn().mockResolvedValueOnce(textResponse(
      "",
      401,
      "Unauthorized",
    ));
    vi.stubGlobal("fetch", loadFailure);
    render(<ApiKeyAdmin />);
    expect((await screen.findByRole("alert")).textContent)
      .toContain("Your session has expired");
    expect(mocks.signOut).toHaveBeenCalledTimes(1);

    cleanup();
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "current-access-token" } },
      error: null,
    });
    const order = vi.fn().mockResolvedValue({ data: MEMBERS, error: null });
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ order }),
    });
    mocks.signOut.mockResolvedValue({ error: null });
    const mutationFailure = installFetch([]);
    mutationFailure
      .mockImplementationOnce(async () => envelope([]))
      .mockImplementationOnce(async () => textResponse(
        "{\"error\":",
        401,
        "Unauthorized",
      ));
    render(<ApiKeyAdmin />);
    await screen.findByText("No API keys yet.");
    fireEvent.change(screen.getByLabelText("Key name"), {
      target: { value: "Bruce experiments" },
    });
    fireEvent.change(screen.getByLabelText("Member"), {
      target: { value: BRUCE_ID },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create API key" }));

    expect((await screen.findByRole("alert")).textContent)
      .toContain("Your session has expired");
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("does not sign out for non-JSON 403 or 500 API failures", async () => {
    const loadFailure = vi.fn().mockResolvedValueOnce(textResponse(
      "<html>offline</html>",
      500,
      "Internal Server Error",
    ));
    vi.stubGlobal("fetch", loadFailure);
    render(<ApiKeyAdmin />);
    expect((await screen.findByRole("alert")).textContent)
      .toContain("Could not load API keys.");
    expect(mocks.signOut).not.toHaveBeenCalled();

    cleanup();
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "current-access-token" } },
      error: null,
    });
    const order = vi.fn().mockResolvedValue({ data: MEMBERS, error: null });
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ order }),
    });
    const mutationFailure = installFetch([]);
    mutationFailure
      .mockImplementationOnce(async () => envelope([]))
      .mockImplementationOnce(async () => textResponse(
        "Forbidden",
        403,
        "Forbidden",
      ));
    render(<ApiKeyAdmin />);
    await screen.findByText("No API keys yet.");
    fireEvent.change(screen.getByLabelText("Key name"), {
      target: { value: "Bruce experiments" },
    });
    fireEvent.change(screen.getByLabelText("Member"), {
      target: { value: BRUCE_ID },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create API key" }));

    expect((await screen.findByRole("alert")).textContent)
      .toContain("Could not create the API key.");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("reports a safe fallback for a malformed successful list response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(textResponse(
      "null",
      200,
      "OK",
    ));
    vi.stubGlobal("fetch", fetchMock);
    render(<ApiKeyAdmin />);

    expect((await screen.findByRole("alert")).textContent)
      .toContain("Could not load API keys.");
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Retry list" })).toBeDefined();
  });

  it.each([
    { name: "null", data: null },
    { name: "a string", data: "payload-secret-marker" },
    { name: "an invalid item", data: [null] },
    { name: "a missing view field", data: [VIEW_WITHOUT_CREATED_AT] },
    {
      name: "an extra digest field",
      data: [{ ...VIEW, key_digest: "digest-leak-marker" }],
    },
  ])("rejects $name in a successful list envelope", async ({ data }) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(envelope(data));
    vi.stubGlobal("fetch", fetchMock);
    render(<ApiKeyAdmin />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not load API keys.");
    expect(alert.textContent).not.toContain("payload-secret-marker");
    expect(alert.textContent).not.toContain("digest-leak-marker");
    expect(screen.queryByRole("article")).toBeNull();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "a missing secret",
      result: VIEW,
    },
    {
      name: "a malformed secret",
      result: { ...VIEW, secret: "payload-secret-marker" },
    },
  ])("rejects $name in a successful create envelope", async ({ result }) => {
    const fetchMock = installFetch([]);
    fetchMock
      .mockImplementationOnce(async () => envelope([]))
      .mockImplementationOnce(async () => envelope(result, 201));
    render(<ApiKeyAdmin />);
    await screen.findByText("No API keys yet.");
    fillCreateDraft();
    fireEvent.click(screen.getByRole("button", { name: "Create API key" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not create the API key.");
    expect(alert.textContent).not.toContain("payload-secret-marker");
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.queryByText("payload-secret-marker")).toBeNull();
  });

  it("rejects an extra digest in a successful patch envelope", async () => {
    const fetchMock = installFetch();
    fetchMock
      .mockImplementationOnce(async () => envelope([VIEW]))
      .mockImplementationOnce(async () => envelope({
        ...VIEW,
        name: "Renamed with digest",
        key_digest: "digest-leak-marker",
      }));
    render(<ApiKeyAdmin />);
    await screen.findByRole("article", { name: "Bruce experiments" });
    fireEvent.click(screen.getByRole("button", {
      name: "Edit Bruce experiments",
    }));
    fireEvent.change(screen.getByLabelText("Key name for Bruce experiments"), {
      target: { value: "Renamed with digest" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save key changes" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not update the API key.");
    expect(alert.textContent).not.toContain("digest-leak-marker");
    expect(screen.getByRole("article", {
      name: "Bruce experiments",
    })).toBeDefined();
    expect(screen.queryByRole("article", {
      name: "Renamed with digest",
    })).toBeNull();
  });

  it("rejects an extra digest in a successful revoke envelope", async () => {
    const fetchMock = installFetch();
    fetchMock
      .mockImplementationOnce(async () => envelope([VIEW]))
      .mockImplementationOnce(async () => envelope({
        ...VIEW,
        revoked_at: "2026-07-29T14:00:00.000Z",
        key_digest: "digest-leak-marker",
      }));
    render(<ApiKeyAdmin />);
    const card = await screen.findByRole("article", {
      name: "Bruce experiments",
    });
    fireEvent.click(within(card).getByRole("button", {
      name: "Revoke Bruce experiments",
    }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not revoke the API key.");
    expect(alert.textContent).not.toContain("digest-leak-marker");
    expect(within(card).getByText("Active")).toBeDefined();
  });

  it("does not sign out for ordinary 403 or 500 API failures", async () => {
    const loadFailure = vi.fn().mockResolvedValueOnce(errorEnvelope(
      500,
      "INTERNAL_ERROR",
      "An internal error occurred.",
    ));
    vi.stubGlobal("fetch", loadFailure);
    render(<ApiKeyAdmin />);
    expect((await screen.findByRole("alert")).textContent)
      .toContain("An internal error occurred.");
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Retry list" })).toBeDefined();

    cleanup();
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "current-access-token" } },
      error: null,
    });
    const order = vi.fn().mockResolvedValue({ data: MEMBERS, error: null });
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ order }),
    });
    const mutationFailure = installFetch([]);
    mutationFailure
      .mockImplementationOnce(async () => envelope([]))
      .mockImplementationOnce(async () => errorEnvelope(
        403,
        "ADMIN_FORBIDDEN",
        "Admin access is required.",
      ));
    render(<ApiKeyAdmin />);
    await screen.findByText("No API keys yet.");
    fireEvent.change(screen.getByLabelText("Key name"), {
      target: { value: "Bruce experiments" },
    });
    fireEvent.change(screen.getByLabelText("Member"), {
      target: { value: BRUCE_ID },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create API key" }));
    expect((await screen.findByRole("alert")).textContent)
      .toContain("Admin access is required.");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("serializes a deferred reload before create so old GET cannot overwrite it", async () => {
    const oldReload = deferred<Response>();
    const created = {
      ...VIEW,
      name: "Created after reload",
      secret: CREATE_SECRET,
    };
    const fetchMock = installFetch();
    fetchMock
      .mockImplementationOnce(async () => envelope([VIEW]))
      .mockImplementationOnce(async () => errorEnvelope(
        500,
        "INTERNAL_ERROR",
        "Revoke failed.",
      ))
      .mockImplementationOnce(() => oldReload.promise)
      .mockImplementationOnce(async () => envelope(created, 201));
    render(<ApiKeyAdmin />);
    await screen.findByRole("article", { name: "Bruce experiments" });
    fireEvent.click(screen.getByRole("button", {
      name: "Revoke Bruce experiments",
    }));
    await screen.findByText("Revoke failed.");

    fireEvent.change(screen.getByLabelText("Key name"), {
      target: { value: "Created after reload" },
    });
    fireEvent.change(screen.getByLabelText("Member"), {
      target: { value: BRUCE_ID },
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry list" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const create = screen.getByRole("button", {
      name: "Create API key",
    }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    fireEvent.click(create);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await act(async () => oldReload.resolve(envelope([VIEW])));
    await waitFor(() => expect(create.disabled).toBe(false));
    fireEvent.click(create);
    expect(await screen.findByText(CREATE_SECRET)).toBeDefined();
    expect(screen.getByRole("article", {
      name: "Created after reload",
    })).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("atomically rejects duplicate programmatic create submissions", async () => {
    const firstCreate = deferred<Response>();
    const secondCreate = deferred<Response>();
    const fetchMock = installFetch([]);
    fetchMock
      .mockImplementationOnce(async () => envelope([]))
      .mockImplementationOnce(() => firstCreate.promise)
      .mockImplementationOnce(() => secondCreate.promise);
    const { unmount } = render(<ApiKeyAdmin />);
    await screen.findByText("No API keys yet.");
    fireEvent.change(screen.getByLabelText("Key name"), {
      target: { value: "Bruce experiments" },
    });
    fireEvent.change(screen.getByLabelText("Member"), {
      target: { value: BRUCE_ID },
    });
    const form = screen.getByRole("button", {
      name: "Create API key",
    }).closest("form")!;

    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    unmount();
    await act(async () => firstCreate.resolve(envelope({
      ...VIEW,
      secret: CREATE_SECRET,
    }, 201)));
  });

  it("rejects a stale Retry event once a mutation has started", async () => {
    const create = deferred<Response>();
    const fetchMock = installFetch();
    fetchMock
      .mockImplementationOnce(async () => envelope([VIEW]))
      .mockImplementationOnce(async () => errorEnvelope(
        409,
        "API_KEY_CONFLICT",
        "The key changed.",
      ))
      .mockImplementationOnce(() => create.promise);
    render(<ApiKeyAdmin />);
    await screen.findByRole("article", { name: "Bruce experiments" });
    fireEvent.click(screen.getByRole("button", {
      name: "Rotate Bruce experiments",
    }));
    const retry = await screen.findByRole("button", { name: "Retry list" });
    fireEvent.change(screen.getByLabelText("Key name"), {
      target: { value: "Created without racing a GET" },
    });
    fireEvent.change(screen.getByLabelText("Member"), {
      target: { value: BRUCE_ID },
    });
    const form = screen.getByRole("button", {
      name: "Create API key",
    }).closest("form")!;

    act(() => {
      fireEvent.submit(form);
      fireEvent.click(retry);
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await act(async () => create.resolve(envelope({
      ...VIEW,
      name: "Created without racing a GET",
      secret: CREATE_SECRET,
    }, 201)));
    expect(await screen.findByText(CREATE_SECRET)).toBeDefined();
  });

  it("rejects a stale mutation event during Retry and unlocks after reload", async () => {
    const reload = deferred<Response>();
    const fetchMock = installFetch();
    fetchMock
      .mockImplementationOnce(async () => envelope([VIEW]))
      .mockImplementationOnce(async () => errorEnvelope(
        409,
        "API_KEY_CONFLICT",
        "The key changed.",
      ))
      .mockImplementationOnce(() => reload.promise)
      .mockImplementationOnce(async () => envelope({
        ...VIEW,
        name: "Created after reload",
        secret: CREATE_SECRET,
      }, 201));
    render(<ApiKeyAdmin />);
    await screen.findByRole("article", { name: "Bruce experiments" });
    fireEvent.click(screen.getByRole("button", {
      name: "Rotate Bruce experiments",
    }));
    const retry = await screen.findByRole("button", { name: "Retry list" });
    fireEvent.change(screen.getByLabelText("Key name"), {
      target: { value: "Created after reload" },
    });
    fireEvent.change(screen.getByLabelText("Member"), {
      target: { value: BRUCE_ID },
    });
    const form = screen.getByRole("button", {
      name: "Create API key",
    }).closest("form")!;

    act(() => {
      fireEvent.click(retry);
      fireEvent.submit(form);
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await act(async () => reload.resolve(envelope([VIEW])));
    await waitFor(() => {
      expect((screen.getByRole("button", {
        name: "Create API key",
      }) as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.submit(form);
    expect(await screen.findByText(CREATE_SECRET)).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("keeps the one-time secret visible when clipboard copy is rejected", async () => {
    installFetch([]);
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(
      new Error("Clipboard permission denied."),
    );
    render(<ApiKeyAdmin />);
    await screen.findByText("No API keys yet.");
    fireEvent.change(screen.getByLabelText("Key name"), {
      target: { value: "Bruce experiments" },
    });
    fireEvent.change(screen.getByLabelText("Member"), {
      target: { value: BRUCE_ID },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create API key" }));
    await screen.findByText(CREATE_SECRET);

    fireEvent.click(screen.getByRole("button", { name: "Copy secret" }));
    expect((await screen.findByRole("alert")).textContent)
      .toContain("Could not copy the secret.");
    expect(screen.getByText(CREATE_SECRET)).toBeDefined();
    expect(screen.getByRole("button", { name: "Copy secret" })).toBeDefined();
    expect(screen.getByRole("button", {
      name: "Dismiss secret",
    })).toBeDefined();
  });

  it("aborts a pending list request when the component unmounts", async () => {
    const pending = deferred<Response>();
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn((
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      signal = init?.signal ?? undefined;
      return pending.promise;
    });
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(<ApiKeyAdmin />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(signal?.aborted).toBe(false);

    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve(envelope([VIEW])));
    expect(screen.queryByRole("article", {
      name: "Bruce experiments",
    })).toBeNull();
  });
});
