"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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
const NARROW_NAVIGATION_QUERY = "(max-width: 767px)";

interface NavigationItem {
  href: string;
  label: string;
  icon: IconName;
  active(pathname: string): boolean;
  children?: NavigationItem[];
}

const NAV_ITEMS: NavigationItem[] = [
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
    children: [
      {
        href: "/experiments/templates",
        label: "Templates",
        icon: "template",
        active: (pathname: string) => (
          pathname === "/experiments/templates"
          || pathname.startsWith("/experiments/templates/")
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
    ],
  },
  {
    href: "/analytics",
    label: "Analytics",
    icon: "analytics",
    active: (pathname: string) => pathname === "/analytics",
  },
  {
    href: "/admin/api-keys",
    label: "API Keys",
    icon: "key",
    active: (pathname: string) => pathname === "/admin/api-keys",
  },
];

function NavigationLink({
  item,
  active,
  ancestorActive = false,
  secondary = false,
}: {
  item: NavigationItem;
  active: boolean;
  ancestorActive?: boolean;
  secondary?: boolean;
}) {
  return (
    <Link
      href={item.href}
      className={[
        "nav-btn",
        secondary ? "nav-subnav" : "",
        active ? "active" : "",
        ancestorActive ? "ancestor-active" : "",
      ].filter(Boolean).join(" ")}
      aria-current={active ? "page" : undefined}
    >
      <Icon name={item.icon} />
      <span>{item.label}</span>
    </Link>
  );
}

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
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const sheetCloseButtonRef = useRef<HTMLButtonElement>(null);
  const mobileOpenRef = useRef(false);
  const wasSheetOpenRef = useRef(false);
  const skipFocusReturnRef = useRef(false);
  const sheetOpen = isNarrowViewport && mobileOpen;

  const setMobileNavigationOpen = useCallback((open: boolean) => {
    mobileOpenRef.current = open;
    setMobileOpen(open);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia(NARROW_NAVIGATION_QUERY);
    const syncViewport = (narrow: boolean) => {
      if (!narrow && mobileOpenRef.current) {
        skipFocusReturnRef.current = true;
        mobileOpenRef.current = false;
        setMobileOpen(false);
      }
      setIsNarrowViewport(narrow);
    };

    syncViewport(mediaQuery.matches);
    const handleChange = (event: MediaQueryListEvent) => {
      syncViewport(event.matches);
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    setMobileNavigationOpen(false);
  }, [pathname, setMobileNavigationOpen]);

  useEffect(() => {
    if (!sheetOpen) {
      if (wasSheetOpenRef.current && !skipFocusReturnRef.current) {
        menuButtonRef.current?.focus();
      }
      wasSheetOpenRef.current = false;
      skipFocusReturnRef.current = false;
      return;
    }

    wasSheetOpenRef.current = true;
    sheetCloseButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileNavigationOpen(false);
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
  }, [setMobileNavigationOpen, sheetOpen]);

  return (
    <>
      <header className="mobile-app-bar">
        <BrandLink />
        <button
          ref={menuButtonRef}
          type="button"
          className="nav-menu-toggle"
          aria-label={sheetOpen ? "Close navigation" : "Open navigation"}
          aria-controls="workspace-navigation"
          aria-expanded={sheetOpen}
          onClick={() => {
            if (isNarrowViewport) {
              setMobileNavigationOpen(!mobileOpenRef.current);
            }
          }}
        >
          <Icon name={sheetOpen ? "close" : "menu"} />
        </button>
      </header>
      <aside
        ref={sidebarRef}
        className={`app-sidebar ${sheetOpen ? "is-open" : ""}`}
        role={sheetOpen ? "dialog" : undefined}
        aria-label={sheetOpen ? "Navigation" : undefined}
        aria-modal={sheetOpen ? true : undefined}
      >
        <nav id="workspace-navigation" aria-label="Primary">
          <button
            ref={sheetCloseButtonRef}
            type="button"
            className="sidebar-sheet-close"
            aria-label="Close navigation"
            onClick={() => setMobileNavigationOpen(false)}
          >
            <Icon name="close" />
          </button>
          <BrandLink />
          <p className="project-context">Triton Kernel Agent</p>
          <div className="nav-section">
            {NAV_ITEMS.map((item) => {
              const active = item.active(pathname);
              const descendantActive = item.children?.some(
                (child) => child.active(pathname),
              ) ?? false;
              if (!item.children) {
                return (
                  <NavigationLink
                    key={item.href}
                    item={item}
                    active={active}
                  />
                );
              }
              return (
                <div className="nav-group" key={item.href}>
                  <NavigationLink
                    item={item}
                    active={active}
                    ancestorActive={descendantActive}
                  />
                  <div
                    className="nav-subsection"
                    role="group"
                    aria-label={`${item.label} pages`}
                  >
                    {item.children.map((child) => (
                      <NavigationLink
                        key={child.href}
                        item={child}
                        active={child.active(pathname)}
                        secondary
                      />
                    ))}
                  </div>
                </div>
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
      {sheetOpen ? (
        <button
          type="button"
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNavigationOpen(false)}
        />
      ) : null}
    </>
  );
}
