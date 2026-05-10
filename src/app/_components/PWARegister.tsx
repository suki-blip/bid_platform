"use client";

import { useEffect, useState } from "react";

// `beforeinstallprompt` is a non-standard Chrome event — TS doesn't ship a type for it.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

/**
 * Client-only PWA bootstrap:
 *   1. Registers /sw.js so the app can run offline and is "installable".
 *   2. Listens for `beforeinstallprompt` (Chrome/Edge/Samsung). When fired, pops a
 *      bottom-banner "Install app" CTA that triggers the native add-to-home-screen flow.
 *   3. Hides itself once the user installs OR dismisses (we remember the dismissal in
 *      localStorage for 14 days so we don't nag).
 *
 * iOS Safari doesn't fire beforeinstallprompt — there we show a one-time hint to use the
 * Share menu → "Add to Home Screen", but only on small screens and not in standalone mode.
 */
export default function PWARegister() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // --- Register the service worker (production only — avoids dev-server flakiness) ---
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    // Defer registration until after first paint so it doesn't compete for startup CPU.
    const t = setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("SW registration failed", err);
      });
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  // --- Listen for the Chrome install prompt ---
  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissedAt = Number(localStorage.getItem("pwa-install-dismissed-at") || 0);
    const fourteenDays = 14 * 24 * 60 * 60 * 1000;
    if (Date.now() - dismissedAt < fourteenDays) {
      setDismissed(true);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    const onInstalled = () => {
      setInstallEvent(null);
      localStorage.setItem("pwa-installed", "1");
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // --- iOS hint (Safari only, mobile, not already installed) ---
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua); // only Safari iOS
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);
    const dismissedAt = Number(localStorage.getItem("pwa-ios-hint-dismissed-at") || 0);
    const fourteenDays = 14 * 24 * 60 * 60 * 1000;

    if (isIos && !isStandalone && Date.now() - dismissedAt > fourteenDays) {
      // Wait a few seconds so we don't interrupt the first click.
      const t = setTimeout(() => setShowIosHint(true), 4000);
      return () => clearTimeout(t);
    }
  }, []);

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "dismissed") {
      localStorage.setItem("pwa-install-dismissed-at", String(Date.now()));
      setDismissed(true);
    }
    setInstallEvent(null);
  }

  function dismiss() {
    localStorage.setItem("pwa-install-dismissed-at", String(Date.now()));
    setDismissed(true);
    setInstallEvent(null);
  }

  function dismissIos() {
    localStorage.setItem("pwa-ios-hint-dismissed-at", String(Date.now()));
    setShowIosHint(false);
  }

  // Render: a single banner at the bottom of the page.
  if (dismissed) return null;

  if (installEvent) {
    return (
      <div style={bannerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
          <div style={iconCircle}>
            {/* Mini heart matching the icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#2d7a3d" aria-hidden>
              <path d="M12 21s-7-4.5-9.5-9.2C1 8.6 3 5 6.5 5c1.7 0 3.3.9 4.2 2.2C11.5 6.6 13.1 5 14.8 5 18 5 20 8 18.5 11.8 16 16.5 12 21 12 21Z" />
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Install easyfundraisings</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Quick access from your home screen.</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={dismiss} style={btnLight}>Later</button>
          <button onClick={install} style={btnDark}>Install</button>
        </div>
      </div>
    );
  }

  if (showIosHint) {
    return (
      <div style={bannerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
          <div style={iconCircle}>📲</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Add to Home Screen</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Tap <strong>Share</strong> in Safari, then <strong>Add to Home Screen</strong>.
            </div>
          </div>
        </div>
        <button onClick={dismissIos} style={btnLight}>Got it</button>
      </div>
    );
  }

  return null;
}

const bannerStyle: React.CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 9999,
  padding: "12px 16px",
  background: "#fff",
  borderTop: "1px solid rgba(10,16,25,0.1)",
  boxShadow: "0 -8px 24px rgba(10,16,25,0.08)",
  display: "flex",
  alignItems: "center",
  gap: 12,
  // Respect iOS home-indicator safe area.
  paddingBottom: "max(12px, env(safe-area-inset-bottom))",
};

const iconCircle: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 10,
  background: "rgba(45,122,61,0.12)",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
};

const btnDark: React.CSSProperties = {
  padding: "8px 16px",
  background: "#2d7a3d",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

const btnLight: React.CSSProperties = {
  padding: "8px 14px",
  background: "transparent",
  color: "#0a1019",
  border: "1px solid rgba(10,16,25,0.15)",
  borderRadius: 8,
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};
