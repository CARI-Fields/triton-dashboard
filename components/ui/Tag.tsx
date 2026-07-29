"use client";

import { tagTone } from "@/lib/tasks/model";
import { Icon } from "@/components/ui/Icons";

export interface TagProps {
  value: string;
  removable?: boolean;
  onRemove?: (value: string) => void;
}

export default function Tag({
  value,
  removable = false,
  onRemove,
}: TagProps) {
  return (
    <span className="tag" data-tone={tagTone(value)}>
      <span>{value}</span>
      {removable && onRemove ? (
        <button
          type="button"
          className="tag-remove"
          aria-label={`Remove ${value}`}
          onClick={() => onRemove(value)}
        >
          <Icon name="close" size={12} />
        </button>
      ) : null}
    </span>
  );
}
