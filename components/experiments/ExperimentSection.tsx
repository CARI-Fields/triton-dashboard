export default function ExperimentSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="experiment-section"
      aria-labelledby={`${id}-title`}
    >
      <div className="experiment-section-heading">
        <h2 id={`${id}-title`}>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="experiment-section-body">{children}</div>
    </section>
  );
}
