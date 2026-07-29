import type { ReactNode } from "react";

export type IconName =
  | "board"
  | "experiment"
  | "compare"
  | "analytics"
  | "sun"
  | "moon"
  | "logout"
  | "users"
  | "plus"
  | "filter"
  | "more"
  | "menu"
  | "close"
  | "search"
  | "chevron-left"
  | "chevron-right";

const ICON_PATHS: Record<IconName, ReactNode> = {
  board: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="1.5" />
      <path d="M9 4v16M9 9h11" />
    </>
  ),
  experiment: (
    <>
      <path d="M9 3h6M10 3v5l-5.8 9.2A2.5 2.5 0 0 0 6.3 21h11.4a2.5 2.5 0 0 0 2.1-3.8L14 8V3" />
      <path d="M7.8 15h8.4" />
    </>
  ),
  compare: (
    <>
      <path d="M4 7h14M15 4l3 3-3 3M20 17H6M9 14l-3 3 3 3" />
    </>
  ),
  analytics: (
    <>
      <path d="M4 20V10M9.3 20V5M14.7 20v-8M20 20V3M2 20h20" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
    </>
  ),
  moon: <path d="M20 15.1A8.5 8.5 0 0 1 8.9 4a8.5 8.5 0 1 0 11.1 11.1Z" />,
  logout: (
    <>
      <path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10M14 8l4 4-4 4M9 12h9" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20v-1.5A5.5 5.5 0 0 1 9 13h0a5.5 5.5 0 0 1 5.5 5.5V20M15.5 5.2a3 3 0 0 1 0 5.6M17 13a5.5 5.5 0 0 1 3.5 5.1V20" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  filter: <path d="M4 5h16l-6.3 7.1V19l-3.4-1.8v-5.1L4 5Z" />,
  more: (
    <>
      <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m5 5 14 14M19 5 5 19" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  "chevron-left": <path d="m15 5-7 7 7 7" />,
  "chevron-right": <path d="m9 5 7 7-7 7" />,
};

export function Icon({
  name,
  size = 20,
}: {
  name: IconName;
  size?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      width={size}
      height={size}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}
