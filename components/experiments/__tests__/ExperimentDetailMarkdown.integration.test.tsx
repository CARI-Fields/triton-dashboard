import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExperimentDetail from "@/components/experiments/ExperimentDetail";
import {
  clearSessionExperimentDraft,
  getSessionExperimentDraftStorage,
} from "@/lib/experiments/draft";
import {
  loadExperimentBundle,
  watchExperiment,
} from "@/lib/experiments/repository";
import type { Experiment, Member } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/experiments/repository", () => ({
  deleteExperiment: vi.fn(),
  loadExperimentBundle: vi.fn(),
  updateExperiment: vi.fn(),
  watchExperiment: vi.fn(() => vi.fn()),
}));

vi.mock("@/components/experiments/AttachmentGallery", () => ({
  default: () => null,
}));
vi.mock("@/components/experiments/BaselinePicker", () => ({
  default: () => null,
}));
vi.mock("@/components/experiments/BaselineSummary", () => ({
  default: () => null,
}));
vi.mock("@/components/experiments/ConfigEditor", () => ({
  default: () => null,
}));
vi.mock("@/components/experiments/DataEditor", () => ({
  default: () => null,
}));
vi.mock("@/components/experiments/DecisionEditor", () => ({
  default: () => null,
}));
vi.mock("@/components/experiments/DuplicateExperimentDialog", () => ({
  default: () => null,
}));
vi.mock("@/components/experiments/EnvironmentEditor", () => ({
  default: () => null,
}));
vi.mock("@/components/experiments/ExperimentSection", () => ({
  default: ({ children, title }: { children: ReactNode; title: string }) => (
    <section aria-label={title}>{children}</section>
  ),
}));
vi.mock("@/components/experiments/ExperimentStatusBadge", () => ({
  default: ({ status }: { status: string }) => <span>{status}</span>,
}));
vi.mock("@/components/experiments/ExperimentTimeline", () => ({
  default: () => null,
}));
vi.mock("@/components/experiments/ObjectEditor", () => ({
  default: () => null,
}));
vi.mock("@/components/experiments/ResultEditor", () => ({
  default: () => null,
}));

const member = {
  id: "00000000-0000-4000-8000-000000000020",
  name: "Bruce",
  initials: "BX",
  position: 0,
  created_at: "2026-07-24T00:00:00.000Z",
} satisfies Member;

const current = {
  id: "00000000-0000-4000-8000-000000000091",
  experiment_no: 91,
  task_id: "00000000-0000-4000-8000-000000000010",
  owner_id: member.id,
  name: "Markdown run",
  status: "planned",
  baseline_experiment_id: null,
  data_spec: { datasets: [] },
  object_spec: {
    model: "",
    harness: "",
    parent_harness: "",
    prompt: "",
    prompt_change: "",
    skills: [],
    tools: [],
  },
  environment_spec: {
    platform: "",
    server: "",
    devices: [],
    hardware: "",
    evaluator: "",
    revision: "",
    precision_policy: "",
  },
  config: {},
  metrics: {},
  featured_metric_keys: [],
  result_summary: "",
  decision_outcome: null,
  decision_notes: "",
  notes: "",
  position: 0,
  started_at: null,
  completed_at: null,
  created_at: "2026-07-24T00:00:00.000Z",
  updated_at: "2026-07-24T01:00:00.000Z",
} satisfies Experiment;

function currentBundle() {
  return {
    experiment: current,
    task: {
      id: current.task_id,
      title: "Optimize conv2d",
    },
    owner: member,
    baseline: null,
    members: [member],
    candidates: [],
    attachments: [],
    activity: [],
  };
}

describe("ExperimentDetail Markdown draft integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.sessionStorage.clear();
    clearSessionExperimentDraft(
      getSessionExperimentDraftStorage(),
      current.id,
    );
    vi.mocked(loadExperimentBundle).mockResolvedValue(currentBundle());
    vi.mocked(watchExperiment).mockReturnValue(vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("restores text typed into the real MarkdownField before blur after remount", async () => {
    const firstVisit = render(<ExperimentDetail id={current.id} />);
    fireEvent.click(await screen.findByRole("button", {
      name: "Observations, caveats, links, and follow-up ideas",
    }));
    const editor = firstVisit.container.querySelector(".md-textarea");
    expect(editor).not.toBeNull();
    fireEvent.change(editor!, {
      target: { value: "Keystroke-safe **Markdown**" },
    });
    firstVisit.unmount();

    render(<ExperimentDetail id={current.id} />);

    expect(await screen.findByText("Markdown", { selector: "strong" })).toBeDefined();
    expect(screen.getByText("Unsaved changes")).toBeDefined();
  });
});
