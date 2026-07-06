"use client";

// Standalone auto-dialer at /dialer — no BidMaster login, just a single passcode gate.
// Set DIALER_PASSCODE (and optionally DIALER_OWNER_EMAIL) in the environment.

import { useEffect, useState } from "react";
import DialerPanel from "../fundraising/_components/DialerPanel";

export default function StandaloneDialerPage() {
  const [state, setState] = useState<"loading" | "locked" | "open" | "unconfigured">("loading");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/dialer/auth");
        const data = await res.json();
        if (!data.configured) setState("unconfigured");
        else setState(data.authed ? "open" : "locked");
      } catch { setState("locked"); }
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      const res = await fetch("/api/dialer/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode: code }) });
      if (res.ok) setState("open");
      else { const d = await res.json().catch(() => ({})); setError(d.error || "Wrong code"); }
    } catch { setError("Something went wrong"); } finally { setBusy(false); }
  }

  const shell: React.CSSProperties = { minHeight: "100vh", background: "#f5f5f3", padding: "32px 20px", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" };

  if (state === "loading") {
    return <div style={{ ...shell, display: "grid", placeItems: "center", opacity: 0.5 }}>Loading…</div>;
  }

  if (state === "unconfigured") {
    return (
      <div style={{ ...shell, display: "grid", placeItems: "center" }}>
        <div style={{ maxWidth: 420, textAlign: "center", background: "#fff", border: "1px solid rgba(10,16,25,0.1)", borderRadius: 14, padding: 28 }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Dialer not set up</div>
          <div style={{ fontSize: 14, opacity: 0.7 }}>Set <code>DIALER_PASSCODE</code> in the environment to enable this page.</div>
        </div>
      </div>
    );
  }

  if (state === "locked") {
    return (
      <div style={{ ...shell, display: "grid", placeItems: "center" }}>
        <form onSubmit={submit} style={{ width: "100%", maxWidth: 360, background: "#fff", border: "1px solid rgba(10,16,25,0.1)", borderRadius: 14, padding: 28 }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 4 }}>📞 Auto-dialer</div>
          <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 20 }}>Enter your access code to continue.</div>
          <input
            type="password"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Access code"
            style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(10,16,25,0.15)", fontSize: 16, boxSizing: "border-box", marginBottom: 12 }}
          />
          {error && <div style={{ marginBottom: 12, padding: "9px 12px", background: "#fee2e2", color: "#991b1b", borderRadius: 8, fontSize: 13 }}>{error}</div>}
          <button type="submit" disabled={busy || !code} style={{ width: "100%", padding: "12px", background: "#0f0f0f", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: busy || !code ? "default" : "pointer", opacity: busy || !code ? 0.6 : 1 }}>
            {busy ? "Checking…" : "Unlock"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={shell}>
      <DialerPanel
        title="📞 Auto-dialer"
        endpoints={{
          list: "/api/dialer/calls",
          dialNow: "/api/dialer/dial-now",
          del: (id) => `/api/dialer/calls/${id}`,
        }}
      />
    </div>
  );
}
