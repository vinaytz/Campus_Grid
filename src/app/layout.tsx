import type { Metadata, Viewport } from "next";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

/**
 * Newsreader carries headings — a text serif reads as institutional without
 * tipping into a magazine. Inter Tight sets the interface at small sizes, and
 * every code, ID, room and time is monospaced, because those are data.
 */
const sans = Inter_Tight({
  subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans", display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono", display: "swap",
});

export const metadata: Metadata = {
  title: "Chronos — Timetable",
  description: "Find your class schedule by section, faculty member, or room.",
};

export const viewport: Viewport = { themeColor: "#14171C" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
