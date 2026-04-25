import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Routax — Cycling Route Planner",
  description: "Route planning for long-distance cyclists",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
