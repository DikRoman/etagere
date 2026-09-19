import type { Metadata, Viewport } from "next";
import { Alegreya, Fraunces, Manrope } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/components/AuthProvider";
import { SiteFooter } from "@/components/SiteFooter";
import { TelegramAuthCatcher } from "@/components/TelegramAuthCatcher";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const cyrDisplay = Alegreya({
  variable: "--font-cyr-display",
  subsets: ["cyrillic", "latin"],
  // 400 is the reading weight for EPUB body text.
  weight: ["400", "500", "600", "700"],
});

const sans = Manrope({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Étagère · Этажер",
  description:
    "Читалка PDF/EPUB с полкой, заметками и синхронизацией — Étagère / Этажер",
  appleWebApp: {
    capable: true,
    title: "Étagère",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e8ecf1" },
    { media: "(prefers-color-scheme: dark)", color: "#12161c" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${display.variable} ${cyrDisplay.variable} ${sans.variable} h-full`}
    >
      <body className="min-h-full antialiased">
        <ThemeProvider>
          <AuthProvider>
            <TelegramAuthCatcher />
            <div className="app-shell">
              <div className="app-shell-main">{children}</div>
              <SiteFooter />
            </div>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
