import type { Member } from "@/lib/types";

export function memberNameKey(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function findMemberByName(
  members: Member[],
  value: string,
): Member | undefined {
  const key = memberNameKey(value);
  return members.find((member) => memberNameKey(member.name) === key);
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    return (Array.from(parts[0])[0] ?? "?").toUpperCase();
  }
  const first = Array.from(parts[0])[0] ?? "";
  const last = Array.from(parts[parts.length - 1])[0] ?? "";
  return `${first}${last}`.toUpperCase() || "?";
}
