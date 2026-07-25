"use client";

import CommaListInput from "@/components/experiments/CommaListInput";
import type { EnvironmentSpec } from "@/lib/types";

export default function EnvironmentEditor({
  value,
  onChange,
}: {
  value: EnvironmentSpec;
  onChange: (value: EnvironmentSpec) => void;
}) {
  const set = <K extends keyof EnvironmentSpec>(key: K, next: EnvironmentSpec[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="property-grid">
      <label>
        <span>Platform</span>
        <select
          aria-label="Platform"
          value={value.platform}
          onChange={(event) => set("platform", event.target.value as EnvironmentSpec["platform"])}
        >
          <option value="">Choose platform</option>
          <option value="npu">NPU</option>
          <option value="gpu">GPU</option>
        </select>
      </label>
      <label><span>Server</span><input aria-label="Server" value={value.server} onChange={(event) => set("server", event.target.value)} /></label>
      <CommaListInput label="Devices" value={value.devices} onChange={(devices) => set("devices", devices)} />
      <label><span>Hardware</span><input aria-label="Hardware" value={value.hardware} onChange={(event) => set("hardware", event.target.value)} /></label>
      <label><span>Evaluator / Grader</span><input aria-label="Evaluator or Grader" value={value.evaluator} onChange={(event) => set("evaluator", event.target.value)} /></label>
      <label><span>Revision</span><input aria-label="Environment Revision" value={value.revision} onChange={(event) => set("revision", event.target.value)} /></label>
      <label className="property-span-2"><span>Precision policy</span><input aria-label="Precision policy" value={value.precision_policy} onChange={(event) => set("precision_policy", event.target.value)} /></label>
    </div>
  );
}
