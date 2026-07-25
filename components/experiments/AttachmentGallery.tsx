"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  deleteExperimentAttachment,
  updateExperimentAttachment,
  uploadExperimentAttachment,
} from "@/lib/experiments/repository";
import type { Attachment, Experiment } from "@/lib/types";

function AttachmentFigure({
  attachment,
  deleting,
  onCaptionError,
  onChanged,
  onDelete,
}: {
  attachment: Attachment;
  deleting: boolean;
  onCaptionError: (message: string) => void;
  onChanged: () => void;
  onDelete: () => void;
}) {
  const mounted = useRef(false);
  const captionPending = useRef(false);
  const [caption, setCaption] = useState(attachment.caption);
  const [savingCaption, setSavingCaption] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => setCaption(attachment.caption), [attachment.caption]);

  async function saveCaption() {
    if (caption === attachment.caption || captionPending.current) return;
    captionPending.current = true;
    setSavingCaption(true);
    onCaptionError("");
    try {
      await updateExperimentAttachment(attachment.id, caption);
      if (mounted.current) onChanged();
    } catch (caught) {
      if (mounted.current) {
        onCaptionError(
          caught instanceof Error ? caught.message : "Could not update caption.",
        );
      }
    } finally {
      captionPending.current = false;
      if (mounted.current) setSavingCaption(false);
    }
  }

  return (
    <figure>
      {/* Arbitrary Storage URLs have no known dimensions or fixed remote host. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <a href={attachment.url} target="_blank" rel="noreferrer">
        <img
          src={attachment.url}
          alt={attachment.caption || "Experiment plot"}
          loading="lazy"
        />
      </a>
      <figcaption>
        <input
          aria-label={`Caption for ${attachment.caption || "plot"}`}
          value={caption}
          placeholder="Add a caption"
          disabled={savingCaption || deleting}
          onChange={(event) => setCaption(event.target.value)}
          onBlur={() => void saveCaption()}
        />
        <button
          type="button"
          className="icon-btn"
          aria-label="Delete image"
          disabled={savingCaption || deleting}
          onClick={onDelete}
        >
          ×
        </button>
      </figcaption>
    </figure>
  );
}

export default function AttachmentGallery({
  experiment,
  attachments,
  onChanged,
}: {
  experiment: Experiment;
  attachments: Attachment[];
  onChanged: () => void;
}) {
  const mounted = useRef(false);
  const committedIdentity = useRef({ id: experiment.id, generation: 0 });
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadPending = useRef(false);
  const deletingIdsRef = useRef<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (committedIdentity.current.id !== experiment.id) {
      committedIdentity.current = {
        id: experiment.id,
        generation: committedIdentity.current.generation + 1,
      };
    }
    uploadPending.current = false;
    deletingIdsRef.current = new Set();
    setUploading(false);
    setDeletingIds(new Set());
    setError("");
  }, [experiment.id]);

  async function upload(files: FileList) {
    if (uploadPending.current) return;
    const operationIdentity = committedIdentity.current;
    uploadPending.current = true;
    setUploading(true);
    setError("");
    try {
      let position = attachments.length
        ? Math.max(...attachments.map((attachment) => attachment.position)) + 1
        : 0;
      for (const file of Array.from(files)) {
        await uploadExperimentAttachment(experiment, file, position);
        position += 1;
      }
      if (
        mounted.current &&
        committedIdentity.current === operationIdentity
      ) {
        onChanged();
      }
    } catch (caught) {
      if (
        mounted.current &&
        committedIdentity.current === operationIdentity
      ) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not upload the attachment.",
        );
      }
    } finally {
      if (committedIdentity.current === operationIdentity) {
        uploadPending.current = false;
        if (mounted.current) setUploading(false);
      }
    }
  }

  async function remove(attachment: Attachment) {
    if (
      deletingIdsRef.current.has(attachment.id) ||
      !window.confirm("Delete this image? This removes the Storage object.")
    ) {
      return;
    }
    const operationIdentity = committedIdentity.current;
    deletingIdsRef.current.add(attachment.id);
    setDeletingIds((current) => new Set(current).add(attachment.id));
    setError("");
    try {
      await deleteExperimentAttachment(attachment);
      if (
        mounted.current &&
        committedIdentity.current === operationIdentity
      ) {
        onChanged();
      }
    } catch (caught) {
      if (
        mounted.current &&
        committedIdentity.current === operationIdentity
      ) {
        setError(
          caught instanceof Error ? caught.message : "Could not delete image.",
        );
      }
    } finally {
      if (committedIdentity.current !== operationIdentity) return;
      deletingIdsRef.current.delete(attachment.id);
      if (mounted.current) {
        setDeletingIds((current) => {
          const next = new Set(current);
          next.delete(attachment.id);
          return next;
        });
      }
    }
  }

  return (
    <div className="attachment-gallery" aria-busy={uploading}>
      <div className="attachment-actions">
        <strong>Plots &amp; images</strong>
        <button
          type="button"
          className="btn"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
        >
          {uploading ? "Uploading…" : "Upload images"}
        </button>
        <input
          ref={fileInput}
          hidden
          multiple
          type="file"
          accept="image/*"
          aria-label="Choose plot images"
          disabled={uploading}
          onChange={(event) => {
            if (event.target.files?.length) void upload(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {attachments.length === 0
        ? <p className="muted">No plots or images attached.</p>
        : (
          <div className="experiment-image-grid">
            {attachments.map((attachment) => (
              <AttachmentFigure
                key={`${experiment.id}-${attachment.id}`}
                attachment={attachment}
                deleting={deletingIds.has(attachment.id)}
                onCaptionError={setError}
                onChanged={onChanged}
                onDelete={() => void remove(attachment)}
              />
            ))}
          </div>
        )}
    </div>
  );
}
