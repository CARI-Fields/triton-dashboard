import { supabase } from "@/lib/supabase";
import type { Attachment } from "@/lib/types";

export interface AttachmentScope {
  taskId: string;
  experimentId: string | null;
}

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function uploadAttachment(
  scope: AttachmentScope,
  file: File,
  position: number,
): Promise<void> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const parent = scope.experimentId ?? "task";
  const path =
    `${scope.taskId}/${parent}/${crypto.randomUUID()}-${safeName}`;
  const storage = client().storage.from("task-images");
  const upload = await storage.upload(path, file, { upsert: false });
  throwIfError(upload.error);
  const { data: publicUrl } = storage.getPublicUrl(path);
  const { error } = await client().from("attachments").insert({
    task_id: scope.taskId,
    experiment_id: scope.experimentId,
    url: publicUrl.publicUrl,
    path,
    caption: "",
    position,
  });
  if (!error) return;

  const cleanup = await storage.remove([path]);
  if (cleanup.error) {
    throw new Error(
      `Attachment insert failed: ${error.message}; `
      + `Storage cleanup failed: ${cleanup.error.message}`,
    );
  }
  throw new Error(error.message);
}

export async function updateAttachmentCaption(
  attachmentId: string,
  caption: string,
): Promise<void> {
  const { error } = await client()
    .from("attachments")
    .update({ caption })
    .eq("id", attachmentId);
  throwIfError(error);
}

export async function deleteAttachment(
  attachment: Attachment,
): Promise<void> {
  const { error } = await client()
    .from("attachments")
    .delete()
    .eq("id", attachment.id);
  throwIfError(error);
  if (!attachment.path) return;

  const cleanup = await client()
    .storage.from("task-images")
    .remove([attachment.path]);
  if (cleanup.error) {
    throw new Error(
      "Attachment record was deleted, but Storage cleanup failed: "
      + cleanup.error.message,
    );
  }
}
