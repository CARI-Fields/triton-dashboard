// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentApiError } from "@/lib/agent-api/errors";
import type { AgentContext, ApiScope } from "@/lib/agent-api/types";
import type {
  ActivityMutationDto,
  AttachmentMutationDto,
} from "@/lib/agent-api/mutation-repository";
import { MutationRpcRejectedError } from "@/lib/agent-api/mutation-repository";

const API_KEY_ID = "40000000-0000-4000-8000-000000000001";
const MEMBER_ID = "20000000-0000-4000-8000-000000000001";
const TASK_ID = "30000000-0000-4000-8000-000000000001";
const EXPERIMENT_ID = "60000000-0000-4000-8000-000000000001";
const ATTACHMENT_ID = "80000000-0000-4000-8000-000000000001";
const IDEMPOTENCY_KEY = "7a000000-0000-4000-8000-000000000001";
const REQUEST_ID = "req_activity_attachment";
const OLD_ETAG = "2026-07-29T11:00:00.000Z";
const UPDATED_AT = "2026-07-29T12:00:00.000Z";

const context: AgentContext = {
  apiKeyId: API_KEY_ID,
  keyPrefix: "tb_live_AAECAwQF",
  memberId: MEMBER_ID,
  memberName: "Bruce",
  scopes: new Set(["activity:append", "attachments:write"]),
  expiresAt: null,
};

const storage = {
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  remove: vi.fn(),
};
const storageFrom = vi.fn(() => storage);

vi.mock("@/lib/agent-api/handler", () => ({
  withAgent: vi.fn(async (
    _request: Request,
    _scope: ApiScope,
    handler: (agent: AgentContext, requestId: string) => Promise<Response>,
  ) => {
    try {
      return await handler(context, REQUEST_ID);
    } catch (reason) {
      const error = reason instanceof AgentApiError
        ? reason
        : new AgentApiError(
          500,
          "INTERNAL_ERROR",
          "An internal error occurred.",
          true,
        );
      return Response.json({
        error: {
          code: error.code,
          message: error.message,
          request_id: REQUEST_ID,
          retryable: error.retryable,
          ...(error.details ? { details: error.details } : {}),
        },
      }, {
        status: error.status,
        headers: { "Cache-Control": "no-store" },
      });
    }
  }),
}));

vi.mock("@/lib/agent-api/permissions", () => ({
  requireTaskCollaboration: vi.fn(),
  requireExperimentCollaboration: vi.fn(),
  requireAttachmentCollaboration: vi.fn(),
}));

vi.mock("@/lib/agent-api/server", () => ({
  getServerSupabase: vi.fn(() => ({
    storage: { from: storageFrom },
  })),
}));

vi.mock("@/lib/agent-api/mutation-repository", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/agent-api/mutation-repository")
  >();
  return {
    ...actual,
    createActivity: vi.fn(),
    createAttachment: vi.fn(),
    patchAttachment: vi.fn(),
  };
});

import { withAgent } from "@/lib/agent-api/handler";
import {
  requireAttachmentCollaboration,
  requireExperimentCollaboration,
  requireTaskCollaboration,
} from "@/lib/agent-api/permissions";
import {
  createActivity,
  createAttachment,
  patchAttachment,
} from "@/lib/agent-api/mutation-repository";
import * as activityRoute
  from "@/app/api/agent/v1/tasks/[id]/activity/route";
import * as attachmentCreateRoute
  from "@/app/api/agent/v1/experiments/[id]/attachments/route";
import * as attachmentRoute
  from "@/app/api/agent/v1/attachments/[id]/route";

function activity(): ActivityMutationDto {
  return {
    id: "90000000-0000-4000-8000-000000000001",
    task_id: TASK_ID,
    experiment_id: null,
    text: "Profile this",
    kind: "comment",
    created_at: UPDATED_AT,
  };
}

function attachment(
  path = `${TASK_ID}/${EXPERIMENT_ID}/original.png`,
): AttachmentMutationDto {
  return {
    id: ATTACHMENT_ID,
    task_id: TASK_ID,
    experiment_id: EXPERIMENT_ID,
    url: `https://storage.test/${path}`,
    path,
    caption: "Profile",
    position: 0,
    created_at: OLD_ETAG,
    updated_at: UPDATED_AT,
  };
}

