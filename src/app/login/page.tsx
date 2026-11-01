"use client";

// Shared login page for the two products that live in this repo.
//
// After BidMaster was retired, there's no vendor flow and no "contractor" account tier
// to distinguish — a single email + password owns both easyfundraisings (/fundraising) and
// the auto-dialer (/dialer). The post-login redirect is host-aware so a sign-in on
// easyfundraisings.com lands on /fundraising and nothing else.
//
// Deliberately slim: no multi-tab UI, no vendor password reset flow, no self-serve
// registration link (admin creates owner accounts manually now).

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, opacity: 0.6 }}>Loading…</div>}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resetToken = searchParams?.get("reset") || "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleClientId, setGoogleClientId] = useState("");
  const [error, setError] = useState("");
  const [isFundraisingBrand, setIsFundraisingBrand] = useState(false);

  // Branding switch — the deployed host decides which product name to show.
  // On easyfundraisings.com we're obviously signing into easyfundraisings; elsewhere
  // we show a neutral "Platform" label so there's no leftover BidMaster chrome.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fundraising = window.location.hostname.includes("easyfundraisings");
    setIsFundraisingBrand(fundraising);
    document.title = fundraising ? "easyfundraisings — Sign in" : "Platform — Sign in";
  }, []);

  const postLoginRedirect = isFundraisingBrand ? "/fundraising" : "/";

  // Fetch the Google OAuth client ID once (optional sign-in method).
  useEffect(() => {
    fetch("/api/auth/google-client-id")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.client_id && setGoogleClientId(d.client_id))
      .catch(() => {});
  }, []);

  const handleGoogleResponse = useCallback(
    async (response: { credential?: string }) => {
      setError("");
      setGoogleLoading(true);
      try {
        const res = await fetch("/api/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: response.credential }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Google login failed");
          setGoogleLoading(false);
          return;
        }
        router.push(postLoginRedirect);
      } catch {
        setError("Network error.");
        setGoogleLoading(false);
      }
    },
    [router, postLoginRedirect],
  );

  // Mount the Google Identity Services script + render the button once we have a client ID.
  useEffect(() => {
    if (!googleClientId) return;
    const w = window as unknown as { google?: unknown; handleGoogleSignIn?: typeof handleGoogleResponse };
    w.handleGoogleSignIn = handleGoogleResponse;
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) return;
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    document.head.appendChild(s);
  }, [googleClientId, handleGoogleResponse]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid credentials");
        setLoading(false);
        return;
      }
      router.push(postLoginRedirect);
    } catch {
      setError("Network error — try again.");
      setLoading(false);
    }
  }

  // Password-reset flow: when ?reset=TOKEN is in the URL, show the new-password form
  // instead of login. Posts to /api/auth/reset-password.
  if (resetToken) {
    return <ResetPasswordForm token={resetToken} onDone={() => router.push("/login")} />;
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
        background: "#faf7f2",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: "#0a1019",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          background: "#fff",
          padding: 32,
          borderRadius: 14,
          boxShadow: "0 8px 32px rgba(10,16,25,0.06)",
          width: "100%",
          maxWidth: 400,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ marginBottom: 10 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>
            {isFundraisingBrand ? "easyfundraisings" : "Platform"}
          </h1>
          <div style={{ fontSize: 13, opacity: 0.6, marginTop: 4 }}>Sign in to continue.</div>
        </div>

        <label style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", opacity: 0.65 }}>
          Email
        </label>
        <input
          type="email"
          autoComplete="username"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={inputStyle}
        />

        <label style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", opacity: 0.65 }}>
          Password
        </label>
        <div style={{ position: "relative" }}>
          <input
            type={showPw ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ ...inputStyle, paddingRight: 60 }}
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            style={{
              position: "absolute",
              right: 10,
              top: 10,
              background: "transparent",
              border: "none",
              fontSize: 11,
              fontWeight: 700,
              color: "rgba(10,16,25,0.55)",
              cursor: "pointer",
            }}
          >
            {showPw ? "HIDE" : "SHOW"}
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: "9px 12px",
              background: "rgba(232,93,31,0.08)",
              border: "1px solid rgba(232,93,31,0.25)",
              borderRadius: 6,
              fontSize: 13,
              color: "#c54b1a",
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "12px",
            background: "#0a1019",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 14,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>

        {googleClientId && (
          <>
            <div style={{ textAlign: "center", fontSize: 11, opacity: 0.45, margin: "4px 0" }}>OR</div>
            <div
              id="g_id_onload"
              data-client_id={googleClientId}
              data-callback="handleGoogleSignIn"
              data-auto_prompt="false"
            />
            <div className="g_id_signin" data-type="standard" data-size="large" data-text="signin_with" data-width="336" />
            {googleLoading && (
              <div style={{ fontSize: 12, opacity: 0.6, textAlign: "center" }}>Signing in with Google…</div>
            )}
          </>
        )}

        <Link
          href="/forgot-password"
          style={{
            fontSize: 12,
            color: "rgba(10,16,25,0.55)",
            textAlign: "center",
            textDecoration: "none",
            marginTop: 6,
          }}
        >
          Forgot password?
        </Link>
      </form>
    </main>
  );
}

function ResetPasswordForm({ token, onDone }: { token: string; onDone: () => void }) {
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (pw1 !== pw2) {
      setError("Passwords do not match");
      return;
    }
    if (pw1.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setBusy(true);
    const r = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: pw1 }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setError(d.error || "Reset failed");
      return;
    }
    setDone(true);
    setTimeout(onDone, 1500);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
        background: "#faf7f2",
        fontFamily: "-apple-system, sans-serif",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          background: "#fff",
          padding: 32,
          borderRadius: 14,
          boxShadow: "0 8px 32px rgba(10,16,25,0.06)",
          width: "100%",
          maxWidth: 400,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Reset password</h1>
        {done ? (
          <div style={{ color: "#1f7a45", fontSize: 14, fontWeight: 700 }}>
            ✓ Password reset. Redirecting to sign in…
          </div>
        ) : (
          <>
            <input
              type="password"
              placeholder="New password"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
              required
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              required
              style={inputStyle}
            />
            {error && (
              <div style={{ padding: "8px 10px", background: "rgba(232,93,31,0.08)", border: "1px solid rgba(232,93,31,0.25)", borderRadius: 6, fontSize: 13, color: "#c54b1a" }}>
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              style={{
                padding: 12,
                background: "#0a1019",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 14,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              {busy ? "Setting…" : "Set new password"}
            </button>
          </>
        )}
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "11px 12px",
  border: "1px solid rgba(10,16,25,0.14)",
  borderRadius: 8,
  fontSize: 14,
  outline: "none",
  background: "#fff",
  width: "100%",
  boxSizing: "border-box",
};
