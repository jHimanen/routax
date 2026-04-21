import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Via — Cycling Route Planner",
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
