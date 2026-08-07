"use client";

import { Button as BPButton } from "@blueprintjs/core";

// Re-export BP ButtonProps (already includes intent/text/icon/onClick/
// minimal/small/variant/...) so consumers share one source of truth.
export type ButtonProps = React.ComponentProps<typeof BPButton>;

/**
 * Thin "use client" wrapper over Blueprint's Button. Forwards the full BP
 * ButtonProps (intent, text, icon, minimal, small, onClick, ...).
 */
export function Button(props: ButtonProps) {
  return <BPButton {...props} />;
}

export interface IconButtonProps extends Omit<ButtonProps, "icon" | "text"> {
  /** Blueprint icon name (or element) to display. */
  icon: ButtonProps["icon"];
  /** Accessible label (required: an icon-only button must name itself). */
  label: string;
}

/**
 * Icon-only button: a minimal, small Blueprint Button with an accessible name.
 */
export function IconButton({ icon, label, ...rest }: IconButtonProps) {
  return <BPButton minimal small icon={icon} aria-label={label} {...rest} />;
}
