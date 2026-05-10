import type { Metadata, Viewport } from "next";
import "./globals.css";
import PWARegister from "./_components/PWARegister";

export const metadata: Metadata = {
  title: "BidMaster",
  description: "Quote Management Platform for Contractors",
  // PWA + iOS / Android Add to Home Screen
  applicationName: "BidMaster",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BidMaster",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

// Sets the address-bar / status-bar tint when the page is installed as a PWA.
export const viewport: Viewport = {
  themeColor: "#2d7a3d",
  width: "device-width",
  initialScale: 1,
  // Prevent zoom-on-input on iOS without disabling user-scaling globally.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&family=Bricolage+Grotesque:wght@400;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        {/* Mobile Safari: hides the address bar when launched from Home Screen */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body suppressHydrationWarning>
        {children}
        {/* Registers the service worker and listens for install prompts. Renders nothing visible. */}
        <PWARegister />
      </body>
    </html>
  );
}
