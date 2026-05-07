"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function ResultContent() {
  const params = useSearchParams();
  const status = params.get("status") || "completed";
  const token = params.get("token");
  const [polled, setPolled] = useState<{ status: string; amount: number; gateway_ref: string | null; failure_reason: string | null } | null>(null);

  // If we have a token, fetch the actual session details to confirm.
  useEffect(() => {
    if (!token) return;
    fetch(`/api/fundraising/payment-sessions/${token}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setPolled(d));
  }, [token]);

  const final = polled?.status || status;
  const isOk = final === "completed";
  const isFailed = final === "failed" || final === "expired";

  return (
    <div style={{ maxWidth: 560, margin: "60px auto", padding: 20 }}>
      <div
        style={{
          background: "#fff",
          border: isOk ? "2px solid var(--shed-green)" : isFailed ? "2px solid var(--cone-orange)" : "1px solid rgba(10,16,25,0.08)",
          borderRadius: 14,
          padding: 36,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 64, marginBottom: 10 }}>{isOk ? "✅" : isFailed ? "⚠️" : "⏳"}</div>
        <h1 style={{ fontFamily: "var(--font-bricolage), sans-serif", fontSize: 26, fontWeight: 800, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
          {isOk ? "Payment received" : isFailed ? "Payment did not complete" : "Processing…"}
        </h1>
        {polled?.amount && (
          <p style={{ fontSize: 14, opacity: 0.7, margin: 0 }}>
            ${polled.amount.toFixed(2)}
            {polled.gateway_ref ? ` · ref ${polled.gateway_ref}` : ""}
          </p>
        )}
        {polled?.failure_reason && (
          <p style={{ fontSize: 13, color: "var(--cone-orange)", marginTop: 8 }}>{polled.failure_reason}</p>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
          <Link
            href="/fundraising/payment"
            style={{
              padding: "10px 18px",
              background: "var(--cast-iron)",
              color: "#fff",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            Record another payment
          </Link>
          <Link
            href="/fundraising"
            style={{
              padding: "10px 18px",
              background: "transparent",
              color: "var(--cast-iron)",
              border: "1px solid rgba(10,16,25,0.18)",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PaymentResultPage() {
  return (
    <Suspense fallback={<div style={{ padding: 30, opacity: 0.5 }}>Loading…</div>}>
      <ResultContent />
    </Suspense>
  );
}
