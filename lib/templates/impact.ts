import type { TemplateDraft, TemplateKeyDraft } from "@/lib/templates/repository";

function currentKeyMap(draft: TemplateDraft): Map<string | null, TemplateKeyDraft> {
  const map = new Map<string | null, TemplateKeyDraft>();
  for (const field of draft.fields) {
    for (const key of field.keys) {
      if (key.id) map.set(key.id, key);
    }
  }
  return map;
}

export function describeTemplateImpact(
  current: TemplateDraft,
  next: TemplateDraft,
  experimentCount: number,
): string[] {
  const lines: string[] = [];
  const previous = currentKeyMap(current);

  for (const field of next.fields) {
    for (const key of field.keys) {
      if (key.archived) continue;
      if (!key.id || !previous.has(key.id)) {
        lines.push(
          `Adding ${key.key.trim() || "the new key"} creates an empty Key for ${experimentCount} existing Experiments.`,
        );
        continue;
      }
      const before = previous.get(key.id)!;
      if (!before.archived && key.valueType !== before.valueType) {
        lines.push(
          `${key.key.trim() || "The new key"} changes Value Type to ${key.valueType}.`,
        );
      }
    }
  }

  for (const field of current.fields) {
    for (const key of field.keys) {
      const after = next.fields
        .flatMap((candidate) => candidate.keys)
        .find((candidate) => candidate.id === key.id);
      if (!key.archived && after?.archived) {
        lines.push(
          `Archiving ${key.key.trim() || "the key"} hides it from ${experimentCount} existing Experiments.`,
        );
      }
    }
  }

  return lines;
}
