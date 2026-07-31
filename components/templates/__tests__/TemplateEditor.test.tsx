import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TemplateEditor from "@/components/templates/TemplateEditor";
import type { TemplateDraft } from "@/lib/templates/repository";

const draft: TemplateDraft = {
  templateId: "t1",
  name: "Benchmark A",
  description: "",
  schemaRevision: 2,
  fields: [{
    id: "f1",
    label: "Metrics",
    colorToken: "blue",
    position: 1,
    archived: false,
    keys: [{
      id: "k1",
      key: "pass@1",
      valueType: "number",
      required: false,
      position: 1,
      archived: false,
      options: [],
      valueCount: 3,
    }],
  }],
};

afterEach(cleanup);

describe("TemplateEditor", () => {
  it("shows exactly the four schema columns", () => {
    render(
      <TemplateEditor draft={draft} experimentCount={24} onPersist={vi.fn()} readOnly={false} />,
    );
    expect(screen.getByText("Field label")).not.toBeNull();
    expect(screen.getByText("Key")).not.toBeNull();
    expect(screen.getByText("Value type")).not.toBeNull();
    expect(screen.getByText("Required / optional")).not.toBeNull();
  });

  it("locks the Value Type of a populated Key", () => {
    render(
      <TemplateEditor draft={draft} experimentCount={24} onPersist={vi.fn()} readOnly={false} />,
    );
    const select = screen.getByLabelText("Value type for pass@1") as HTMLSelectElement;
    expect(select.disabled).toBe(true);
  });

  it("describes adding a Key as an impact line", () => {
    render(
      <TemplateEditor draft={draft} experimentCount={24} onPersist={vi.fn()} readOnly={false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add key" }));
    expect(screen.getByText(/creates an empty Key for 24 existing Experiments/)).not.toBeNull();
  });
});
