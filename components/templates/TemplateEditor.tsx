// Temporary stub for Task 4; replaced in Task 5.
import type { TemplateDraft } from "@/lib/templates/repository";

export default function TemplateEditor(_props: {
  draft: TemplateDraft;
  experimentCount: number;
  onPersist: (draft: TemplateDraft) => Promise<void>;
  readOnly: boolean;
}) {
  return <p className="template-empty">Schema editor arrives in the next task.</p>;
}
