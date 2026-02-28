import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
});

export const metadata = {
  title: "AniMood AI ⛩️",
  description: "Твій персональний ШІ-помічник для підбору аніме під будь-який настрій",
  icons: {
    icon: "/favicon.ico", // Додано іконку для вкладки браузера
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="uk">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased selection:bg-purple-500/30`}>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}