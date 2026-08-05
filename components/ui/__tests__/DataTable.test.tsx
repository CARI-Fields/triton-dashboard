// components/ui/__tests__/DataTable.test.tsx
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";

interface Row {
  id: string;
  name: string;
}

const columns: DataTableColumn<Row>[] = [
  { key: "name", header: "Name", cell: (r) => r.name },
];

describe("DataTable", () => {
  afterEach(cleanup);

  it("renders headers and rows", () => {
    render(<DataTable rows={[{ id: "1", name: "Alpha" }]} columns={columns} getRowId={(r) => r.id} />);
    expect(screen.getByText("Name")).toBeDefined();
    expect(screen.getByText("Alpha")).toBeDefined();
  });

  it("renders a checkbox per row when selectable and toggles selection", () => {
    const onToggle = vi.fn();
    render(
      <DataTable
        rows={[{ id: "1", name: "Alpha" }]}
        columns={columns}
        getRowId={(r) => r.id}
        selectable
        selectedIds={[]}
        onToggleRow={onToggle}
      />,
    );
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    expect(onToggle).toHaveBeenCalledWith("1");
  });
});
