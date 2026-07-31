import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TemplateManager from "@/components/templates/TemplateManager";
import type { TemplateSummary } from "@/lib/templates/repository";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  loadDraft: vi.fn(),
  save: vi.fn(),
  archive: vi.fn(),
  unarchive: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/templates/repository", () => ({
  listTemplateSummaries: mocks.list,
  loadTemplateDraft: mocks.loadDraft,
  saveTemplate: mocks.save,
  archiveTemplate: mocks.archive,
  unarchiveTemplate: mocks.unarchive,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const summaries: TemplateSummary[] = [{
  template: {
    id: "t1",
    name: "Benchmark A",
    description: "First",
    schema_revision: 2,
    archived_at: null,
    created_at: "2026-07-31T00:00:00.000Z",
    updated_at: "2026-07-31T00:00:00.000Z",
  },
  fieldCount: 1,
  keyCount: 2,
  experimentCount: 24,
}];

const draft = {
  templateId: "t1",
  name: "Benchmark A",
  description: "First",
  schemaRevision: 2,
  fields: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue(summaries);
  mocks.loadDraft.mockResolvedValue(draft);
});

afterEach(cleanup);

describe("TemplateManager", () => {
  it("lists Templates with key and experiment counts", async () => {
    render(<TemplateManager />);
    await screen.findByText("Benchmark A");
    expect(screen.getByText("2 keys")).not.toBeNull();
    expect(screen.getByText("24 experiments")).not.toBeNull();
  });

  it("opens the schema editor for a selected Template", async () => {
    render(<TemplateManager />);
    await screen.findByText("Benchmark A");
    fireEvent.click(screen.getByRole("option", { name: /Benchmark A/ }));
    await waitFor(() => expect(mocks.loadDraft).toHaveBeenCalledWith("t1"));
  });

  it("archives the selected Template after confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.archive.mockResolvedValue(undefined);
    render(<TemplateManager />);
    await screen.findByText("Benchmark A");
    fireEvent.click(screen.getByRole("option", { name: /Benchmark A/ }));
    await screen.findByText(/Schema editor arrives/);
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(mocks.archive).toHaveBeenCalledWith("t1"));
    expect(confirmSpy).toHaveBeenCalled();
  });
});
