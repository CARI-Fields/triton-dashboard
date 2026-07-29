import { describe, expect, it, vi } from "vitest";
import {
  parseExperimentCreate,
  parseExperimentPatch,
  parseTaskPatch,
  readJsonObject,
} from "@/lib/agent-api/schemas";

const dataSpec = {
  datasets: [{
    role: "evaluation",
    name: "KernelBench",
    split: "test",
    revision: "v1",
    task_count: 100,
    samples_per_task: 1,
  }],
};

const objectSpec = {
  model: "model",
  harness: "harness",
  parent_harness: "",
  prompt: "optimize",
  prompt_change: "shorter",
  skills: ["triton"],
  tools: ["benchmark"],
};

const environmentSpec = {
  platform: "npu",
  server: "worker-1",
  devices: ["0"],
  hardware: "Ascend",
  evaluator: "pytest",
  revision: "abc123",
  precision_policy: "fp32",
};

class TaskPatchBody {
  changes = { notes: "notes" };
}

class ExperimentCreateBody {
  name = "Experiment";
}

class CustomConfig {}

const cyclicConfig: Record<string, unknown> = {};
cyclicConfig.self = cyclicConfig;

const sparseSkills = new Array<string>(1);
const sparseDatasets = new Array<(typeof dataSpec.datasets)[number]>(1);
const toolsWithExtra = Object.assign(["benchmark"], { extra: "hidden" });

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
      changes: { title: "Tune matmul", status: "blocked", position: 2 },
    })).toEqual({
      title: "Tune matmul",
      status: "blocked",
      position: 2,
    });
  });

  it.each(["module_id", "assignees", "id", "created_at", "updated_at"])(
    "rejects Task field %s",
    (field) => {
      expect(() => parseTaskPatch({ changes: { [field]: "x" } }))
        .toThrowError(expect.objectContaining({ code: "FIELD_NOT_WRITABLE" }));
    },
  );

  it("rejects unknown Task fields rather than dropping them", () => {
    expectCode(
      () => parseTaskPatch({ changes: { priority: "high" } }),
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
    [{ position: Number.NaN }, "INVALID_FIELD"],
    [{ position: Number.POSITIVE_INFINITY }, "INVALID_FIELD"],
  ])("rejects invalid Task changes %j", (changes, code) => {
    expectCode(() => parseTaskPatch({ changes }), code as string);
  });
});

