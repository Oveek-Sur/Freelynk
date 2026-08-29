import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShareLynk Admin",
  description: "WiFi network manager for the ShareLynk app",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#00131f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="bn">
      <body className="antialiased">{children}</body>
    </html>
  );
}
