"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Links open in a new tab and don't trigger edit mode; drop react-markdown's `node` prop.
const mdComponents = {
  a: ({ node, ...props }: { node?: unknown } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} />
  ),
};

/**
 * A reusable freeform text field: shows rendered Markdown when idle, and a
 * comfortable auto-growing editor on click. Saves on blur; Esc cancels;
 * Cmd/Ctrl+Enter saves. Used for every freeform field so they behave the same.
 */
export default function MarkdownField({
  value,
  onSave,
  onEditingChange,
  placeholder = "Click to edit — Markdown supported",
  minHeight = 76,
}: {
  value: string;
  onSave: (v: string) => void;
  onEditingChange?: (editing: boolean) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function autosize() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.max(minHeight, ta.scrollHeight)}px`;
  }
  useLayoutEffect(() => {
    if (editing) autosize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  function beginEditing() {
    setEditing(true);
    onEditingChange?.(true);
  }

  function commit() {
    setEditing(false);
    onEditingChange?.(false);
    const t = draft.replace(/\s+$/, "");
    if (t !== value) onSave(t);
  }

  if (editing) {
    return (
      <div className="md-editing">
        <textarea
          ref={taRef}
          className="md-textarea"
          value={draft}
          autoFocus
          style={{ minHeight }}
          onChange={(e) => {
            setDraft(e.target.value);
            autosize();
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
              onEditingChange?.(false);
            }
          }}
        />
        <div className="md-hint">Markdown supported · Esc to cancel · ⌘/Ctrl+Enter to save</div>
      </div>
    );
  }

  return (
    <div
      className={`md-view ${value ? "" : "placeholder"}`}
      role="button"
      tabIndex={0}
      title="Click to edit"
      onClick={beginEditing}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          beginEditing();
        }
      }}
    >
      {value ? (
        <div className="markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {value}
          </ReactMarkdown>
        </div>
      ) : (
        <span>{placeholder}</span>
      )}
    </div>
  );
}
