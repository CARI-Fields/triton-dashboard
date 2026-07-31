import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AgentApiError } from "@/lib/agent-api/errors";
import type { AgentContext } from "@/lib/agent-api/types";
import { parseCanonicalIdempotencyKey } from "@/lib/agent-api/headers";
import {
  attachmentRequestHash,
  createMutationRepository,
  MutationRpcRejectedError,
} from "@/lib/agent-api/mutation-repository";
import {
  parseActivityCreate,
  parseAttachmentFormData,
  parseAttachmentPatch,
} from "@/lib/agent-api/schemas";

const API_KEY_ID = "40000000-0000-4000-8000-000000000001";
const MEMBER_ID = "20000000-0000-4000-8000-000000000001";
const TASK_ID = "30000000-0000-4000-8000-000000000001";
const EXPERIMENT_ID = "60000000-0000-4000-8000-000000000001";
const ATTACHMENT_ID = "80000000-0000-4000-8000-000000000001";
const IDEMPOTENCY_KEY = "7a000000-0000-4000-8000-000000000001";
const REQUEST_ID = "req_attachment";
const REQUEST_HASH = "b".repeat(64);
const UPDATED_AT = "2026-07-29T12:00:00.000Z";

const context: AgentContext = {
  apiKeyId: API_KEY_ID,
  keyPrefix: "tb_live_AAECAwQF",
  memberId: MEMBER_ID,
  memberName: "Bruce",
  scopes: new Set(["activity:append", "attachments:write"]),
  expiresAt: null,
};

function attachmentRow(): Record<string, unknown> {
  return {
    id: ATTACHMENT_ID,
    task_id: TASK_ID,
    experiment_id: EXPERIMENT_ID,
    url: "https://storage.test/task/experiment/image.png",
    path: `${TASK_ID}/${EXPERIMENT_ID}/image.png`,
    caption: "Profile",
    position: 0,
    template_key_id: null,
    archived_at: null,
    created_at: "2026-07-29T11:00:00.000Z",
    updated_at: UPDATED_AT,
    request_hash: "never-return",
    storage_secret: "never-return",
  };
}

function activityRow(): Record<string, unknown> {
  return {
    id: "90000000-0000-4000-8000-000000000001",
    task_id: TASK_ID,
    experiment_id: null,
    text: "Profile this",
    kind: "comment",
    created_at: UPDATED_AT,
    member_id: MEMBER_ID,
    arbitrary_extra: "never-return",
  };
}

function file(
  type = "image/png",
  size = 1,
): File {
  return new File([new Uint8Array(size)], "ignored-client-name.bin", { type });
}

describe("canonical Idempotency-Key parsing", () => {
  it("accepts one canonical lowercase UUID", () => {
    const request = new Request("https://board.test", {
      headers: { "Idempotency-Key": IDEMPOTENCY_KEY },
    });
    expect(parseCanonicalIdempotencyKey(request)).toBe(IDEMPOTENCY_KEY);
  });

  it.each([
    undefined,
    "",
    IDEMPOTENCY_KEY.toUpperCase(),
    `{${IDEMPOTENCY_KEY}}`,
    `${IDEMPOTENCY_KEY}, ${IDEMPOTENCY_KEY}`,
    "not-a-uuid",
  ])("rejects absent or noncanonical value %s", (value) => {
    const request = new Request("https://board.test", {
      headers: value === undefined ? {} : { "Idempotency-Key": value },
    });
    expect(() => parseCanonicalIdempotencyKey(request)).toThrowError(
      expect.objectContaining({
        status: 400,
        code: "MISSING_IDEMPOTENCY_KEY",
      }),
    );
  });
});

