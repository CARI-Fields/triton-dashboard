import TemplateExperimentCompare from "@/components/experiments/TemplateExperimentCompare";
import { parseCompareSearchParams } from "@/lib/templates/compare-url";
import { loadTemplateDraft } from "@/lib/templates/repository";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{
    template?: string | string[];
    baseline?: string | string[];
    archived?: string | string[];
    sort?: string | string[];
    filter?: string | string[];
    columns?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const templateId = Array.isArray(params.template)
    ? params.template[0]
    : params.template;
  let activeKeys: string[] = [];
  if (templateId) {
    const draft = await loadTemplateDraft(templateId);
    activeKeys = draft?.fields.flatMap((field) => field.keys)
      .map((key) => key.id!)
      .filter((id): id is string => id !== null) ?? [];
  }
  const initialState = parseCompareSearchParams(params, activeKeys);
  return <TemplateExperimentCompare initialState={initialState} />;
}
