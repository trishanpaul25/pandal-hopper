import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LangProvider } from "@/lib/lang";
import Shell from "@/components/Shell";

export const metadata: Metadata = {
  title: "Pandal Hopper – Kolkata Durga Puja 2026",
  description: "Plan your pandal hopping: nearest-next pandal, routes, food and sights, puja days and a visitor guide.",
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = { themeColor: "#c1121f", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600&family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700&family=Tiro+Bangla&display=swap" />
      </head>
      <body>
        <LangProvider><Shell>{children}</Shell></LangProvider>
        <script dangerouslySetInnerHTML={{ __html: "if('serviceWorker' in navigator){addEventListener('load',()=>navigator.serviceWorker.register('/sw.js'))}" }} />
      </body>
    </html>
  );
}