describe("Activity and Attachment schemas", () => {
  it("trims Activity text and accepts no other input", () => {
    expect(parseActivityCreate({ text: "  Profile this  " })).toEqual({
      text: "Profile this",
    });
  });

  it.each(["", " \n\t ", "x".repeat(10_001)])(
    "rejects invalid Activity text",
    (text) => {
      expect(() => parseActivityCreate({ text })).toThrowError(
        expect.objectContaining({ status: 422, code: "INVALID_FIELD" }),
      );
    },
  );

  it.each([
    "kind",
    "experiment_id",
    "member_id",
    "task_id",
    "id",
    "created_at",
  ])("rejects protected Activity field %s", (field) => {
    expect(() => parseActivityCreate({
      text: "Profile",
      [field]: "client-value",
    })).toThrowError(expect.objectContaining({ code: "FIELD_NOT_WRITABLE" }));
  });

  it("rejects unknown Activity fields", () => {
    expect(() => parseActivityCreate({
      text: "Profile",
      extra: true,
    })).toThrowError(expect.objectContaining({ code: "UNKNOWN_FIELD" }));
  });

  it("accepts and trims only an Attachment caption PATCH", () => {
    expect(parseAttachmentPatch({
      changes: { caption: "  Updated plot  " },
    })).toEqual({ caption: "Updated plot" });
  });

  it.each([
    "path",
    "url",
    "task_id",
    "experiment_id",
    "owner_id",
    "id",
    "position",
    "created_at",
    "updated_at",
  ])("rejects protected Attachment PATCH field %s", (field) => {
    expect(() => parseAttachmentPatch({
      changes: { [field]: "client-value" },
    })).toThrowError(expect.objectContaining({ code: "FIELD_NOT_WRITABLE" }));
  });

  it("rejects unknown or non-string Attachment caption PATCH values", () => {
    expect(() => parseAttachmentPatch({
      changes: { caption: 1 },
    })).toThrowError(expect.objectContaining({ code: "INVALID_FIELD" }));
    expect(() => parseAttachmentPatch({
      changes: { caption: "ok", extra: true },
    })).toThrowError(expect.objectContaining({ code: "UNKNOWN_FIELD" }));
  });

  it.each([
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"],
    ["image/gif", "gif"],
  ])("maps %s to the server extension %s", (mime, extension) => {
    const form = new FormData();
    form.append("file", file(mime));
    form.append("caption", "  Profile  ");
    expect(parseAttachmentFormData(form)).toEqual({
      file: expect.any(File),
      caption: "Profile",
      mime,
      extension,
    });
  });

  it("accepts exactly 10 MiB and defaults a missing caption", () => {
    const form = new FormData();
    form.append("file", file("image/png", 10 * 1024 * 1024));
    expect(parseAttachmentFormData(form)).toMatchObject({
      caption: "",
      mime: "image/png",
      extension: "png",
    });
  });

  it.each([
    ["empty", file("image/png", 0)],
    ["too large", file("image/png", 10 * 1024 * 1024 + 1)],
    ["wrong MIME", file("image/svg+xml", 1)],
    ["empty MIME", file("", 1)],
  ])("rejects an %s file", (_label, invalidFile) => {
    const form = new FormData();
    form.append("file", invalidFile);
    expect(() => parseAttachmentFormData(form)).toThrowError(
      expect.objectContaining({ status: 422 }),
    );
  });

  it("rejects missing, duplicate, and wrong-type declared fields", () => {
    expect(() => parseAttachmentFormData(new FormData())).toThrowError(
      expect.objectContaining({ code: "INVALID_FIELD" }),
    );

    const duplicateFile = new FormData();
    duplicateFile.append("file", file());
    duplicateFile.append("file", file());
    expect(() => parseAttachmentFormData(duplicateFile)).toThrowError(
      expect.objectContaining({ code: "INVALID_FIELD" }),
    );

    const duplicateCaption = new FormData();
    duplicateCaption.append("file", file());
    duplicateCaption.append("caption", "one");
    duplicateCaption.append("caption", "two");
    expect(() => parseAttachmentFormData(duplicateCaption)).toThrowError(
      expect.objectContaining({ code: "INVALID_FIELD" }),
    );

    const wrongFile = new FormData();
    wrongFile.append("file", "not-a-file");
    expect(() => parseAttachmentFormData(wrongFile)).toThrowError(
      expect.objectContaining({ code: "INVALID_FIELD" }),
    );

    const wrongCaption = new FormData();
    wrongCaption.append("file", file());
    wrongCaption.append("caption", file());
    expect(() => parseAttachmentFormData(wrongCaption)).toThrowError(
      expect.objectContaining({ code: "INVALID_FIELD" }),
    );
  });

  it.each(["path", "url", "task_id", "experiment_id", "owner_id"])(
    "rejects protected multipart field %s",
    (field) => {
      const form = new FormData();
      form.append("file", file());
      form.append(field, "client-value");
      expect(() => parseAttachmentFormData(form)).toThrowError(
        expect.objectContaining({ code: "FIELD_NOT_WRITABLE" }),
      );
    },
  );

  it("rejects arbitrary multipart fields", () => {
    const form = new FormData();
    form.append("file", file());
    form.append("extra", "client-value");
    expect(() => parseAttachmentFormData(form)).toThrowError(
      expect.objectContaining({ code: "UNKNOWN_FIELD" }),
    );
  });
});

