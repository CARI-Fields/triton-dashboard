export type WorkspaceSkeletonVariant =
  | "board"
  | "table"
  | "record"
  | "analytics";

export default function WorkspaceSkeleton({
  variant,
  label,
}: {
  variant: WorkspaceSkeletonVariant;
  label: string;
}) {
  return (
    <div
      className={`workspace-skeleton workspace-skeleton-${variant}`}
      role="status"
      aria-label={label}
    >
      <span className="sr-only">{label}</span>
      <div className="skeleton-visual" aria-hidden="true">
        <i className="skeleton-title" />
        <i className="skeleton-toolbar" />
        {variant === "board" ? (
          <div className="skeleton-board-columns">
            {Array.from({ length: 4 }, (_, column) => (
              <div className="skeleton-board-column" key={column}>
                <i />
                <i />
                <i />
              </div>
            ))}
          </div>
        ) : null}
        {variant === "table" ? (
          <div className="skeleton-table">
            {Array.from({ length: 7 }, (_, row) => <i key={row} />)}
          </div>
        ) : null}
        {variant === "record" ? (
          <div className="skeleton-record">
            <div>
              {Array.from({ length: 8 }, (_, row) => <i key={row} />)}
            </div>
            <aside>
              {Array.from({ length: 5 }, (_, row) => <i key={row} />)}
            </aside>
          </div>
        ) : null}
        {variant === "analytics" ? (
          <div className="skeleton-analytics">
            {Array.from({ length: 5 }, (_, item) => <i key={item} />)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
