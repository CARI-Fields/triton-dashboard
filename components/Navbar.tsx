"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();
  const boardActive = pathname === "/" || pathname.startsWith("/task");
  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <span className="brand">
          <span className="brand-logo" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M8 2.5 L13.5 12 H2.5 Z" fill="#fff" />
              <path d="M8 6.2 L11 11.4 H5 Z" fill="var(--accent)" />
            </svg>
          </span>
          Triton Board
        </span>
        <span className="live-badge">
          <span className="live-dot" />
          LIVE
        </span>
        <span className="navbar-spacer" />
        <Link href="/" className={`nav-btn ${boardActive ? "active" : ""}`}>
          Board
        </Link>
        <Link href="/analytics" className={`nav-btn ${pathname === "/analytics" ? "active" : ""}`}>
          Analytics
        </Link>
      </div>
    </nav>
  );
}
