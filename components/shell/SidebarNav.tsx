"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, Icon, type IconName } from "@blueprintjs/core";

interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  matchPrefix?: string[]; // nested routes that also mark this active
}

const NAV_ITEMS: NavItem[] = [
  { label: "Task Board", href: "/", icon: "grid-view", matchPrefix: ["/task"] },
  { label: "Experiments", href: "/experiments", icon: "lab-test", matchPrefix: ["/experiments/"] },
  { label: "Compare", href: "/experiments/compare", icon: "comparison" },
  { label: "Analytics", href: "/analytics", icon: "timeline-bar-chart" },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.href) return true;
  if (!(item.matchPrefix ?? []).some((p) => pathname.startsWith(p))) return false;
  // A more specific nested route (exact match on another item) wins over this prefix match,
  // e.g. /experiments/compare marks Compare active, not Experiments.
  return !NAV_ITEMS.some((o) => o.href === pathname);
}

export function SidebarNav({ onLogout }: { onLogout: () => void }) {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="navbar" aria-label="Primary">
      <div className="navbar-inner">
        <Link href="/" className="brand">
          <span className="brand-logo">
            <Icon icon="flows" color="#fff" />
          </span>
          <span>
            <strong>Triton Board</strong>
            <small>Team workspace</small>
          </span>
        </Link>
        <div className="nav-section">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-btn${isActive(pathname, item) ? " active" : ""}`}
              aria-current={isActive(pathname, item) ? "page" : undefined}
            >
              <Icon icon={item.icon} />
              {item.label}
            </Link>
          ))}
        </div>
        <div className="navbar-spacer" />
        <div className="live-badge" aria-label="Live">
          ● live
        </div>
        <Button minimal small icon="log-out" text="Log out" onClick={onLogout} />
      </div>
    </nav>
  );
}
