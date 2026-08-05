// components/ui/DataTable.tsx
"use client";

import { Checkbox, HTMLTable } from "@blueprintjs/core";
import type { ReactNode } from "react";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sticky?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  selectable?: boolean;
  selectedIds?: string[];
  onToggleRow?: (id: string) => void;
  stickyHeader?: boolean;
}

export function DataTable<T>({
  rows,
  columns,
  getRowId,
  selectable,
  selectedIds = [],
  onToggleRow,
  stickyHeader = true,
}: DataTableProps<T>) {
  return (
    <div className="table-scroll">
      <HTMLTable interactive={false} className={stickyHeader ? "sticky-head" : undefined}>
        <thead>
          <tr>
            {selectable && <th>{" "}</th>}
            {columns.map((c) => (
              <th key={c.key} className={c.sticky ? "sticky-col" : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = getRowId(row);
            const checked = selectedIds.includes(id);
            return (
              <tr key={id} className={checked ? "row-selected" : undefined}>
                {selectable && (
                  <td>
                    <Checkbox checked={checked} onChange={() => onToggleRow?.(id)} />
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} className={[c.sticky ? "sticky-col" : "", c.className ?? ""].join(" ").trim()}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </HTMLTable>
    </div>
  );
}
