// components/ui/Feedback.tsx
"use client";

import { NonIdealState, Callout, Button, Card } from "@blueprintjs/core";
import type { ReactElement } from "react";

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="bp6-skeleton" style={{ height: "1em", marginBottom: "0.25em" }} />
      ))}
    </div>
  );
}

export function EmptyState({ title, action }: { title: string; action?: ReactElement }) {
  return <NonIdealState title={title} action={action} />;
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Callout intent="danger" title="Something went wrong">
      <p>{message}</p>
      {onRetry && (
        <Button small intent="primary" text="Retry" onClick={onRetry} />
      )}
    </Callout>
  );
}

export type SaveState = "saved" | "unsaved" | "conflict";

export function SaveBar({
  state,
  onSave,
  onDiscard,
}: {
  state: SaveState;
  onSave?: () => void;
  onDiscard?: () => void;
}) {
  const label =
    state === "unsaved" ? "Unsaved changes" : state === "conflict" ? "Remote conflict — load latest" : "All changes saved";
  return (
    <Card className="save-bar">
      <span className="save-state">{label}</span>
      <div>
        {state !== "saved" && onDiscard && (
          <Button small text="Discard" onClick={onDiscard} />
        )}
        {state === "unsaved" && onSave && (
          <Button small intent="primary" text="Save" onClick={onSave} />
        )}
        {state === "conflict" && onDiscard && (
          <Button small intent="primary" text="Load latest" onClick={onDiscard} />
        )}
      </div>
    </Card>
  );
}
