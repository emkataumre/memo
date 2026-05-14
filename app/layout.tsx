import type { Metadata, Viewport } from "next";
import { Caprasimo, JetBrains_Mono, Pixelify_Sans } from "next/font/google";
import "./globals.css";
import RuntimeTheme from "@/components/RuntimeTheme";
import RegisterSW from "@/components/RegisterSW";

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
  description: "",
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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return (
    <html
      lang="bg-Latn"
      className={`${caprasimo.variable} ${jetbrainsMono.variable} ${pixelifySans.variable} h-full antialiased`}
    >
      <head>
        {supabaseUrl ? (
          <>
            <link rel="preconnect" href={supabaseUrl} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={supabaseUrl} />
          </>
        ) : null}
      </head>
      <body className="min-h-full">
        <RuntimeTheme />
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
