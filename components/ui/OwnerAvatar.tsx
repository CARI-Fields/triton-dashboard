const DEFAULT_AVATAR_SIZE = 28;
const MIN_AVATAR_SIZE = 20;
const MAX_AVATAR_SIZE = 48;
const FALLBACK_OWNER_NAME = "Unknown owner";
const FALLBACK_OWNER_INITIALS = "UN";

export interface OwnerAvatarProps {
  name: string;
  initials?: string;
  size?: number;
}

function normalizedInitials(value: string): string {
  return Array.from(value.trim().toUpperCase()).slice(0, 2).join("");
}

function avatarInitials(name: string, initials?: string): string {
  const explicit = normalizedInitials(initials ?? "");
  if (explicit) {
    return explicit;
  }

  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return FALLBACK_OWNER_INITIALS;
  }

  if (words.length > 1) {
    const first = Array.from(words[0])[0] ?? "";
    const last = Array.from(words[words.length - 1])[0] ?? "";
    return normalizedInitials(`${first}${last}`) || FALLBACK_OWNER_INITIALS;
  }

  return normalizedInitials(words[0]) || FALLBACK_OWNER_INITIALS;
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
  const accessibleName = name.trim() || FALLBACK_OWNER_NAME;

  return (
    <span
      className="owner-avatar"
      role="img"
      aria-label={accessibleName}
      style={{ width: avatarSize, height: avatarSize }}
    >
      {avatarInitials(name, initials)}
    </span>
  );
}
