"use client";

import CommaListInput from "@/components/experiments/CommaListInput";
import type { ObjectSpec } from "@/lib/types";

export default function ObjectEditor({
  value,
  onChange,
}: {
  value: ObjectSpec;
  onChange: (value: ObjectSpec) => void;
}) {
  const set = <K extends keyof ObjectSpec>(key: K, next: ObjectSpec[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="property-grid">
      <label><span>Model</span><input aria-label="Model" value={value.model} onChange={(event) => set("model", event.target.value)} /></label>
      <label><span>Harness</span><input aria-label="Harness" value={value.harness} onChange={(event) => set("harness", event.target.value)} /></label>
      <label><span>Parent Harness</span><input aria-label="Parent Harness" value={value.parent_harness} onChange={(event) => set("parent_harness", event.target.value)} /></label>
      <label><span>Prompt</span><input aria-label="Prompt" value={value.prompt} onChange={(event) => set("prompt", event.target.value)} /></label>
      <label className="property-span-2">
        <span>Change Summary</span>
        <textarea aria-label="Change Summary" value={value.prompt_change} onChange={(event) => set("prompt_change", event.target.value)} />
      </label>
      <CommaListInput label="Skills" value={value.skills} onChange={(skills) => set("skills", skills)} />
      <CommaListInput label="Tools" value={value.tools} onChange={(tools) => set("tools", tools)} />
    </div>
  );
}
