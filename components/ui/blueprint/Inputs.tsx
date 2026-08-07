"use client";

import {
  Checkbox as BPCheckbox,
  HTMLSelect as BPHTMLSelect,
} from "@blueprintjs/core";
import type {
  CheckboxProps as BPCheckboxProps,
  HTMLSelectProps as BPHTMLSelectProps,
} from "@blueprintjs/core";

export interface HTMLOption {
  label: string;
  value: string;
}

export interface HTMLSelectProps
  extends Omit<BPHTMLSelectProps, "onChange" | "options" | "value"> {
  /** Controlled value. */
  value?: string;
  /** Called with the new string value when the selection changes. */
  onChange?: (value: string) => void;
  /** Options to render. */
  options?: HTMLOption[];
}

/**
 * Thin "use client" wrapper over Blueprint's HTMLSelect with a string-based
 * onChange callback and a typed {label, value} options list.
 */
export function HTMLSelect({
  value,
  onChange,
  options,
  ...rest
}: HTMLSelectProps) {
  return (
    <BPHTMLSelect
      value={value}
      options={options}
      onChange={onChange == null ? undefined : (event) => {
        onChange(event.currentTarget.value);
      }}
      {...rest}
    />
  );
}

export interface CheckboxProps
  extends Omit<BPCheckboxProps, "onChange" | "checked"> {
  /** Controlled checked state. */
  checked?: boolean;
  /** Called with the new boolean when the checkbox is toggled. */
  onChange?: (checked: boolean) => void;
  /** Label text for the control. */
  label?: string;
}

/**
 * Thin "use client" wrapper over Blueprint's Checkbox with a boolean
 * onChange callback.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  ...rest
}: CheckboxProps) {
  return (
    <BPCheckbox
      checked={checked}
      label={label}
      onChange={onChange == null ? undefined : (event) => {
        onChange(event.currentTarget.checked);
      }}
      {...rest}
    />
  );
}
