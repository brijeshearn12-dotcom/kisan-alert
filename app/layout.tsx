import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { LanguageSelector } from "@/components/LanguageSelector";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kisan Alert — AI Crop Advisory",
  description: "Get AI-powered crop recommendations tailored to your district, soil type, and live weather data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LanguageProvider>
          {children}
          {/* One global language switcher for the whole app. Floats above every
              page's own top bar (bottom-right) so it never collides with them
              and is always reachable. */}
          <div className="fixed bottom-5 right-5 z-50 sm:bottom-6 sm:right-6">
            <LanguageSelector placement="up" />
          </div>
        </LanguageProvider>
      </body>
    </html>
  );
}
