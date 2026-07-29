# Shared layouts

## Root app shell

File: `app/layout.tsx`

The only App Router layout. It imports both global style sheets, initializes the color scheme before hydration, then wraps every rendered route in the theme provider, authentication gate, sidebar navigation, and main content area.

```tsx
import type { Metadata } from "next";
import Script from "next/script";
import AuthGate from "@/components/AuthGate";
import Navbar from "@/components/Navbar";
import ThemeProvider from "@/components/theme/ThemeProvider";
import "./globals.css";
import "./experiment-workspace.css";

export const metadata: Metadata = {
  title: "Triton Board — Team Experiment Workspace",
  description: "Task-centered experiment context, evidence, comparison, and decisions.",
};

const themeScript = `
  try {
    const saved = localStorage.getItem("triton-theme");
    const theme = saved === "light" || saved === "dark"
      ? saved
      : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
  }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeScript}
        </Script>
        <ThemeProvider>
          <AuthGate>
            <div className="app-shell">
              <Navbar />
              <main className="app-content">{children}</main>
            </div>
          </AuthGate>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

## Navigation / responsive sidebar

File: `components/Navbar.tsx`

Persistent desktop sidebar and mobile app bar. It supplies all primary routes, a nested Compare link, team context, theme switching, logout, mobile focus trapping, Escape handling, and backdrop dismissal.

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthActions } from "@/components/AuthGate";
import ThemeToggle from "@/components/theme/ThemeToggle";
import { Icon, type IconName } from "@/components/ui/Icons";

const FOCUSABLE_SELECTOR = [
  "a[href]", "button:not([disabled])", "input:not([disabled])",
  "select:not([disabled])", "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");
const NARROW_NAVIGATION_QUERY = "(max-width: 767px)";

interface NavigationItem { href: string; label: string; icon: IconName; active(pathname: string): boolean; children?: NavigationItem[]; }

const NAV_ITEMS: NavigationItem[] = [
  { href: "/", label: "Task Board", icon: "board", active: (pathname) => pathname === "/" || pathname.startsWith("/task/") },
  {
    href: "/experiments", label: "Experiments", icon: "experiment",
    active: (pathname) => (pathname === "/experiments" || pathname.startsWith("/experiments/")) && pathname !== "/experiments/compare" && !pathname.startsWith("/experiments/compare/"),
    children: [{ href: "/experiments/compare", label: "Compare", icon: "compare", active: (pathname) => pathname === "/experiments/compare" || pathname.startsWith("/experiments/compare/") }],
  },
  { href: "/analytics", label: "Analytics", icon: "analytics", active: (pathname) => pathname === "/analytics" },
  { href: "/admin/api-keys", label: "API Keys", icon: "key", active: (pathname) => pathname === "/admin/api-keys" },
];

function NavigationLink({ item, active, ancestorActive = false, secondary = false }: { item: NavigationItem; active: boolean; ancestorActive?: boolean; secondary?: boolean; }) {
  return <Link href={item.href} className={["nav-btn", secondary ? "nav-subnav" : "", active ? "active" : "", ancestorActive ? "ancestor-active" : ""].filter(Boolean).join(" ")} aria-current={active ? "page" : undefined}><Icon name={item.icon} /><span>{item.label}</span></Link>;
}

function BrandLink() {
  return <Link href="/" className="brand"><svg aria-hidden="true" className="brand-mark" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 32 32"><path d="M16 3 29 27H3L16 3Z" /><path d="m16 9 8.5 16h-17L16 9Z" /></svg><strong>Triton Board</strong></Link>;
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
  const setMobileNavigationOpen = useCallback((open: boolean) => { mobileOpenRef.current = open; setMobileOpen(open); }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia(NARROW_NAVIGATION_QUERY);
    const syncViewport = (narrow: boolean) => { if (!narrow && mobileOpenRef.current) { skipFocusReturnRef.current = true; mobileOpenRef.current = false; setMobileOpen(false); } setIsNarrowViewport(narrow); };
    syncViewport(mediaQuery.matches);
    const handleChange = (event: MediaQueryListEvent) => { syncViewport(event.matches); };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);
  useEffect(() => { setMobileNavigationOpen(false); }, [pathname, setMobileNavigationOpen]);
  useEffect(() => {
    if (!sheetOpen) { if (wasSheetOpenRef.current && !skipFocusReturnRef.current) menuButtonRef.current?.focus(); wasSheetOpenRef.current = false; skipFocusReturnRef.current = false; return; }
    wasSheetOpenRef.current = true; sheetCloseButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setMobileNavigationOpen(false); return; }
      if (event.key !== "Tab") return;
      const focusable = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
      const first = focusable.at(0); const last = focusable.at(-1);
      if (!first || !last) { event.preventDefault(); return; }
      const activeElement = document.activeElement;
      const focusIsOutsideSheet = !sidebarRef.current?.contains(activeElement);
      if (event.shiftKey && (activeElement === first || focusIsOutsideSheet)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (activeElement === last || focusIsOutsideSheet)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [setMobileNavigationOpen, sheetOpen]);

  return <>
    <header className="mobile-app-bar"><BrandLink /><button ref={menuButtonRef} type="button" className="nav-menu-toggle" aria-label={sheetOpen ? "Close navigation" : "Open navigation"} aria-controls="workspace-navigation" aria-expanded={sheetOpen} onClick={() => { if (isNarrowViewport) setMobileNavigationOpen(!mobileOpenRef.current); }}><Icon name={sheetOpen ? "close" : "menu"} /></button></header>
    <aside ref={sidebarRef} className={`app-sidebar ${sheetOpen ? "is-open" : ""}`} role={sheetOpen ? "dialog" : undefined} aria-label={sheetOpen ? "Navigation" : undefined} aria-modal={sheetOpen ? true : undefined}>
      <nav id="workspace-navigation" aria-label="Primary"><button ref={sheetCloseButtonRef} type="button" className="sidebar-sheet-close" aria-label="Close navigation" onClick={() => setMobileNavigationOpen(false)}><Icon name="close" /></button><BrandLink /><p className="project-context">Triton Kernel Agent</p><div className="nav-section">{NAV_ITEMS.map((item) => { const active = item.active(pathname); const descendantActive = item.children?.some((child) => child.active(pathname)) ?? false; if (!item.children) return <NavigationLink key={item.href} item={item} active={active} />; return <div className="nav-group" key={item.href}><NavigationLink item={item} active={active} ancestorActive={descendantActive} /><div className="nav-subsection" role="group" aria-label={`${item.label} pages`}>{item.children.map((child) => <NavigationLink key={child.href} item={child} active={child.active(pathname)} secondary />)}</div></div>; })}</div></nav>
      <div className="sidebar-footer"><span className="team-context"><Icon name="users" /><span>Shared team board</span></span><ThemeToggle /><button type="button" className="sidebar-logout" onClick={() => void logout()}><Icon name="logout" /><span>Log out</span></button></div>
    </aside>
    {sheetOpen ? <button type="button" className="nav-backdrop" aria-label="Close navigation" onClick={() => setMobileNavigationOpen(false)} /> : null}
  </>;
}
```

## Shared page header

File: `components/ui/PageHeader.tsx`

Reusable page-level heading layout used by board, task detail, experiment index/detail, and analytics. It renders optional eyebrow, description, and actions slots.

```tsx
import type { ReactNode } from "react";

export interface PageHeaderProps { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; }

export default function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return <header className="page-header"><div className="page-header-copy">{eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}<h1>{title}</h1>{description ? <div className="page-description">{description}</div> : null}</div>{actions ? <div className="page-actions">{actions}</div> : null}</header>;
}
```