describe("Attachment request hashing", () => {
  it("hashes method, pathname, normalized caption, MIME, and file digest", () => {
    const body = {
      caption: "Profile",
      fileDigest: createHash("sha256").update("bytes").digest("hex"),
      mime: "image/png",
    };
    const expected = createHash("sha256")
      .update(JSON.stringify([
        "POST",
        `/api/agent/v1/experiments/${EXPERIMENT_ID}/attachments`,
        {
          caption: body.caption,
          file_digest: body.fileDigest,
          mime: body.mime,
        },
      ]))
      .digest("hex");
    expect(attachmentRequestHash(
      "POST",
      `/api/agent/v1/experiments/${EXPERIMENT_ID}/attachments`,
      body,
    )).toBe(expected);
  });

  it("is sensitive to every canonical input and independent of random paths", () => {
    const base = {
      caption: "Profile",
      fileDigest: "a".repeat(64),
      mime: "image/png",
    };
    const pathname =
      `/api/agent/v1/experiments/${EXPERIMENT_ID}/attachments`;
    const hash = attachmentRequestHash("POST", pathname, base);
    expect(attachmentRequestHash("PATCH", pathname, base)).not.toBe(hash);
    expect(attachmentRequestHash("POST", `${pathname}/other`, base))
      .not.toBe(hash);
    expect(attachmentRequestHash("POST", pathname, {
      ...base,
      caption: "Other",
    })).not.toBe(hash);
    expect(attachmentRequestHash("POST", pathname, {
      ...base,
      mime: "image/jpeg",
    })).not.toBe(hash);
    expect(attachmentRequestHash("POST", pathname, {
      ...base,
      fileDigest: "b".repeat(64),
    })).not.toBe(hash);
    expect(attachmentRequestHash(
      "POST",
      pathname,
      { ...base, randomPath: "ignored-one.png" },
    )).toBe(hash);
    expect(attachmentRequestHash(
      "POST",
      pathname,
      { ...base, randomPath: "ignored-two.png" },
    )).toBe(hash);
  });
});

