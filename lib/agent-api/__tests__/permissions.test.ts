import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent-api/server", () => ({
  getServerSupabase: vi.fn(),
}));

import {
  requireAttachmentCollaboration,
  requireExperimentCollaboration,
  requireScope,
  requireTaskCollaboration,
} from "@/lib/agent-api/permissions";
import { getServerSupabase } from "@/lib/agent-api/server";
import type { AgentContext } from "@/lib/agent-api/types";

const TASK_ID = "30000000-0000-4000-8000-000000000001";
const MEMBER_ID = "20000000-0000-4000-8000-000000000001";
const EXPERIMENT_ID = "60000000-0000-4000-8000-000000000001";
const ATTACHMENT_ID = "70000000-0000-4000-8000-000000000001";
const OTHER_TASK_ID = "30000000-0000-4000-8000-000000000099";

const context: AgentContext = {
  apiKeyId: "40000000-0000-4000-8000-000000000001",
  keyPrefix: "tb_live_abcdefgh",
  memberId: MEMBER_ID,
  memberName: "Bruce",
  scopes: new Set(["board:read"]),
  expiresAt: null,
};

function selectClient(
  table: string,
  result: { data: unknown; error: { message: string } | null },
) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const from = vi.fn((actual: string) => {
    expect(actual).toBe(table);
    return query;
  });
  return {
    client: { from } as unknown as SupabaseClient,
    from,
    query,
  };
}

