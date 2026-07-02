import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Triton Kernel Agent — RL Training Board",
  description: "Live project board for the Triton kernel agent RL training project",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