function jsonRequest(
  method: "POST" | "PATCH",
  path: string,
  body: unknown,
  headers: HeadersInit = {},
): Request {
  return new Request(`https://board.test/api/agent/v1${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function multipartRequest(
  form: FormData,
  path = `/experiments/${EXPERIMENT_ID}/attachments`,
  headers: HeadersInit = {},
): Request {
  const request = new Request(`https://board.test/api/agent/v1${path}`, {
    method: "POST",
    headers: {
      "Idempotency-Key": IDEMPOTENCY_KEY,
      ...headers,
    },
    body: form,
  });
  vi.spyOn(request, "formData").mockResolvedValue(form);
  return request;
}

function uploadForm(
  bytes: Uint8Array = new Uint8Array([1, 2, 3]),
  type = "image/png",
): { form: FormData; file: File } {
  const form = new FormData();
  const file = new File(
    [new Uint8Array(bytes).buffer as ArrayBuffer],
    "ignored-client-name.svg",
    { type },
  );
  form.append("file", file);
  form.append("caption", "  Profile  ");
  return { form, file };
}

function nativeMultipartRequest(
  parts: Array<{
    name: string;
    value: string;
    filename?: string;
    contentType?: string;
  }>,
): Request {
  const boundary = "triton-board-native-boundary";
  const encoded = parts.map((part) => {
    const filename = part.filename === undefined
      ? ""
      : `; filename="${part.filename}"`;
    const contentType = part.contentType === undefined
      ? ""
      : `Content-Type: ${part.contentType}\r\n`;
    return `--${boundary}\r\n`
      + `Content-Disposition: form-data; name="${part.name}"${filename}\r\n`
      + contentType
      + "\r\n"
      + part.value
      + "\r\n";
  }).join("") + `--${boundary}--\r\n`;
  return new Request(
    `https://board.test/api/agent/v1/experiments/${EXPERIMENT_ID}/attachments`,
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Idempotency-Key": IDEMPOTENCY_KEY,
      },
      body: encoded,
    },
  );
}

