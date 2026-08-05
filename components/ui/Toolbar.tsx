// components/ui/Toolbar.tsx
"use client";

import { InputGroup, HTMLSelect, SegmentedControl } from "@blueprintjs/core";
import type { ReactNode } from "react";

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>;
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <InputGroup
      leftIcon="search"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function ToolbarSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <HTMLSelect value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </HTMLSelect>
  );
}

export function ToolbarSegmentedControl({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <SegmentedControl
      value={value}
      onValueChange={(v) => onChange(v as string)}
      options={options.map((o) => ({ label: o.label, value: o.value }))}
    />
  );
}
