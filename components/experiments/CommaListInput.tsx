"use client";

import { useEffect, useState } from "react";

export default function CommaListInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [draft, setDraft] = useState(value.join(", "));

  useEffect(() => setDraft(value.join(", ")), [value]);

  return (
    <label>
      <span>{label}</span>
      <input
        aria-label={label}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onChange(
          draft.split(",").map((item) => item.trim()).filter(Boolean),
        )}
      />
    </label>
  );
}
