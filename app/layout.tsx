import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LangProvider } from "@/lib/lang";
import { ModeProvider } from "@/lib/mode";
import { WhenProvider } from "@/lib/when";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { LiveShareProvider } from "@/lib/liveShare";
import Shell from "@/components/Shell";

export const metadata: Metadata = {
  title: "Pandal Hopper – Kolkata Durga Puja 2026",
  description: "Plan your pandal hopping: nearest-next pandal, routes, food and sights, puja days and a visitor guide.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "Pandal Hopper", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#c1121f", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "(function(){try{var s=localStorage.getItem('ph-theme');var t=s?JSON.parse(s):(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}catch(e){}})()" }} />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600&family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700&family=Tiro+Bangla&display=swap" />
      </head>
      <body>
        <ThemeProvider><LangProvider><ModeProvider><WhenProvider><AuthProvider><LiveShareProvider><Shell>{children}</Shell></LiveShareProvider></AuthProvider></WhenProvider></ModeProvider></LangProvider></ThemeProvider>
        <script dangerouslySetInnerHTML={{ __html: "if('serviceWorker' in navigator){addEventListener('load',()=>navigator.serviceWorker.register('/sw.js'))}" }} />
      </body>
    </html>
  );
}
