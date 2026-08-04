"use client";

import { useState } from "react";
import ValueEditor, {
  type CommitOutcome,
} from "@/components/experiments/ValueEditor";
import type { TemplateFieldDraft } from "@/lib/templates/repository";
import type { TypedValue } from "@/lib/experiments/values";

export interface CellState {
  value: TypedValue | null;
  cellRevision: number;
}

export default function TemplateFieldTables({
  fields,
  values,
  readOnly,
  onCommit,
}: {
  fields: TemplateFieldDraft[];
  values: Map<string, CellState>;
  readOnly: boolean;
  onCommit: (
    keyId: string,
    keyType: TemplateFieldDraft["keys"][number]["valueType"],
    value: TypedValue | null,
    expectedCellRevision: number,
  ) => Promise<CommitOutcome>;
}) {
  const [outcomes, setOutcomes] = useState<Record<string, CommitOutcome>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function commit(
    keyId: string,
    value: TypedValue | null,
    expectedCellRevision: number,
  ) {
    setOutcomes((current) => ({ ...current, [keyId]: "saving" }));
    const key = fields.flatMap((field) => field.keys).find((candidate) => candidate.id === keyId);
    if (!key) return;
    const outcome = await onCommit(keyId, key.valueType, value, expectedCellRevision);
    setOutcomes((current) => ({ ...current, [keyId]: outcome }));
    if (outcome !== "error" && outcome !== "conflict") {
      setErrors((current) => ({ ...current, [keyId]: "" }));
    }
  }

  return (
    <div className="template-field-tables">
      {fields.map((field) => (
        <section
          key={field.id ?? `new-field-${field.position}`}
          className="template-field-table"
          aria-labelledby={`field-${field.id}-title`}
        >
          <h2
            id={`field-${field.id}-title`}
            className={`template-field-table-title token-${field.colorToken}`}
          >
            {field.label}
          </h2>
          <table className="template-field-values">
            <tbody>
              {field.keys.map((key) => {
                const state = key.id ? values.get(key.id) : undefined;
                const missing = state?.value === undefined || state.value === null;
                return (
                  <tr key={key.id ?? `new-key-${key.position}`}>
                    <th scope="row">
                      {key.key}
                      {key.required && missing ? (
                        <span className="required-marker" aria-label="Required value missing">*</span>
                      ) : null}
                    </th>
                    <td>
                      {key.valueType === "attachment" ? (
                        <AttachmentCell
                          keyId={key.id!}
                          label={key.key}
                          value={state?.value?.kind === "attachment"
                            ? state.value.attachmentIds
                            : []}
                          readOnly={readOnly}
                        />
                      ) : (
                        <ValueEditor
                          keyDef={key}
                          options={key.options}
                          value={state?.value ?? null}
                          cellRevision={state?.cellRevision ?? 0}
                          disabled={readOnly}
                          onCommit={(value, revision) => void commit(key.id!, value, revision)}
                          outcome={outcomes[key.id ?? ""] ?? "idle"}
                          error={errors[key.id ?? ""] ?? ""}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function AttachmentCell({
  label,
  value,
  readOnly,
}: {
  keyId: string;
  label: string;
  value: string[];
  readOnly: boolean;
}) {
  return (
    <span className="value-editor">
      <span aria-label={`Value for ${label}`}>
        {value.length === 0 ? "—" : `${value.length} attachment${value.length === 1 ? "" : "s"}`}
      </span>
      {!readOnly ? <button type="button" className="btn ghost small">Manage attachments</button> : null}
    </span>
  );
}
