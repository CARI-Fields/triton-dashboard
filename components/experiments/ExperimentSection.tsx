export default function ExperimentSection({
  id,
  title,
  description,
  tone = "canvas",
  children,
}: {
  id: string;
  title: string;
  description?: string;
  tone?: "canvas" | "subtle";
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={`experiment-section experiment-section-${tone}`}
      aria-labelledby={`${id}-title`}
    >
      <div className="experiment-section-heading">
        <h2 id={`${id}-title`}>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="experiment-section-body">{children}</div>
    </section>
  );
}
