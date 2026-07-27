const DEFAULT_AVATAR_SIZE = 28;
const MIN_AVATAR_SIZE = 20;
const MAX_AVATAR_SIZE = 48;

export interface OwnerAvatarProps {
  name: string;
  initials?: string;
  size?: number;
}

function avatarInitials(name: string, initials?: string): string {
  const explicit = initials?.trim();
  if (explicit) {
    return Array.from(explicit).slice(0, 2).join("").toUpperCase();
  }

  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const first = Array.from(words[0])[0] ?? "";
    const last = Array.from(words[words.length - 1])[0] ?? "";
    return `${first}${last}`.toUpperCase();
  }

  return Array.from(words[0] ?? "?")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function boundedAvatarSize(size: number | undefined): number {
  const finiteSize = typeof size === "number" && Number.isFinite(size)
    ? size
    : DEFAULT_AVATAR_SIZE;
  return Math.min(
    MAX_AVATAR_SIZE,
    Math.max(MIN_AVATAR_SIZE, Math.round(finiteSize)),
  );
}

export default function OwnerAvatar({
  name,
  initials,
  size,
}: OwnerAvatarProps) {
  const avatarSize = boundedAvatarSize(size);

  return (
    <span
      className="owner-avatar"
      role="img"
      aria-label={name}
      style={{ width: avatarSize, height: avatarSize }}
    >
      {avatarInitials(name, initials)}
    </span>
  );
}
