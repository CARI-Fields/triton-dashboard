"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();
  const boardActive = pathname === "/" || pathname.startsWith("/task/");
  const compareActive = pathname === "/experiments/compare"
    || pathname.startsWith("/experiments/compare/");
  const experimentsActive = (
    pathname === "/experiments" || pathname.startsWith("/experiments/")
  ) && !compareActive;
  const analyticsActive = pathname === "/analytics";
  const apiKeysActive = pathname === "/admin/api-keys";

  const current = (active: boolean) => active ? "page" as const : undefined;

  return (
    <nav className="navbar" aria-label="Primary">
      <div className="navbar-inner">
        <Link href="/" className="brand">
          <span className="brand-logo" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M8 2.5 L13.5 12 H2.5 Z" fill="#fff" />
              <path d="M8 6.2 L11 11.4 H5 Z" fill="var(--accent)" />
            </svg>
          </span>
          <span>
            <strong>Triton Board</strong>
            <small>Team workspace</small>
          </span>
        </Link>
        <div className="nav-section">
          <span className="nav-section-label">Project</span>
          <Link
            href="/"
            className={`nav-btn ${boardActive ? "active" : ""}`}
            aria-current={current(boardActive)}
          >
            Task Board
          </Link>
          <Link
            href="/experiments"
            className={`nav-btn ${experimentsActive ? "active" : ""}`}
            aria-current={current(experimentsActive)}
          >
            Experiments
          </Link>
          <Link
            href="/experiments/compare"
            className={`nav-btn ${compareActive ? "active" : ""}`}
            aria-current={current(compareActive)}
          >
            Compare
          </Link>
          <Link
            href="/analytics"
            className={`nav-btn ${analyticsActive ? "active" : ""}`}
            aria-current={current(analyticsActive)}
          >
            Analytics
          </Link>
          <Link
            href="/admin/api-keys"
            className={`nav-btn ${apiKeysActive ? "active" : ""}`}
            aria-current={current(apiKeysActive)}
          >
            API Keys
          </Link>
        </div>
        <span className="navbar-spacer" />
        <span className="live-badge">Shared team board</span>
      </div>
    </nav>
  );
}
