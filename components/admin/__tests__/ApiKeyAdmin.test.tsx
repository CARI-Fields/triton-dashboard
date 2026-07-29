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
  "tb_live_CCCCCCCC_CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";
const ROTATE_SECRET =
  "tb_live_RRRRRRRR_RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR";

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
      rows = [{
        ...rows[0],
        ...body,
        member: body.member_id === undefined
          ? rows[0].member
          : MEMBERS.find((member) => member.id === body.member_id)!,
      }];
      return envelope(rows[0]);
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
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
      { ...VIEW, id: "key-never", name: "Never expiry" },
      {
        ...VIEW,
        id: "key-future",
        name: "Future expiry",
        expires_at: "2026-07-29T12:00:00.001Z",
      },
      {
        ...VIEW,
        id: "key-exact",
        name: "Exact expiry",
        expires_at: "2026-07-29T12:00:00.000Z",
      },
      {
        ...VIEW,
        id: "key-past",
        name: "Past expiry",
        expires_at: "2026-07-29T11:59:59.999Z",
      },
      {
        ...VIEW,
        id: "key-revoked",
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