async function body(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("Activity POST route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createActivity).mockResolvedValue({
      data: activity(),
      idempotencyReplayed: false,
    });
  });

  it("uses activity:append without board:read and returns 201", async () => {
    const request = jsonRequest("POST", `/tasks/${TASK_ID}/activity`, {
      text: "  Profile this  ",
    }, { "Idempotency-Key": IDEMPOTENCY_KEY });
    const response = await activityRoute.POST(request, {
      params: Promise.resolve({ id: TASK_ID }),
    });
    expect(withAgent).toHaveBeenCalledWith(
      request,
      "activity:append",
      expect.any(Function),
    );
    expect(requireTaskCollaboration).toHaveBeenCalledWith(context, TASK_ID);
    expect(createActivity).toHaveBeenCalledWith({
      context,
      taskId: TASK_ID,
      text: "Profile this",
      idempotencyKey: IDEMPOTENCY_KEY,
      requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      requestId: REQUEST_ID,
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(await body(response)).toEqual({
      data: activity(),
      meta: {
        request_id: REQUEST_ID,
        idempotency_replayed: false,
      },
    });
  });

  it("returns the original Activity with replay status 200", async () => {
    vi.mocked(createActivity).mockResolvedValue({
      data: activity(),
      idempotencyReplayed: true,
    });
    const response = await activityRoute.POST(
      jsonRequest("POST", `/tasks/${TASK_ID}/activity`, {
        text: "Profile this",
      }, { "Idempotency-Key": IDEMPOTENCY_KEY }),
      { params: Promise.resolve({ id: TASK_ID }) },
    );
    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({
      meta: { idempotency_replayed: true },
    });
  });

  it("rejects malformed IDs, queries, keys, and extra Activity fields before RPC", async () => {
    const cases = [
      {
        request: jsonRequest("POST", `/tasks/${TASK_ID}/activity?x=1`, {
          text: "Profile",
        }, { "Idempotency-Key": IDEMPOTENCY_KEY }),
        id: TASK_ID,
      },
      {
        request: jsonRequest("POST", "/tasks/A0000000-0000-4000-8000-000000000001/activity", {
          text: "Profile",
        }, { "Idempotency-Key": IDEMPOTENCY_KEY }),
        id: "A0000000-0000-4000-8000-000000000001",
      },
      {
        request: jsonRequest("POST", `/tasks/${TASK_ID}/activity`, {
          text: "Profile",
        }),
        id: TASK_ID,
      },
      {
        request: jsonRequest("POST", `/tasks/${TASK_ID}/activity`, {
          text: "Profile",
          kind: "comment",
        }, { "Idempotency-Key": IDEMPOTENCY_KEY }),
        id: TASK_ID,
      },
    ];
    for (const item of cases) {
      const response = await activityRoute.POST(item.request, {
        params: Promise.resolve({ id: item.id }),
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
    }
    expect(createActivity).not.toHaveBeenCalled();
  });

  it("surfaces an authoritative scope/assignment race from the RPC", async () => {
    vi.mocked(createActivity).mockRejectedValue(new AgentApiError(
      403,
      "TASK_SCOPE_FORBIDDEN",
      "The Agent no longer has access to this Task.",
    ));
    const response = await activityRoute.POST(
      jsonRequest("POST", `/tasks/${TASK_ID}/activity`, {
        text: "Profile",
      }, { "Idempotency-Key": IDEMPOTENCY_KEY }),
      { params: Promise.resolve({ id: TASK_ID }) },
    );
    expect(response.status).toBe(403);
  });

  it("preserves the existing board:read GET", async () => {
    expect(activityRoute.GET).toBeTypeOf("function");
  });
});

describe("Attachment POST route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.upload.mockResolvedValue({ data: { path: "generated" }, error: null });
    storage.getPublicUrl.mockReturnValue({
      data: { publicUrl: "https://storage.test/generated" },
    });
    storage.remove.mockResolvedValue({ data: [], error: null });
    vi.mocked(requireExperimentCollaboration).mockResolvedValue(TASK_ID);
    vi.mocked(createAttachment).mockResolvedValue({
      data: attachment(),
      idempotencyReplayed: false,
    });
  });

  it("uploads exact bytes once before RPC with a server-only path", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fixture = uploadForm(bytes);
    const arrayBuffer = vi.spyOn(fixture.file, "arrayBuffer");
    const request = multipartRequest(fixture.form);
    const response = await attachmentCreateRoute.POST(request, {
      params: Promise.resolve({ id: EXPERIMENT_ID }),
    });

    expect(withAgent).toHaveBeenCalledWith(
      request,
      "attachments:write",
      expect.any(Function),
    );
    expect(requireExperimentCollaboration).toHaveBeenCalledWith(
      context,
      EXPERIMENT_ID,
    );
    expect(storageFrom).toHaveBeenCalledWith("task-images");
    const [path, uploaded, options] = storage.upload.mock.calls[0];
    expect(path).toMatch(new RegExp(
      `^${TASK_ID}/${EXPERIMENT_ID}/`
      + "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-"
      + "[0-9a-f]{12}\\.png$",
    ));
    expect(new Uint8Array(uploaded as ArrayBuffer)).toEqual(bytes);
    expect(options).toEqual({ contentType: "image/png", upsert: false });
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
    expect(storage.upload.mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(createAttachment).mock.invocationCallOrder[0]);
    expect(createAttachment).toHaveBeenCalledWith({
      context,
      experimentId: EXPERIMENT_ID,
      path,
      url: "https://storage.test/generated",
      caption: "Profile",
      idempotencyKey: IDEMPOTENCY_KEY,
      requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      requestId: REQUEST_ID,
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("etag")).toBe(`"${UPDATED_AT}"`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("decodes and uploads a native multipart Request without a formData spy", async () => {
    const request = nativeMultipartRequest([
      {
        name: "file",
        filename: "ignored-client-name.svg",
        contentType: "image/png",
        value: "\x01\x02\x03\x04",
      },
      { name: "caption", value: "  Native profile  " },
    ]);
    const decoded = await request.clone().formData();
    expect(decoded.getAll("file")).toHaveLength(1);
    const response = await attachmentCreateRoute.POST(request, {
      params: Promise.resolve({ id: EXPERIMENT_ID }),
    });
    expect(response.status).toBe(201);
    expect(new Uint8Array(storage.upload.mock.calls[0][1] as ArrayBuffer))
      .toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(createAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ caption: "Native profile" }),
    );
  });

  it.each([
    {
      label: "duplicate native files",
      parts: [
        {
          name: "file",
          filename: "one.png",
          contentType: "image/png",
          value: "one",
        },
        {
          name: "file",
          filename: "two.png",
          contentType: "image/png",
          value: "two",
        },
      ],
    },
    {
      label: "protected native path",
      parts: [
        {
          name: "file",
          filename: "one.png",
          contentType: "image/png",
          value: "one",
        },
        { name: "path", value: "client/path.png" },
      ],
    },
  ])("rejects $label after native multipart decoding", async ({ parts }) => {
    const response = await attachmentCreateRoute.POST(
      nativeMultipartRequest(parts),
      { params: Promise.resolve({ id: EXPERIMENT_ID }) },
    );
    expect(response.status).toBe(422);
    expect(storage.upload).not.toHaveBeenCalled();
    expect(createAttachment).not.toHaveBeenCalled();
  });

  it.each([
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"],
    ["image/gif", "gif"],
  ])("uses the trusted extension for %s", async (mime, extension) => {
    await attachmentCreateRoute.POST(
      multipartRequest(uploadForm(new Uint8Array([1]), mime).form),
      { params: Promise.resolve({ id: EXPERIMENT_ID }) },
    );
    expect(storage.upload.mock.calls[0][0]).toMatch(
      new RegExp(`\\.${extension}$`),
    );
    expect(storage.upload.mock.calls[0][2]).toEqual({
      contentType: mime,
      upsert: false,
    });
  });

  it("rejects a formData parsing failure safely", async () => {
    const request = new Request(
      `https://board.test/api/agent/v1/experiments/${EXPERIMENT_ID}/attachments`,
      {
        method: "POST",
        headers: {
          "Content-Type": "multipart/form-data; boundary=missing",
          "Idempotency-Key": IDEMPOTENCY_KEY,
        },
        body: "not-a-valid-multipart-body",
      },
    );
    const response = await attachmentCreateRoute.POST(request, {
      params: Promise.resolve({ id: EXPERIMENT_ID }),
    });
    expect(response.status).toBe(400);
    expect(await body(response)).toMatchObject({
      error: { code: "INVALID_MULTIPART" },
    });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("does not call RPC or cleanup when upload fails", async () => {
    storage.upload.mockResolvedValue({
      data: null,
      error: { message: "provider secret detail" },
    });
    const response = await attachmentCreateRoute.POST(
      multipartRequest(uploadForm().form),
      { params: Promise.resolve({ id: EXPERIMENT_ID }) },
    );
    expect(response.status).toBe(500);
    expect(await body(response)).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "An internal error occurred.",
        request_id: REQUEST_ID,
        retryable: true,
      },
    });
    expect(createAttachment).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("removes only the generated path after a definite RPC rejection", async () => {
    vi.mocked(createAttachment).mockRejectedValue(new AgentApiError(
      409,
      "IDEMPOTENCY_KEY_REUSED",
      "Idempotency-Key was already used for a different request.",
    ));
    const response = await attachmentCreateRoute.POST(
      multipartRequest(uploadForm().form),
      { params: Promise.resolve({ id: EXPERIMENT_ID }) },
    );
    const generatedPath = storage.upload.mock.calls[0][0] as string;
    expect(storage.remove).toHaveBeenCalledWith([generatedPath]);
    expect(response.status).toBe(409);
  });

  it("keeps a safe domain response when definite-rejection cleanup fails", async () => {
    storage.remove.mockResolvedValue({
      data: null,
      error: { message: "provider cleanup detail" },
    });
    vi.mocked(createAttachment).mockRejectedValue(new AgentApiError(
      403,
      "TASK_SCOPE_FORBIDDEN",
      "The Agent no longer has access to this Task.",
    ));
    const response = await attachmentCreateRoute.POST(
      multipartRequest(uploadForm().form),
      { params: Promise.resolve({ id: EXPERIMENT_ID }) },
    );
    expect(response.status).toBe(403);
    expect(JSON.stringify(await body(response))).not.toContain("provider");
  });

  it("cleans up a definite unknown database rejection and returns a safe 500", async () => {
    vi.mocked(createAttachment).mockRejectedValue(
      new MutationRpcRejectedError(),
    );
    const response = await attachmentCreateRoute.POST(
      multipartRequest(uploadForm().form),
      { params: Promise.resolve({ id: EXPERIMENT_ID }) },
    );
    expect(storage.remove).toHaveBeenCalledWith([
      storage.upload.mock.calls[0][0],
    ]);
    expect(response.status).toBe(500);
    expect(JSON.stringify(await body(response))).not.toContain("database");
  });

  it("retries one ambiguous RPC outcome and never cleans up if unconfirmed", async () => {
    vi.mocked(createAttachment)
      .mockRejectedValueOnce(new Error("Agent API mutation RPC failed."))
      .mockRejectedValueOnce(new Error("Agent API mutation RPC failed."));
    const response = await attachmentCreateRoute.POST(
      multipartRequest(uploadForm().form),
      { params: Promise.resolve({ id: EXPERIMENT_ID }) },
    );
    expect(createAttachment).toHaveBeenCalledTimes(2);
    expect(storage.remove).not.toHaveBeenCalled();
    expect(response.status).toBe(500);
  });

  it("does not cleanup when the retry is definite after an ambiguous first attempt", async () => {
    vi.mocked(createAttachment)
      .mockRejectedValueOnce(new Error(
        "Agent API mutation RPC outcome is ambiguous.",
      ))
      .mockRejectedValueOnce(new AgentApiError(
        403,
        "TASK_SCOPE_FORBIDDEN",
        "The Agent no longer has access to this Task.",
      ));
    const response = await attachmentCreateRoute.POST(
      multipartRequest(uploadForm().form),
      { params: Promise.resolve({ id: EXPERIMENT_ID }) },
    );
    expect(createAttachment).toHaveBeenCalledTimes(2);
    expect(storage.remove).not.toHaveBeenCalled();
    expect(response.status).toBe(500);
  });

  it("confirms an ambiguous committed write by replay and removes the duplicate", async () => {
    vi.mocked(createAttachment)
      .mockRejectedValueOnce(new Error("Agent API mutation RPC failed."))
      .mockResolvedValueOnce({
        data: attachment(),
        idempotencyReplayed: true,
      });
    const response = await attachmentCreateRoute.POST(
      multipartRequest(uploadForm().form),
      { params: Promise.resolve({ id: EXPERIMENT_ID }) },
    );
    expect(createAttachment).toHaveBeenCalledTimes(2);
    expect(storage.remove).toHaveBeenCalledWith([
      storage.upload.mock.calls[0][0],
    ]);
    expect(response.status).toBe(200);
  });

  it("removes a replay duplicate but never the returned original path", async () => {
    vi.mocked(createAttachment).mockResolvedValue({
      data: attachment(),
      idempotencyReplayed: true,
    });
    const response = await attachmentCreateRoute.POST(
      multipartRequest(uploadForm().form),
      { params: Promise.resolve({ id: EXPERIMENT_ID }) },
    );
    const generatedPath = storage.upload.mock.calls[0][0] as string;
    expect(generatedPath).not.toBe(attachment().path);
    expect(storage.remove).toHaveBeenCalledWith([generatedPath]);
    expect(storage.remove).not.toHaveBeenCalledWith([attachment().path]);
    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({
      meta: { idempotency_replayed: true },
    });
  });

  it("does not remove anything when replay mocks collide with the original path", async () => {
    vi.mocked(createAttachment).mockImplementation(async (input) => ({
      data: attachment(input.path),
      idempotencyReplayed: true,
    }));
    const response = await attachmentCreateRoute.POST(
      multipartRequest(uploadForm().form),
      { params: Promise.resolve({ id: EXPERIMENT_ID }) },
    );
    expect(storage.remove).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("rejects malformed IDs, query strings, keys, and protected multipart fields", async () => {
    const protectedForm = uploadForm().form;
    protectedForm.append("path", "client/path.png");
    const cases = [
      {
        request: multipartRequest(
          uploadForm().form,
          `/experiments/${EXPERIMENT_ID}/attachments?x=1`,
        ),
        id: EXPERIMENT_ID,
      },
      {
        request: multipartRequest(
          uploadForm().form,
          "/experiments/A0000000-0000-4000-8000-000000000001/attachments",
        ),
        id: "A0000000-0000-4000-8000-000000000001",
      },
      {
        request: multipartRequest(uploadForm().form, undefined, {
          "Idempotency-Key": "not-a-uuid",
        }),
        id: EXPERIMENT_ID,
      },
      {
        request: multipartRequest(protectedForm),
        id: EXPERIMENT_ID,
      },
    ];
    for (const item of cases) {
      const response = await attachmentCreateRoute.POST(item.request, {
        params: Promise.resolve({ id: item.id }),
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
    }
    expect(createAttachment).not.toHaveBeenCalled();
  });
});

describe("Attachment PATCH route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAttachmentCollaboration).mockResolvedValue(TASK_ID);
    vi.mocked(patchAttachment).mockResolvedValue({
      data: attachment(),
      idempotencyReplayed: false,
    });
  });

  it("uses attachments:write and patches only a normalized caption", async () => {
    const request = jsonRequest(
      "PATCH",
      `/attachments/${ATTACHMENT_ID}`,
      { changes: { caption: "  Profile  " } },
      { "If-Match": `"${OLD_ETAG}"` },
    );
    const response = await attachmentRoute.PATCH(request, {
      params: Promise.resolve({ id: ATTACHMENT_ID }),
    });
    expect(withAgent).toHaveBeenCalledWith(
      request,
      "attachments:write",
      expect.any(Function),
    );
    expect(requireAttachmentCollaboration).toHaveBeenCalledWith(
      context,
      ATTACHMENT_ID,
    );
    expect(patchAttachment).toHaveBeenCalledWith({
      context,
      attachmentId: ATTACHMENT_ID,
      expectedUpdatedAt: OLD_ETAG,
      caption: "Profile",
      requestId: REQUEST_ID,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe(`"${UPDATED_AT}"`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rejects malformed If-Match, query, UUID, and protected fields before RPC", async () => {
    const cases: Array<{
      path: string;
      id: string;
      headers: HeadersInit;
      body: unknown;
    }> = [
      {
        path: `/attachments/${ATTACHMENT_ID}`,
        id: ATTACHMENT_ID,
        headers: {},
        body: { changes: { caption: "Profile" } },
      },
      {
        path: `/attachments/${ATTACHMENT_ID}`,
        id: ATTACHMENT_ID,
        headers: { "If-Match": '"not-a-timestamp"' },
        body: { changes: { caption: "Profile" } },
      },
      {
        path: `/attachments/${ATTACHMENT_ID}?x=1`,
        id: ATTACHMENT_ID,
        headers: { "If-Match": `"${OLD_ETAG}"` },
        body: { changes: { caption: "Profile" } },
      },
      {
        path: "/attachments/A0000000-0000-4000-8000-000000000001",
        id: "A0000000-0000-4000-8000-000000000001",
        headers: { "If-Match": `"${OLD_ETAG}"` },
        body: { changes: { caption: "Profile" } },
      },
      {
        path: `/attachments/${ATTACHMENT_ID}`,
        id: ATTACHMENT_ID,
        headers: { "If-Match": `"${OLD_ETAG}"` },
        body: { changes: { path: "client/path.png" } },
      },
    ];
    for (const item of cases) {
      const response = await attachmentRoute.PATCH(
        jsonRequest("PATCH", item.path, item.body, item.headers),
        { params: Promise.resolve({ id: item.id }) },
      );
      expect(response.status).toBeGreaterThanOrEqual(400);
    }
    expect(patchAttachment).not.toHaveBeenCalled();
  });

  it("surfaces stale and revoked-assignment races from the RPC", async () => {
    for (const error of [
      new AgentApiError(
        412,
        "VERSION_CONFLICT",
        "The resource changed since it was read.",
      ),
      new AgentApiError(
        403,
        "TASK_SCOPE_FORBIDDEN",
        "The Agent no longer has access to this Task.",
      ),
    ]) {
      vi.mocked(patchAttachment).mockRejectedValueOnce(error);
      const response = await attachmentRoute.PATCH(
        jsonRequest(
          "PATCH",
          `/attachments/${ATTACHMENT_ID}`,
          { changes: { caption: "Profile" } },
          { "If-Match": `"${OLD_ETAG}"` },
        ),
        { params: Promise.resolve({ id: ATTACHMENT_ID }) },
      );
      expect(response.status).toBe(error.status);
    }
  });

  it("does not export DELETE", () => {
    expect("DELETE" in attachmentRoute).toBe(false);
  });
});
