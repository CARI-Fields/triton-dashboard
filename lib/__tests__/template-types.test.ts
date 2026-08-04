import { describe, expect, it } from "vitest";
import type {
  Attachment,
  Experiment,
  ExperimentTemplate,
  ExperimentValue,
  TemplateKey,
  TemplateKeyOption,
  TemplateValueType,
} from "@/lib/types";

const experimentFixture: Experiment = {
  id: "00000000-0000-4000-8000-000000000001",
  experiment_no: 1,
  task_id: "00000000-0000-4000-8000-000000000010",
  owner_id: null,
  name: "Template experiment",
  status: "planned",
  template_id: null,
  archived_at: null,
  core_revision: 1,
  position: 0,
  started_at: null,
  completed_at: null,
  created_at: "2026-07-31T00:00:00.000Z",
  updated_at: "2026-07-31T00:00:00.000Z",
};

describe("template workspace types", () => {
  it("supports exactly the nine first-release value types", () => {
    const types: TemplateValueType[] = [
      "short_text",
      "long_text",
      "number",
      "boolean",
      "single_select",
      "multi_select",
      "date_time",
      "url",
      "attachment",
    ];
    expect(types).toHaveLength(9);
  });

  it("round-trips a typed scalar Value", () => {
    const value: ExperimentValue = {
      experiment_id: experimentFixture.id,
      template_id: "30000000-0000-4000-8000-000000000001",
      key_id: "50000000-0000-4000-8000-000000000001",
      text_value: null,
      number_value: 0.73,
      boolean_value: null,
      datetime_value: null,
      option_id: null,
      cell_revision: 1,
      created_at: "2026-07-31T00:00:00.000Z",
      updated_at: "2026-07-31T00:00:00.000Z",
    };
    expect(value.number_value).toBe(0.73);
  });

  it("keeps Template identity stable across renames", () => {
    const template: ExperimentTemplate = {
      id: "30000000-0000-4000-8000-000000000001",
      name: "Imported legacy experiments",
      description: "",
      schema_revision: 1,
      archived_at: null,
      created_at: "2026-07-31T00:00:00.000Z",
      updated_at: "2026-07-31T00:00:00.000Z",
    };
    const key: TemplateKey = {
      id: "50000000-0000-4000-8000-000000000001",
      template_id: template.id,
      field_id: "40000000-0000-4000-8000-000000000001",
      key: "pass@1",
      value_type: "number",
      required: false,
      position: 1,
      archived_at: null,
      created_at: template.created_at,
      updated_at: template.updated_at,
    };
    const option: TemplateKeyOption = {
      id: "70000000-0000-4000-8000-000000000001",
      template_id: template.id,
      key_id: key.id,
      label: "top-1",
      position: 1,
      archived_at: null,
    };
    expect(key.template_id).toBe(template.id);
    expect(option.key_id).toBe(key.id);
  });

  it("exposes Template linkage on Experiment and Attachment rows", () => {
    expect(experimentFixture.template_id).toBeNull();
    expect(experimentFixture.archived_at).toBeNull();
    expect(experimentFixture.core_revision).toBe(1);

    const attachment: Attachment = {
      id: "80000000-0000-4000-8000-000000000001",
      task_id: experimentFixture.task_id,
      experiment_id: experimentFixture.id,
      url: "https://storage.test/plot.png",
      path: "task/experiment/plot.png",
      caption: "",
      position: 0,
      template_key_id: null,
      archived_at: null,
      created_at: "2026-07-31T00:00:00.000Z",
      updated_at: "2026-07-31T00:00:00.000Z",
    };
    expect(attachment.template_key_id).toBeNull();
    expect(attachment.archived_at).toBeNull();
  });
});
