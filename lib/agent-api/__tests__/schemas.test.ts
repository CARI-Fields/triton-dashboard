import { describe, expect, it, vi } from "vitest";
import {
  parseTaskPatch,
  readJsonObject,
} from "@/lib/agent-api/schemas";

function deepPatchJson(field: string): string {
  const depth = 6_500;
  const nested = '{"nested":'.repeat(depth)
    + "null"
    + "}".repeat(depth);
  return `{"changes":{"${field}":${nested}}}`;
}

function expectCode(action: () => unknown, code: string): void {
  expect(action).toThrowError(expect.objectContaining({ code }));
}

class TaskPatchBody {}

describe("readJsonObject", () => {
  it("reads and returns one JSON object exactly once", async () => {
    const text = vi.fn().mockResolvedValue('{"name":"experiment"}');

    await expect(readJsonObject({ text } as unknown as Request)).resolves.toEqual({
      name: "experiment",
    });
    expect(text).toHaveBeenCalledTimes(1);
  });

  it("rejects a body larger than 256 KiB in UTF-8 bytes", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ value: "é".repeat(131_073) }),
    });

    await expect(readJsonObject(request)).rejects.toMatchObject({
      status: 413,
      code: "BODY_TOO_LARGE",
    });
  });

  it("rejects invalid JSON", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      body: "{",
    });

    await expect(readJsonObject(request)).rejects.toMatchObject({
      status: 400,
      code: "INVALID_JSON",
    });
  });

  it.each(["null", "[]", '"text"', "1"])(
    "rejects non-object JSON %s",
    async (body) => {
      const request = new Request("https://example.test", {
        method: "POST",
        body,
      });

      await expect(readJsonObject(request)).rejects.toMatchObject({
        status: 400,
        code: "INVALID_BODY",
      });
    },
  );

  it.each([
    ["an unknown field", "surprise", "UNKNOWN_FIELD"],
    ["an invalid allowed field", "notes", "INVALID_FIELD"],
  ])(
    "preserves the 422 classification for deeply nested JSON in %s",
    async (_label, field, code) => {
      const request = new Request("https://example.test", {
        method: "PATCH",
        body: deepPatchJson(field),
      });
      const body = await readJsonObject(request);

      expect(() => parseTaskPatch(body)).toThrowError(
        expect.objectContaining({ status: 422, code }),
      );
    },
  );
});

describe("Task PATCH schema", () => {
  it("accepts only Task writable fields", () => {
    expect(parseTaskPatch({
      changes: {
        title: "Tune matmul",
        status: "blocked",
        notes: "Profile the fused path.",
        tags: ["NPU", "Verifier"],
        priority: "urgent",
        due_date: "2026-08-15",
        position: 2,
      },
    })).toEqual({
      title: "Tune matmul",
      status: "blocked",
      notes: "Profile the fused path.",
      tags: ["NPU", "Verifier"],
      priority: "urgent",
      due_date: "2026-08-15",
      position: 2,
    });
  });

  it("accepts clearing a Task due date", () => {
    expect(parseTaskPatch({
      changes: { due_date: null },
    })).toEqual({ due_date: null });
  });

  it.each([
    "module_id",
    "assignees",
    "task_assignees",
    "id",
    "created_at",
    "updated_at",
  ])(
    "rejects Task field %s",
    (field) => {
      expect(() => parseTaskPatch({ changes: { [field]: "x" } }))
        .toThrowError(expect.objectContaining({ code: "FIELD_NOT_WRITABLE" }));
    },
  );

  it("rejects unknown Task fields rather than dropping them", () => {
    expectCode(
      () => parseTaskPatch({ changes: { surprise: "high" } }),
      "UNKNOWN_FIELD",
    );
  });

  it.each([
    null,
    [],
    {},
    { changes: null },
    { changes: [] },
    { changes: { notes: "x" }, extra: true },
  ])("requires exactly one top-level changes object", (body) => {
    expectCode(() => parseTaskPatch(body), "INVALID_BODY");
  });

  it("rejects an empty Task patch", () => {
    expectCode(() => parseTaskPatch({ changes: {} }), "EMPTY_PATCH");
  });

  it("rejects a custom-class Task patch body", () => {
    expectCode(() => parseTaskPatch(new TaskPatchBody()), "INVALID_BODY");
  });

  it.each([
    [{ title: 1 }, "INVALID_FIELD"],
    [{ status: "paused" }, "INVALID_FIELD"],
    [{ notes: null }, "INVALID_FIELD"],
    [{ tags: "NPU" }, "INVALID_FIELD"],
    [{ tags: ["NPU", 1] }, "INVALID_FIELD"],
    [{ priority: "critical" }, "INVALID_FIELD"],
    [{ due_date: "2026-02-30" }, "INVALID_FIELD"],
    [{ due_date: "2026-08-15T00:00:00Z" }, "INVALID_FIELD"],
    [{ position: Number.NaN }, "INVALID_FIELD"],
    [{ position: Number.POSITIVE_INFINITY }, "INVALID_FIELD"],
  ])("rejects invalid Task changes %j", (changes, code) => {
    expectCode(() => parseTaskPatch({ changes }), code as string);
  });
});
