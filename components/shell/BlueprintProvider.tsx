"use client";

import { BlueprintProvider as BPProvider } from "@blueprintjs/core";
import type { ReactNode } from "react";

export function BlueprintProvider({ children }: { children: ReactNode }) {
  return <BPProvider>{children}</BPProvider>;
}
