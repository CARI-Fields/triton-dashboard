// components/ui/Button.tsx
"use client";

import { Button as BPButton, type ButtonProps } from "@blueprintjs/core";

export function Button(props: ButtonProps) {
  return <BPButton {...props} />;
}

export function IconButton({
  icon,
  label,
  ...rest
}: { icon: ButtonProps["icon"]; label: string } & ButtonProps) {
  return <BPButton minimal small icon={icon} aria-label={label} {...rest} />;
}

export type { ButtonProps };
