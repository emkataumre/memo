import type { Metadata, Viewport } from "next";
import { Caprasimo, JetBrains_Mono, Pixelify_Sans } from "next/font/google";
import "./globals.css";

const caprasimo = Caprasimo({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const pixelifySans = Pixelify_Sans({
  subsets: ["latin"],
  variable: "--font-pixel",
  display: "swap",
});

export const metadata: Metadata = {
  title: "memo",
  description: "private. two of us. forever.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "memo",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
    date: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#F2E8D5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${caprasimo.variable} ${jetbrainsMono.variable} ${pixelifySans.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
