"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthActions } from "@/components/AuthGate";
import ThemeToggle from "@/components/theme/ThemeToggle";
import { Icon, type IconName } from "@/components/ui/Icons";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Task Board",
    icon: "board",
    active: (pathname: string) => (
      pathname === "/" || pathname.startsWith("/task/")
    ),
  },
  {
    href: "/experiments",
    label: "Experiments",
    icon: "experiment",
    active: (pathname: string) => (
      (pathname === "/experiments" || pathname.startsWith("/experiments/"))
      && pathname !== "/experiments/compare"
      && !pathname.startsWith("/experiments/compare/")
    ),
  },
  {
    href: "/experiments/compare",
    label: "Compare",
    icon: "compare",
    active: (pathname: string) => (
      pathname === "/experiments/compare"
      || pathname.startsWith("/experiments/compare/")
    ),
  },
  {
    href: "/analytics",
    label: "Analytics",
    icon: "analytics",
    active: (pathname: string) => pathname === "/analytics",
  },
] satisfies Array<{
  href: string;
  label: string;
  icon: IconName;
  active(pathname: string): boolean;
}>;

function BrandLink() {
  return (
    <Link href="/" className="brand">
      <svg
        aria-hidden="true"
        className="brand-mark"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        viewBox="0 0 32 32"
      >
        <path d="M16 3 29 27H3L16 3Z" />
        <path d="m16 9 8.5 16h-17L16 9Z" />
      </svg>
      <strong>Triton Board</strong>
    </Link>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const { logout } = useAuthActions();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      <header className="mobile-app-bar">
        <BrandLink />
        <button
          type="button"
          className="nav-menu-toggle"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          aria-controls="workspace-navigation"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
        >
          <Icon name={mobileOpen ? "close" : "menu"} />
        </button>
      </header>
      <aside className={`app-sidebar ${mobileOpen ? "is-open" : ""}`}>
        <nav id="workspace-navigation" aria-label="Primary">
          <BrandLink />
          <p className="project-context">Triton Kernel Agent</p>
          <div className="nav-section">
            {NAV_ITEMS.map((item) => {
              const active = item.active(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-btn ${active ? "active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
        <div className="sidebar-footer">
          <span className="team-context">
            <Icon name="users" />
            <span>Shared team board</span>
          </span>
          <ThemeToggle />
          <button
            type="button"
            className="sidebar-logout"
            onClick={() => void logout()}
          >
            <Icon name="logout" />
            <span>Log out</span>
          </button>
        </div>
      </aside>
      {mobileOpen ? (
        <button
          type="button"
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
    </>
  );
}
