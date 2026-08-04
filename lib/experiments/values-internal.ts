import type {
  ExperimentValue,
  TemplateValueType,
} from "@/lib/types";
import type { TypedValue } from "@/lib/experiments/values";

export function typedValueFromRow(
  row: ExperimentValue,
  type: TemplateValueType,
  optionIds: string[],
  attachmentIds: string[],
): TypedValue | null {
  switch (type) {
    case "short_text":
      return row.text_value === null ? null : { kind: "short_text", text: row.text_value };
    case "long_text":
      return row.text_value === null ? null : { kind: "long_text", text: row.text_value };
    case "url":
      return row.text_value === null ? null : { kind: "url", url: row.text_value };
    case "number":
      return row.number_value === null ? null : { kind: "number", number: row.number_value };
    case "boolean":
      return row.boolean_value === null ? null : { kind: "boolean", boolean: row.boolean_value };
    case "date_time":
      return row.datetime_value === null ? null : { kind: "date_time", datetime: row.datetime_value };
    case "single_select":
      return row.option_id === null ? null : { kind: "single_select", optionId: row.option_id };
    case "multi_select":
      return { kind: "multi_select", optionIds };
    case "attachment":
      return { kind: "attachment", attachmentIds };
  }
}