describe("Agent API permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a missing scope", () => {
    expect(() => requireScope(context, "tasks:write")).toThrowError(
      expect.objectContaining({
        status: 403,
        code: "SCOPE_FORBIDDEN",
        message: "Missing scope: tasks:write",
      }),
    );
  });

  it("allows a present scope", () => {
    expect(() => requireScope(context, "board:read")).not.toThrow();
  });

  it("requires assignment by both Task and current Member UUID", async () => {
    const { client, query } = selectClient("task_assignees", {
      data: { task_id: TASK_ID },
      error: null,
    });
    vi.mocked(getServerSupabase).mockReturnValue(client);

    await expect(requireTaskCollaboration(context, TASK_ID))
      .resolves.toBeUndefined();
    expect(query.select).toHaveBeenCalledWith("task_id");
    expect(query.eq).toHaveBeenNthCalledWith(1, "task_id", TASK_ID);
    expect(query.eq).toHaveBeenNthCalledWith(2, "member_id", MEMBER_ID);
  });

  it("returns 403 when the current Member is not assigned", async () => {
    const { client } = selectClient("task_assignees", {
      data: null,
      error: null,
    });
    vi.mocked(getServerSupabase).mockReturnValue(client);

    await expect(requireTaskCollaboration(context, TASK_ID))
      .rejects.toMatchObject({
        status: 403,
        code: "TASK_SCOPE_FORBIDDEN",
      });
  });

  it("does not disguise a Task permission query failure as forbidden", async () => {
    const { client } = selectClient("task_assignees", {
      data: null,
      error: { message: "database unavailable" },
    });
    vi.mocked(getServerSupabase).mockReturnValue(client);

    await expect(requireTaskCollaboration(context, TASK_ID))
      .rejects.toEqual(expect.not.objectContaining({ status: 403 }));
  });

  it("resolves an Experiment's Task from the database before collaboration", async () => {
    const experiment = selectClient("experiments", {
      data: { task_id: TASK_ID },
      error: null,
    });
    const assignment = selectClient("task_assignees", {
      data: { task_id: TASK_ID },
      error: null,
    });
    const from = vi.fn()
      .mockImplementationOnce(experiment.from)
      .mockImplementationOnce(assignment.from);
    vi.mocked(getServerSupabase).mockReturnValue({
      from,
    } as unknown as SupabaseClient);

    await expect(requireExperimentCollaboration(context, EXPERIMENT_ID))
      .resolves.toBe(TASK_ID);
    expect(experiment.query.select).toHaveBeenCalledWith("task_id");
    expect(experiment.query.eq).toHaveBeenCalledWith("id", EXPERIMENT_ID);
    expect(assignment.query.eq).toHaveBeenCalledWith("task_id", TASK_ID);
  });

  it("returns 404 when the Experiment resource is missing", async () => {
    const { client } = selectClient("experiments", {
      data: null,
      error: null,
    });
    vi.mocked(getServerSupabase).mockReturnValue(client);

    await expect(requireExperimentCollaboration(context, EXPERIMENT_ID))
      .rejects.toMatchObject({
        status: 404,
        code: "EXPERIMENT_NOT_FOUND",
      });
  });

  it("does not disguise an Experiment lookup failure as missing", async () => {
    const { client } = selectClient("experiments", {
      data: null,
      error: { message: "query denied" },
    });
    vi.mocked(getServerSupabase).mockReturnValue(client);

    await expect(requireExperimentCollaboration(context, EXPERIMENT_ID))
      .rejects.toEqual(expect.not.objectContaining({ status: 404 }));
  });

  it("resolves a linked Attachment through its database Experiment", async () => {
    const attachment = selectClient("attachments", {
      data: {
        task_id: OTHER_TASK_ID,
        experiment_id: EXPERIMENT_ID,
        experiment: { task_id: TASK_ID },
      },
      error: null,
    });
    const assignment = selectClient("task_assignees", {
      data: { task_id: TASK_ID },
      error: null,
    });
    const from = vi.fn()
      .mockImplementationOnce(attachment.from)
      .mockImplementationOnce(assignment.from);
    vi.mocked(getServerSupabase).mockReturnValue({
      from,
    } as unknown as SupabaseClient);

    await expect(requireAttachmentCollaboration(context, ATTACHMENT_ID))
      .resolves.toBe(TASK_ID);
    expect(attachment.query.select).toHaveBeenCalledWith(
      "task_id,experiment_id,experiment:experiments(task_id)",
    );
    expect(attachment.query.eq).toHaveBeenCalledWith("id", ATTACHMENT_ID);
    expect(assignment.query.eq).toHaveBeenCalledWith("task_id", TASK_ID);
    expect(assignment.query.eq).not.toHaveBeenCalledWith(
      "task_id",
      OTHER_TASK_ID,
    );
  });

  it("resolves a direct legacy Attachment from its own database Task", async () => {
    const attachment = selectClient("attachments", {
      data: {
        task_id: TASK_ID,
        experiment_id: null,
        experiment: null,
      },
      error: null,
    });
    const assignment = selectClient("task_assignees", {
      data: { task_id: TASK_ID },
      error: null,
    });
    const from = vi.fn()
      .mockImplementationOnce(attachment.from)
      .mockImplementationOnce(assignment.from);
    vi.mocked(getServerSupabase).mockReturnValue({
      from,
    } as unknown as SupabaseClient);

    await expect(requireAttachmentCollaboration(context, ATTACHMENT_ID))
      .resolves.toBe(TASK_ID);
    expect(assignment.query.eq).toHaveBeenCalledWith("task_id", TASK_ID);
  });

  it("fails safely when a linked Attachment has no Experiment relation", async () => {
    const { client } = selectClient("attachments", {
      data: {
        task_id: TASK_ID,
        experiment_id: EXPERIMENT_ID,
        experiment: null,
      },
      error: null,
    });
    vi.mocked(getServerSupabase).mockReturnValue(client);

    await expect(requireAttachmentCollaboration(context, ATTACHMENT_ID))
      .rejects.toMatchObject({
        name: "Error",
        message: "Attachment parent relationship is invalid.",
      });
  });

  it("returns 404 when the Attachment resource is missing", async () => {
    const { client } = selectClient("attachments", {
      data: null,
      error: null,
    });
    vi.mocked(getServerSupabase).mockReturnValue(client);

    await expect(requireAttachmentCollaboration(context, ATTACHMENT_ID))
      .rejects.toMatchObject({
        status: 404,
        code: "ATTACHMENT_NOT_FOUND",
      });
  });

  it("does not disguise an Attachment lookup failure as missing", async () => {
    const { client } = selectClient("attachments", {
      data: null,
      error: { message: "query denied" },
    });
    vi.mocked(getServerSupabase).mockReturnValue(client);

    await expect(requireAttachmentCollaboration(context, ATTACHMENT_ID))
      .rejects.toEqual(expect.not.objectContaining({ status: 404 }));
  });

  it("returns 403 when the linked Attachment Task is not assigned", async () => {
    const attachment = selectClient("attachments", {
      data: {
        task_id: OTHER_TASK_ID,
        experiment_id: EXPERIMENT_ID,
        experiment: { task_id: TASK_ID },
      },
      error: null,
    });
    const assignment = selectClient("task_assignees", {
      data: null,
      error: null,
    });
    const from = vi.fn()
      .mockImplementationOnce(attachment.from)
      .mockImplementationOnce(assignment.from);
    vi.mocked(getServerSupabase).mockReturnValue({
      from,
    } as unknown as SupabaseClient);

    await expect(requireAttachmentCollaboration(context, ATTACHMENT_ID))
      .rejects.toMatchObject({
        status: 403,
        code: "TASK_SCOPE_FORBIDDEN",
      });
    expect(assignment.query.eq).toHaveBeenCalledWith("task_id", TASK_ID);
  });
});
