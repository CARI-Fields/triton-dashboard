import type { Metadata } from "next";
import Script from "next/script";
import AuthGate from "@/components/AuthGate";
import Navbar from "@/components/Navbar";
import ThemeProvider from "@/components/theme/ThemeProvider";
import { ibmPlexMono, ibmPlexSans } from "@/app/fonts";
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
    <html
      lang="en"
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
      suppressHydrationWarning
    >
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
