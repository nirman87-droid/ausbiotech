import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex-sans" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: { default: "AI Use Case Builder", template: "%s | AI Use Case Builder" },
  description: "ARM Hub AI Adopt workshop tool",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-screen bg-white text-body">
        <a href="#main" className="sr-only-focusable btn absolute left-2 top-2 z-50">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
