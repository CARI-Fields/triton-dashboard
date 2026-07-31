import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ExperimentVersionDrawer from "@/components/experiments/ExperimentVersionDrawer";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  restore: vi.fn(),
}));

vi.mock("@/lib/experiments/values", () => ({
  listExperimentVersions: mocks.list,
  restoreExperimentVersion: mocks.restore,
}));

afterEach(cleanup);

describe("ExperimentVersionDrawer", () => {
  it("groups versions into sessions and restores on demand", async () => {
    mocks.list.mockResolvedValue([
      {
        id: "v2",
        version_no: 2,
        reason: "Value edited",
        source: "browser",
        edit_session_id: "s1",
        template_schema_revision: 2,
        created_at: "2026-07-31T10:00:00.000Z",
      },
      {
        id: "v1",
        version_no: 1,
        reason: "Value edited",
        source: "browser",
        edit_session_id: "s1",
        template_schema_revision: 2,
        created_at: "2026-07-31T09:59:00.000Z",
      },
    ]);
    mocks.restore.mockResolvedValue({ status: "ok", version_no: 3, core_revision: 4 });
    render(
      <ExperimentVersionDrawer
        experimentId="exp-1"
        open
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Session 1/ }));
    await screen.findByText("v2");
    expect(screen.getAllByText(/Session/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Restore version 2" }));
    expect(mocks.restore).toHaveBeenCalledWith("exp-1", 2);
  });
});
