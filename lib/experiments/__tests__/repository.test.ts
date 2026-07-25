import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Attachment, Experiment } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  attachmentDeleteEq: vi.fn(),
  attachmentInsert: vi.fn(),
  storageGetPublicUrl: vi.fn(),
  storageRemove: vi.fn(),
  storageUpload: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "attachments") {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        delete: () => ({ eq: mocks.attachmentDeleteEq }),
        insert: mocks.attachmentInsert,
      };
    },
    storage: {
      from: () => ({
        getPublicUrl: mocks.storageGetPublicUrl,
        remove: mocks.storageRemove,
        upload: mocks.storageUpload,
      }),
    },
  },
}));

import {
  deleteExperimentAttachment,
  uploadExperimentAttachment,
} from "@/lib/experiments/repository";

const experiment = {
  id: "00000000-0000-4000-8000-000000000001",
  task_id: "00000000-0000-4000-8000-000000000010",
} as Experiment;

const attachment = {
  id: "00000000-0000-4000-8000-000000000100",
  path: "task/experiment/image.png",
} as Attachment;

describe("experiment attachment consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storageUpload.mockResolvedValue({ error: null });
    mocks.storageGetPublicUrl.mockReturnValue({
      data: { publicUrl: "https://example.test/image.png" },
    });
  });

  it("removes an uploaded object when the attachment insert fails", async () => {
    mocks.attachmentInsert.mockResolvedValue({
      error: { message: "insert failed" },
    });
    mocks.storageRemove.mockResolvedValue({ error: null });

    await expect(
      uploadExperimentAttachment(experiment, new File(["plot"], "plot.png"), 0),
    ).rejects.toThrow("insert failed");

    const uploadedPath = mocks.storageUpload.mock.calls[0][0] as string;
    expect(mocks.storageRemove).toHaveBeenCalledWith([uploadedPath]);
  });

  it("reports both failures when insert compensation also fails", async () => {
    mocks.attachmentInsert.mockResolvedValue({
      error: { message: "insert failed" },
    });
    mocks.storageRemove.mockResolvedValue({
      error: { message: "cleanup failed" },
    });

    await expect(
      uploadExperimentAttachment(experiment, new File(["plot"], "plot.png"), 0),
    ).rejects.toThrow(
      "Attachment insert failed: insert failed; Storage cleanup failed: cleanup failed",
    );
  });

  it("deletes the database row before removing its Storage object", async () => {
    mocks.attachmentDeleteEq.mockResolvedValue({ error: null });
    mocks.storageRemove.mockResolvedValue({ error: null });

    await deleteExperimentAttachment(attachment);

    expect(mocks.attachmentDeleteEq).toHaveBeenCalledWith("id", attachment.id);
    expect(
      mocks.attachmentDeleteEq.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.storageRemove.mock.invocationCallOrder[0]);
  });

  it("reports a Storage failure after the attachment row is deleted", async () => {
    mocks.attachmentDeleteEq.mockResolvedValue({ error: null });
    mocks.storageRemove.mockResolvedValue({
      error: { message: "cleanup failed" },
    });

    await expect(deleteExperimentAttachment(attachment)).rejects.toThrow(
      "Attachment record was deleted, but Storage cleanup failed: cleanup failed",
    );
  });
});