describe("Activity and Attachment mutation adapters", () => {
  function repository() {
    const rpc = vi.fn();
    return {
      rpc,
      repository: createMutationRepository(
        { rpc } as unknown as SupabaseClient,
      ),
    };
  }

  it("calls Activity create with exact RPC args and projects an exact DTO", async () => {
    const fixture = repository();
    fixture.rpc.mockResolvedValue({
      data: { data: activityRow(), idempotency_replayed: false },
      error: null,
    });
    const result = await fixture.repository.createActivity({
      context,
      taskId: TASK_ID,
      text: "Profile this",
      idempotencyKey: IDEMPOTENCY_KEY,
      requestHash: REQUEST_HASH,
      requestId: REQUEST_ID,
    });
    expect(fixture.rpc).toHaveBeenCalledWith("agent_api_create_activity", {
      p_api_key_id: API_KEY_ID,
      p_member_id: MEMBER_ID,
      p_task_id: TASK_ID,
      p_text: "Profile this",
      p_idempotency_key: IDEMPOTENCY_KEY,
      p_request_hash: REQUEST_HASH,
      p_request_id: REQUEST_ID,
    });
    expect(result).toEqual({
      data: {
        id: "90000000-0000-4000-8000-000000000001",
        task_id: TASK_ID,
        experiment_id: null,
        text: "Profile this",
        kind: "comment",
        created_at: UPDATED_AT,
      },
      idempotencyReplayed: false,
    });
    expect(JSON.stringify(result)).not.toContain("member_id");
    expect(JSON.stringify(result)).not.toContain("arbitrary_extra");
  });

  it("calls Attachment create with exact RPC args and projects an exact DTO", async () => {
    const fixture = repository();
    fixture.rpc.mockResolvedValue({
      data: { data: attachmentRow(), idempotency_replayed: true },
      error: null,
    });
    const result = await fixture.repository.createAttachment({
      context,
      experimentId: EXPERIMENT_ID,
      path: `${TASK_ID}/${EXPERIMENT_ID}/image.png`,
      url: "https://storage.test/task/experiment/image.png",
      caption: "Profile",
      idempotencyKey: IDEMPOTENCY_KEY,
      requestHash: REQUEST_HASH,
      requestId: REQUEST_ID,
    });
    expect(fixture.rpc).toHaveBeenCalledWith("agent_api_create_attachment", {
      p_api_key_id: API_KEY_ID,
      p_member_id: MEMBER_ID,
      p_experiment_id: EXPERIMENT_ID,
      p_path: `${TASK_ID}/${EXPERIMENT_ID}/image.png`,
      p_url: "https://storage.test/task/experiment/image.png",
      p_caption: "Profile",
      p_idempotency_key: IDEMPOTENCY_KEY,
      p_request_hash: REQUEST_HASH,
      p_request_id: REQUEST_ID,
    });
    expect(result).toEqual({
      data: {
        id: ATTACHMENT_ID,
        task_id: TASK_ID,
        experiment_id: EXPERIMENT_ID,
        url: "https://storage.test/task/experiment/image.png",
        path: `${TASK_ID}/${EXPERIMENT_ID}/image.png`,
        caption: "Profile",
        position: 0,
        template_key_id: null,
        archived_at: null,
        created_at: "2026-07-29T11:00:00.000Z",
        updated_at: UPDATED_AT,
      },
      idempotencyReplayed: true,
    });
    expect(JSON.stringify(result)).not.toContain("request_hash");
    expect(JSON.stringify(result)).not.toContain("storage_secret");
  });

  it("calls Attachment PATCH with exact args", async () => {
    const fixture = repository();
    fixture.rpc.mockResolvedValue({
      data: { data: attachmentRow(), idempotency_replayed: false },
      error: null,
    });
    await fixture.repository.patchAttachment({
      context,
      attachmentId: ATTACHMENT_ID,
      expectedUpdatedAt: "2026-07-29T11:00:00.000Z",
      caption: "Profile",
      requestId: REQUEST_ID,
    });
    expect(fixture.rpc).toHaveBeenCalledWith("agent_api_patch_attachment", {
      p_api_key_id: API_KEY_ID,
      p_member_id: MEMBER_ID,
      p_attachment_id: ATTACHMENT_ID,
      p_expected_updated_at: "2026-07-29T11:00:00.000Z",
      p_caption: "Profile",
      p_request_id: REQUEST_ID,
    });
  });

  it.each([
    null,
    {},
    { data: attachmentRow(), idempotency_replayed: "false" },
    {
      data: { ...attachmentRow(), path: null },
      idempotency_replayed: false,
    },
  ])("rejects malformed Attachment RPC envelope %#", async (data) => {
    const fixture = repository();
    fixture.rpc.mockResolvedValue({ data, error: null });
    await expect(fixture.repository.patchAttachment({
      context,
      attachmentId: ATTACHMENT_ID,
      expectedUpdatedAt: UPDATED_AT,
      caption: "Profile",
      requestId: REQUEST_ID,
    })).rejects.toThrow("Agent API mutation RPC returned invalid data.");
  });

  it("distinguishes a definite unknown database rejection from ambiguity", async () => {
    const fixture = repository();
    fixture.rpc.mockResolvedValue({
      data: null,
      error: {
        code: "23503",
        message: "foreign key violation",
        details: "Key is not present.",
        hint: null,
      },
      status: 409,
      statusText: "Conflict",
    });
    await expect(fixture.repository.createAttachment({
      context,
      experimentId: EXPERIMENT_ID,
      path: "generated.png",
      url: "https://storage.test/generated.png",
      caption: "Profile",
      idempotencyKey: IDEMPOTENCY_KEY,
      requestHash: REQUEST_HASH,
      requestId: REQUEST_ID,
    })).rejects.toBeInstanceOf(MutationRpcRejectedError);
  });

  it.each([
    {
      label: "fetch rejection",
      response: {
        data: null,
        error: {
          code: "",
          message: "TypeError: fetch failed",
          details: "network failure",
          hint: "",
        },
        status: 0,
        statusText: "",
      },
    },
    {
      label: "malformed successful response",
      response: {
        data: null,
        error: { message: "<html>not json</html>" },
        status: 200,
        statusText: "OK",
      },
    },
    {
      label: "domain-like fetch rejection",
      response: {
        data: null,
        error: {
          code: "",
          message: "TASK_SCOPE_FORBIDDEN",
          details: "transport",
          hint: "",
        },
        status: 0,
        statusText: "",
      },
    },
    {
      label: "domain-like malformed 2xx",
      response: {
        data: null,
        error: {
          code: "P0001",
          message: "TASK_SCOPE_FORBIDDEN",
          details: "untrusted success body",
          hint: "",
        },
        status: 200,
        statusText: "OK",
      },
    },
  ])("treats $label as ambiguous", async ({ response }) => {
    const fixture = repository();
    fixture.rpc.mockResolvedValue(response);
    let reason: unknown;
    try {
      await fixture.repository.createAttachment({
        context,
        experimentId: EXPERIMENT_ID,
        path: "generated.png",
        url: "https://storage.test/generated.png",
        caption: "Profile",
        idempotencyKey: IDEMPOTENCY_KEY,
        requestHash: REQUEST_HASH,
        requestId: REQUEST_ID,
      });
    } catch (caught) {
      reason = caught;
    }
    expect(reason).toEqual(new Error(
      "Agent API mutation RPC outcome is ambiguous.",
    ));
    expect(reason).not.toBeInstanceOf(MutationRpcRejectedError);
    expect(reason).not.toBeInstanceOf(AgentApiError);
  });
});
