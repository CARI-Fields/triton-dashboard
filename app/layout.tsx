import type { Metadata } from "next";
import "@blueprintjs/core/lib/css/blueprint.css";
import "./blueprint-tokens.css";
import "./globals.css";
import "./experiment-workspace.css";
import { BlueprintProvider } from "@/components/shell/BlueprintProvider";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = {
  title: "Triton Board — Team Experiment Workspace",
  description: "Task-centered experiment context, evidence, comparison, and decisions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <BlueprintProvider>
          <AppShell>{children}</AppShell>
        </BlueprintProvider>
      </body>
    </html>
  );
}
