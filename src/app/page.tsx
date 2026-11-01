// Root landing page. BidMaster is gone; this is now a thin index linking to the two
// remaining products that live in this repo:
//   /fundraising → easyfundraisings CRM (will be split off to its own repo and transferred)
//   /dialer      → Twilio auto-dialer (stays here)
// Host-based middleware still routes easyfundraisings.com straight into /fundraising, so
// this page is mostly seen on the dev host / backup domain.
import Link from "next/link";

export default function RootIndex() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        gap: 32,
        background: "#faf7f2",
        color: "#0a1019",
      }}
    >
      <h1 style={{ fontSize: 36, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
        Platform
      </h1>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
        <Link
          href="/fundraising"
          style={{
            padding: "16px 28px",
            background: "#0a1019",
            color: "#fff",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 15,
            textDecoration: "none",
            minWidth: 220,
            textAlign: "center",
          }}
        >
          📣 easyfundraisings
        </Link>
        <Link
          href="/dialer"
          style={{
            padding: "16px 28px",
            background: "#fff",
            color: "#0a1019",
            border: "1px solid rgba(10,16,25,0.15)",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 15,
            textDecoration: "none",
            minWidth: 220,
            textAlign: "center",
          }}
        >
          📞 Auto-dialer
        </Link>
      </div>
    </main>
  );
}
