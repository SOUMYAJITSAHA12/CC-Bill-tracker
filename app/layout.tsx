import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CC Bill Tracker",
  description: "Credit card bill tracking via BillDesk API",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
