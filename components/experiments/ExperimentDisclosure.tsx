export default function ExperimentDisclosure({
  title,
  summary,
  actionLabel = "Edit",
  children,
}: {
  title: string;
  summary: string;
  actionLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="experiment-disclosure">
      <summary>
        <span className="experiment-disclosure-copy">
          <strong>{title}</strong>
          <span>{summary}</span>
        </span>
        <span className="experiment-disclosure-action" aria-hidden="true">
          <span className="experiment-disclosure-closed">{actionLabel}</span>
          <span className="experiment-disclosure-open">Close</span>
        </span>
      </summary>
      <div className="experiment-disclosure-body">{children}</div>
    </details>
  );
}
