import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  archiveExperiment,
  loadExperimentValues,
  restoreExperimentVersion,
  saveValue,
  type TypedValue,
} from "@/lib/experiments/values";

interface MockRpc {
  rpc: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  const from = vi.fn(() => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      not: vi.fn(() => query),
      is: vi.fn(() => query),
      order: vi.fn(() => query),
      then: (resolve: (response: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return query;
  });
  return { rpc, from };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
  },
}));

const EXPERIMENT_ID = "60000000-0000-4000-8000-000000000020";
const KEY_ID = "50000000-0000-4000-8000-000000000020";

beforeEach(() => vi.clearAllMocks());

describe("experiment value repository", () => {
  it("sends a typed Value through the save RPC", async () => {
    vi.mocked(mocks.rpc).mockResolvedValue({
      data: { status: "ok", cell_revision: 2, version_no: 3 },
      error: null,
    });

    const result = await saveValue({
      experimentId: EXPERIMENT_ID,
      keyId: KEY_ID,
      expectedCellRevision: 1,
      value: { kind: "number", number: 0.73 },
      editSessionId: "80000000-0000-4000-8000-000000000020",
    });

    expect(result).toEqual({ status: "ok", cell_revision: 2, version_no: 3 });
    expect(mocks.rpc).toHaveBeenCalledWith("save_experiment_value", {
      p_experiment_id: EXPERIMENT_ID,
      p_key_id: KEY_ID,
      p_expected_cell_revision: 1,
      p_value: 0.73,
      p_edit_session_id: "80000000-0000-4000-8000-000000000020",
    });
  });

  it("serializes a null Value as JSON null", async () => {
    vi.mocked(mocks.rpc).mockResolvedValue({
      data: { status: "ok", cell_revision: 3, version_no: 4 },
      error: null,
    });

    await saveValue({
      experimentId: EXPERIMENT_ID,
      keyId: KEY_ID,
      expectedCellRevision: 2,
      value: null,
      editSessionId: "80000000-0000-4000-8000-000000000020",
    });

    expect(mocks.rpc).toHaveBeenCalledWith(
      "save_experiment_value",
      expect.objectContaining({ p_value: null }),
    );
  });

  it("loads current Values for active Keys", async () => {
    vi.mocked(mocks.rpc).mockResolvedValue({ data: null, error: null });
    const values = await loadExperimentValues(EXPERIMENT_ID);
    expect(values).toBeInstanceOf(Map);
  });

  it("archives and restores through RPCs", async () => {
    vi.mocked(mocks.rpc).mockResolvedValue({ data: { status: "ok" }, error: null });
    await archiveExperiment(EXPERIMENT_ID);
    expect(mocks.rpc).toHaveBeenCalledWith("archive_experiment", {
      p_experiment_id: EXPERIMENT_ID,
    });
    await restoreExperimentVersion(EXPERIMENT_ID, 2);
    expect(mocks.rpc).toHaveBeenCalledWith("restore_experiment_version", {
      p_experiment_id: EXPERIMENT_ID,
      p_version_no: 2,
    });
  });
});
