import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/client/config";
import "./globals.css";

// Fonts

const nunito = Nunito({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-nunito",
});

// Metadata

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Learn vocabulary with spaced repetition",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#22303c",
};

// Layout

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={nunito.variable}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}