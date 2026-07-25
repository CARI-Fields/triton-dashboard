import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import "./globals.css";
import "./experiment-workspace.css";

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
        <div className="app-shell">
          <Navbar />
          <main className="app-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
