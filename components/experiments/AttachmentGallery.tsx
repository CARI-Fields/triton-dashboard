"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  deleteAttachment,
  updateAttachmentCaption,
  uploadAttachment,
  type AttachmentScope,
} from "@/lib/attachments/repository";
import type { Attachment } from "@/lib/types";

interface CommittedVisit {
  id: string;
  generation: number;
}

function AttachmentFigure({
  attachment,
  committedVisit,
  deleting,
  altFallback,
  onCaptionError,
  onChanged,
  onDelete,
  visitKey,
}: {
  attachment: Attachment;
  committedVisit: MutableRefObject<CommittedVisit>;
  deleting: boolean;
  altFallback: string;
  onCaptionError: (message: string) => void;
  onChanged: () => void;
  onDelete: () => void;
  visitKey: string;
}) {
  const mounted = useRef(false);
  const pendingVisit = useRef<CommittedVisit | null>(null);
  const [caption, setCaption] = useState(attachment.caption);
  const [savingCaption, setSavingCaption] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => setCaption(attachment.caption), [attachment.caption]);
  useLayoutEffect(() => {
    pendingVisit.current = null;
    setCaption(attachment.caption);
    setSavingCaption(false);
    // Reset only when a different attachment visit commits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitKey]);

  async function saveCaption() {
    if (caption === attachment.caption || pendingVisit.current) return;
    const operationVisit = committedVisit.current;
    pendingVisit.current = operationVisit;
    setSavingCaption(true);
    onCaptionError("");
    try {
      await updateAttachmentCaption(attachment.id, caption);
      if (mounted.current && committedVisit.current === operationVisit) {
        onChanged();
      }
    } catch (caught) {
      if (mounted.current && committedVisit.current === operationVisit) {
        onCaptionError(
          caught instanceof Error ? caught.message : "Could not update caption.",
        );
      }
    } finally {
      if (pendingVisit.current === operationVisit) {
        pendingVisit.current = null;
        if (mounted.current && committedVisit.current === operationVisit) {
          setSavingCaption(false);
        }
      }
    }
  }

  const attachmentName = attachment.caption || altFallback;

  return (
    <figure className="attachment-row">
      {/* Arbitrary Storage URLs have no known dimensions or fixed remote host. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <a
        className="attachment-preview"
        href={attachment.url}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${attachmentName}`}
      >
        <img
          src={attachment.url}
          alt={attachmentName}
          loading="lazy"
        />
        <span aria-hidden="true">Open</span>
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

export interface AttachmentGalleryProps {
  scope: AttachmentScope;
  visitKey: string;
  attachments: Attachment[];
  title: string;
  emptyMessage: string;
  altFallback: string;
  onChanged: () => void;
}

export default function AttachmentGallery({
  scope,
  visitKey,
  attachments,
  title,
  emptyMessage,
  altFallback,
  onChanged,
}: AttachmentGalleryProps) {
  const mounted = useRef(false);
  const committedIdentity = useRef({ id: visitKey, generation: 0 });
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
    if (committedIdentity.current.id !== visitKey) {
      committedIdentity.current = {
        id: visitKey,
        generation: committedIdentity.current.generation + 1,
      };
    }
    uploadPending.current = false;
    deletingIdsRef.current = new Set();
    setUploading(false);
    setDeletingIds(new Set());
    setError("");
  }, [visitKey]);

  async function upload(files: FileList) {
    if (uploadPending.current) return;
    const operationIdentity = committedIdentity.current;
    const operationScope = { ...scope };
    uploadPending.current = true;
    setUploading(true);
    setError("");
    try {
      let position = attachments.length
        ? Math.max(...attachments.map((attachment) => attachment.position)) + 1
        : 0;
      for (const file of Array.from(files)) {
        await uploadAttachment(operationScope, file, position);
        position += 1;
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
        if (mounted.current) {
          setUploading(false);
          onChanged();
        }
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
      await deleteAttachment(attachment);
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
        onChanged();
      }
    }
  }

  return (
    <div className="attachment-gallery" aria-busy={uploading}>
      <div className="attachment-actions">
        <strong>{title}</strong>
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
          aria-label={`Choose images for ${title}`}
          disabled={uploading}
          onChange={(event) => {
            if (event.target.files?.length) void upload(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {attachments.length === 0
        ? <p className="muted">{emptyMessage}</p>
        : (
          <div className="experiment-image-grid">
            {attachments.map((attachment) => (
              <AttachmentFigure
                key={attachment.id}
                attachment={attachment}
                committedVisit={committedIdentity}
                deleting={deletingIds.has(attachment.id)}
                altFallback={altFallback}
                onCaptionError={setError}
                onChanged={onChanged}
                onDelete={() => void remove(attachment)}
                visitKey={visitKey}
              />
            ))}
          </div>
        )}
    </div>
  );
}
