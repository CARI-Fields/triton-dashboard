import type { Metadata } from "next";
import Script from "next/script";
import AuthGate from "@/components/AuthGate";
import Navbar from "@/components/Navbar";
import ThemeProvider from "@/components/theme/ThemeProvider";
import { BlueprintProvider } from "@/components/shell/BlueprintProvider";
import { ibmPlexMono, ibmPlexSans } from "@/app/fonts";
import "@blueprintjs/core/lib/css/blueprint.css";
import "./globals.css";
import "./experiment-workspace.css";
import "./blueprint-tokens.css";

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
          <BlueprintProvider>
            <AuthGate>
              <div className="app-shell">
                <Navbar />
                <main className="app-content">{children}</main>
              </div>
            </AuthGate>
          </BlueprintProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
