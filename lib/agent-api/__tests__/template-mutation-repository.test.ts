import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMutationRepository } from "@/lib/agent-api/mutation-repository";

const rpc = vi.fn();

function repository(rpcMock = rpc) {
  const from = vi.fn(() => ({
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({
          data: { id: EXPERIMENT_ID },
          error: null,
        })),
      })),
    })),
  }));
  return createMutationRepository({ from, rpc: rpcMock } as never);
}

const EXPERIMENT_ID = "60000000-0000-4000-8000-000000000001";
const KEY_ID = "50000000-0000-4000-8000-000000000001";

beforeEach(() => vi.clearAllMocks());

describe("template agent mutation adapters", () => {
  it("patches a typed Value through the shared RPC", async () => {
    rpc.mockResolvedValue({
      data: { status: "ok", cell_revision: 2, version_no: 3 },
      error: null,
    });
    const result = await repository().patchExperimentValue({
      experimentId: EXPERIMENT_ID,
      keyId: KEY_ID,
      expectedCellRevision: 1,
      value: { kind: "number", number: 0.73 },
      editSessionId: "80000000-0000-4000-8000-000000000001",
    });
    expect(result.status).toBe("ok");
    expect(rpc).toHaveBeenCalledWith("save_experiment_value", {
      p_experiment_id: EXPERIMENT_ID,
      p_key_id: KEY_ID,
      p_expected_cell_revision: 1,
      p_value: { kind: "number", number: 0.73 },
      p_edit_session_id: "80000000-0000-4000-8000-000000000001",
    });
  });

  it("propagates a cell conflict result", async () => {
    rpc.mockResolvedValue({
      data: { status: "conflict", remote: 0.9, remote_cell_revision: 2 },
      error: null,
    });
    const result = await repository().patchExperimentValue({
      experimentId: EXPERIMENT_ID,
      keyId: KEY_ID,
      expectedCellRevision: 1,
      value: { kind: "number", number: 0.5 },
      editSessionId: "80000000-0000-4000-8000-000000000001",
    });
    expect(result.status).toBe("conflict");
  });

  it("archives, unarchives, and restores through the shared RPCs", async () => {
    rpc.mockResolvedValue({ data: { status: "ok" }, error: null });
    const repo = repository();
    await repo.archiveExperiment(EXPERIMENT_ID);
    expect(rpc).toHaveBeenCalledWith("archive_experiment", {
      p_experiment_id: EXPERIMENT_ID,
    });
    await repo.unarchiveExperiment(EXPERIMENT_ID);
    expect(rpc).toHaveBeenCalledWith("unarchive_experiment", {
      p_experiment_id: EXPERIMENT_ID,
    });
    await repo.restoreExperimentVersion(EXPERIMENT_ID, 2);
    expect(rpc).toHaveBeenCalledWith("restore_experiment_version", {
      p_experiment_id: EXPERIMENT_ID,
      p_version_no: 2,
    });
  });

  it("maps archived-write rejections to AgentApiError", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "EXPERIMENT_ARCHIVED" },
      status: 500,
    });
    await expect(
      repository().patchExperimentValue({
        experimentId: EXPERIMENT_ID,
        keyId: KEY_ID,
        expectedCellRevision: 1,
        value: null,
        editSessionId: "80000000-0000-4000-8000-000000000001",
      }),
    ).rejects.toMatchObject({ status: 409, code: "EXPERIMENT_ARCHIVED" });
  });

  it("creates a Template Experiment and saves its Values", async () => {
    rpc.mockResolvedValue({
      data: { status: "ok", cell_revision: 1, version_no: 1 },
      error: null,
    });
    const created = await repository().createTemplateExperiment({
      task_id: "20000000-0000-4000-8000-000000000001",
      template_id: "30000000-0000-4000-8000-000000000001",
      name: "Run one",
      owner_id: null,
      values: { [KEY_ID]: { kind: "number", number: 0.73 } },
    });
    expect(created.id).toBe(EXPERIMENT_ID);
    expect(rpc).toHaveBeenCalledWith("save_experiment_value", expect.objectContaining({
      p_key_id: KEY_ID,
      p_expected_cell_revision: 0,
    }));
  });
});