describe("Experiment PATCH schema", () => {
  it("accepts every normal Experiment writable field", () => {
    const changes = {
      name: "Experiment",
      status: "analyzing",
      baseline_experiment_id: null,
      data_spec: dataSpec,
      object_spec: objectSpec,
      environment_spec: environmentSpec,
      config: { batch_size: 8, deterministic: true, label: "test", seed: null },
      notes: "notes",
      metrics: { latency_ms: 1.25 },
      featured_metric_keys: ["latency_ms"],
      result_summary: "faster",
      decision_outcome: "accepted",
      decision_notes: "ship it",
      position: 3,
    };

    expect(parseExperimentPatch({ changes })).toEqual(changes);
  });

  it.each(["owner_id", "task_id", "experiment_no", "started_at", "completed_at"])(
    "rejects Experiment field %s",
    (field) => {
      expect(() => parseExperimentPatch({ changes: { [field]: "x" } }))
        .toThrowError(expect.objectContaining({ code: "FIELD_NOT_WRITABLE" }));
    },
  );

  it.each(["id", "created_at", "updated_at"])(
    "rejects Experiment system field %s",
    (field) => {
      expectCode(
        () => parseExperimentPatch({ changes: { [field]: "x" } }),
        "FIELD_NOT_WRITABLE",
      );
    },
  );

  it("rejects unknown Experiment fields", () => {
    expectCode(
      () => parseExperimentPatch({ changes: { score: 1 } }),
      "UNKNOWN_FIELD",
    );
  });

  it("rejects an uppercase baseline UUID before repository dispatch", () => {
    expect(() => parseExperimentPatch({
      changes: {
        baseline_experiment_id: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
      },
    })).toThrowError(expect.objectContaining({
      status: 422,
      code: "INVALID_FIELD",
      details: { field: "baseline_experiment_id" },
    }));
  });

  it.each([
    null,
    [],
    {},
    { changes: null },
    { changes: [] },
    { changes: { notes: "x" }, extra: true },
  ])("requires exactly one top-level changes object", (body) => {
    expectCode(() => parseExperimentPatch(body), "INVALID_BODY");
  });

  it("rejects an empty Experiment patch", () => {
    expectCode(() => parseExperimentPatch({ changes: {} }), "EMPTY_PATCH");
  });

  it("trims a writable Experiment name", () => {
    expect(parseExperimentPatch({
      changes: { name: "  Agent experiment  " },
    })).toEqual({ name: "Agent experiment" });
  });

  it("accepts Experiment names at the inclusive trimmed boundaries", () => {
    expect(parseExperimentPatch({ changes: { name: " x " } }))
      .toEqual({ name: "x" });
    expect(parseExperimentPatch({
      changes: { name: ` ${"x".repeat(200)} ` },
    })).toEqual({ name: "x".repeat(200) });
  });

  it.each(["   ", "x".repeat(201)])(
    "rejects an invalid writable Experiment name",
    (name) => {
      expect(() => parseExperimentPatch({ changes: { name } })).toThrowError(
        expect.objectContaining({
          status: 422,
          code: "INVALID_FIELD",
          details: { field: "name" },
        }),
      );
    },
  );

  it.each([
    ["Map", new Map()],
    ["Set", new Set()],
    ["Date", new Date("2026-07-28T00:00:00.000Z")],
    ["custom class", new CustomConfig()],
  ])("rejects a %s as a non-JSON config object", (_label, config) => {
    expectCode(
      () => parseExperimentPatch({ changes: { config } }),
      "INVALID_BODY",
    );
  });

  it.each([
    ["undefined", undefined],
    ["function", () => "value"],
    ["symbol", Symbol("value")],
    ["cycle", cyclicConfig],
  ])("rejects a non-JSON %s config value", (_label, value) => {
    expectCode(
      () => parseExperimentPatch({ changes: { config: { value } } }),
      "INVALID_BODY",
    );
  });

  it.each([
    ["sparse skills", {
      object_spec: { ...objectSpec, skills: sparseSkills },
    }],
    ["sparse datasets", {
      data_spec: { datasets: sparseDatasets },
    }],
    ["extra array properties", {
      object_spec: { ...objectSpec, tools: toolsWithExtra },
    }],
  ])("rejects %s in nested Experiment specs", (_label, changes) => {
    expectCode(
      () => parseExperimentPatch({ changes }),
      "INVALID_BODY",
    );
  });

  it("allows a shared non-cyclic value along separate object paths", () => {
    const shared = ["triton"];
    const spec = {
      ...objectSpec,
      skills: shared,
      tools: shared,
    };

    expect(parseExperimentPatch({
      changes: { object_spec: spec },
    })).toEqual({ object_spec: spec });
  });

  it("maps structured clone failures to a field-specific API error", () => {
    const config = new Proxy({ batch_size: 8 }, {});

    expect(() => parseExperimentPatch({
      changes: { config },
    })).toThrowError(expect.objectContaining({
      status: 422,
      code: "INVALID_FIELD",
      details: { field: "config" },
    }));
  });

  it.each([
    { name: null },
    { status: "queued" },
    { baseline_experiment_id: 1 },
    { data_spec: { datasets: [{ ...dataSpec.datasets[0], role: "validation" }] } },
    { data_spec: { ...dataSpec, extra: true } },
    { data_spec: {
      datasets: [{ ...dataSpec.datasets[0], extra: true }],
    } },
    { object_spec: { ...objectSpec, skills: [1] } },
    { object_spec: { ...objectSpec, extra: true } },
    { environment_spec: { ...environmentSpec, platform: "tpu" } },
    { environment_spec: { ...environmentSpec, extra: true } },
    { config: { batch_size: Number.NaN } },
    { metrics: { latency_ms: Number.POSITIVE_INFINITY } },
    { featured_metric_keys: ["latency_ms", 1] },
    { decision_outcome: "maybe" },
    { position: Number.NEGATIVE_INFINITY },
  ])("rejects invalid Experiment changes %j", (changes) => {
    expectCode(
      () => parseExperimentPatch({ changes }),
      "INVALID_FIELD",
    );
  });
});

describe("Experiment create schema", () => {
  it("accepts only a name when creating an Experiment", () => {
    expect(parseExperimentCreate({ name: " Agent experiment " })).toEqual({
      name: "Agent experiment",
    });
  });

  it.each(["status", "config", "owner_id", "task_id", "created_at"])(
    "rejects Experiment create field %s",
    (field) => {
      expect(() => parseExperimentCreate({
        name: "Agent experiment",
        [field]: "x",
      })).toThrowError(expect.objectContaining({ code: "FIELD_NOT_WRITABLE" }));
    },
  );

  it("rejects unknown Experiment create fields", () => {
    expectCode(
      () => parseExperimentCreate({ name: "Agent experiment", surprise: true }),
      "UNKNOWN_FIELD",
    );
  });

  it("rejects a custom-class Experiment create body", () => {
    expectCode(
      () => parseExperimentCreate(new ExperimentCreateBody()),
      "INVALID_BODY",
    );
  });

  it.each([null, []])(
    "rejects non-object Experiment create body %j",
    (body) => {
      expect(() => parseExperimentCreate(body)).toThrowError(
        expect.objectContaining({ status: 400, code: "INVALID_BODY" }),
      );
    },
  );

  it.each([
    {},
    { name: null },
    { name: "   " },
    { name: "x".repeat(201) },
  ])("rejects invalid Experiment names %j", (body) => {
    expect(() => parseExperimentCreate(body)).toThrowError(
      expect.objectContaining({
        status: 422,
        code: "INVALID_FIELD",
        details: { field: "name" },
      }),
    );
  });
});
