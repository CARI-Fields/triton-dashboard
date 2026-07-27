"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuthActions } from "@/components/AuthGate";
import ThemeToggle from "@/components/theme/ThemeToggle";
import { Icon, type IconName } from "@/components/ui/Icons";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

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
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const sheetCloseButtonRef = useRef<HTMLButtonElement>(null);
  const wasMobileOpenRef = useRef(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) {
      if (wasMobileOpenRef.current) {
        menuButtonRef.current?.focus();
      }
      wasMobileOpenRef.current = false;
      return;
    }

    wasMobileOpenRef.current = true;
    sheetCloseButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = Array.from(
        sidebarRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
      );
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }

      const activeElement = document.activeElement;
      const focusIsOutsideSheet = !sidebarRef.current?.contains(activeElement);
      if (
        event.shiftKey
        && (activeElement === first || focusIsOutsideSheet)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey
        && (activeElement === last || focusIsOutsideSheet)
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen]);

  return (
    <>
      <header className="mobile-app-bar">
        <BrandLink />
        <button
          ref={menuButtonRef}
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
      <aside
        ref={sidebarRef}
        className={`app-sidebar ${mobileOpen ? "is-open" : ""}`}
        role={mobileOpen ? "dialog" : undefined}
        aria-label={mobileOpen ? "Navigation" : undefined}
        aria-modal={mobileOpen ? true : undefined}
      >
        <nav id="workspace-navigation" aria-label="Primary">
          <button
            ref={sheetCloseButtonRef}
            type="button"
            className="sidebar-sheet-close"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <Icon name="close" />
          </button>
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
