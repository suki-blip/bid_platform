"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Sola/Cardknox iFields embed.
//
// Loads https://cdn.cardknox.com/ifields/2.16.2412.0801/ifields.min.js, calls
// setAccount(ifieldsKey, softwareName, '1.0'), and renders the two iframe-style
// inputs (card-number + cvv). When the parent calls `submit()` via the imperative
// ref, we run getTokens() and resolve with { sut_card, sut_cvv }.
//
// Why imperative? The parent already owns the donor / mode / amount form state.
// We just need to surface the SUTs at submit-time. The parent posts them to
// /api/fundraising/sola/charge.
//
// Why iFields and not a custom <input>? PCI compliance. The card number and CVV
// inputs are rendered by Cardknox inside cross-origin iframes — sensitive data
// never touches our DOM, our server, or our network logs. Cardknox returns
// single-use tokens (SUTs) instead, which the merchant API can charge once.

const IFIELDS_SCRIPT_URL = "https://cdn.cardknox.com/ifields/2.16.2412.0801/ifields.min.js";

// The script attaches these globals to window:
interface IFieldsAPI {
  setAccount: (ifieldsKey: string, softwareName: string, softwareVersion: string) => void;
  getTokens: (
    onSuccess: () => void,
    onError: (err: { reason?: string }) => void,
    timeoutMs?: number,
  ) => void;
}

declare global {
  interface Window {
    setAccount?: IFieldsAPI["setAccount"];
    getTokens?: IFieldsAPI["getTokens"];
  }
}

// Load the iFields script exactly once across the app.
let scriptLoadedPromise: Promise<void> | null = null;
function loadIFieldsScript(): Promise<void> {
  if (scriptLoadedPromise) return scriptLoadedPromise;
  scriptLoadedPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("ssr"));
    if (window.setAccount) return resolve();
    const existing = document.querySelector(`script[src="${IFIELDS_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("iFields script failed to load")));
      return;
    }
    const s = document.createElement("script");
    s.src = IFIELDS_SCRIPT_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("iFields script failed to load"));
    document.head.appendChild(s);
  });
  return scriptLoadedPromise;
}

export interface SolaCardFormHandle {
  // Triggers iFields.getTokens(). Returns the SUTs the form has produced.
  collectTokens: () => Promise<{ sut_card: string; sut_cvv: string | null; exp: string; zip: string | null; street: string | null }>;
  // Clears the iframe inputs (after a successful or failed submit).
  reset: () => void;
}

export interface SolaCardFormProps {
  ifieldsKey: string;
  softwareName: string;
  /** Disable interaction (e.g. during submit). */
  disabled?: boolean;
  /** Imperative handle setter — parent calls .collectTokens() at submit-time. */
  onReady?: (handle: SolaCardFormHandle) => void;
}

export default function SolaCardForm({ ifieldsKey, softwareName, disabled, onReady }: SolaCardFormProps) {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const cardTokenRef = useRef<HTMLInputElement>(null);
  const cvvTokenRef = useRef<HTMLInputElement>(null);
  const [exp, setExp] = useState(""); // MM/YY input
  const [zip, setZip] = useState("");
  const [street, setStreet] = useState("");

  // 1. Load the script + init the account
  useEffect(() => {
    let cancelled = false;
    loadIFieldsScript()
      .then(() => {
        if (cancelled) return;
        try {
          window.setAccount?.(ifieldsKey, softwareName || "easyfundraisings", "1.0");
          setLoaded(true);
        } catch (e) {
          setLoadError((e as Error).message);
        }
      })
      .catch((e: Error) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, [ifieldsKey, softwareName]);

  // 2. Provide the imperative handle to the parent
  const collectTokens = useCallback((): Promise<{ sut_card: string; sut_cvv: string | null; exp: string; zip: string | null; street: string | null }> => {
    return new Promise((resolve, reject) => {
      if (!window.getTokens) {
        reject(new Error("Sola iFields not ready"));
        return;
      }
      // Validate exp: accept MM/YY or MMYY
      const cleanedExp = exp.replace(/[^\d]/g, "");
      if (!/^\d{4}$/.test(cleanedExp)) {
        reject(new Error("Card expiration must be MM/YY"));
        return;
      }
      window.getTokens(
        () => {
          // Tokens have been written into the hidden inputs by Cardknox iFields
          const sutCard = cardTokenRef.current?.value || "";
          const sutCvv = cvvTokenRef.current?.value || "";
          if (!sutCard) {
            reject(new Error("Card number is required"));
            return;
          }
          resolve({
            sut_card: sutCard,
            sut_cvv: sutCvv || null,
            exp: cleanedExp,
            zip: zip.trim() || null,
            street: street.trim() || null,
          });
        },
        (err) => reject(new Error(err.reason || "Could not tokenize card")),
        30_000,
      );
    });
  }, [exp, zip, street]);

  const reset = useCallback(() => {
    setExp("");
    setZip("");
    setStreet("");
    // Reload iframes by re-rendering would be heavy; instead, ask iFields to clear.
    // Cardknox provides `enableAutoFormatting`/`setIfieldStyle` but no documented clear API,
    // so we leave inputs as-is — they're single-use tokens, harmless to keep.
  }, []);

  useEffect(() => {
    if (loaded && onReady) onReady({ collectTokens, reset });
  }, [loaded, onReady, collectTokens, reset]);

  if (loadError) {
    return (
      <div style={{ ...errorBox }}>
        Could not load the Sola card form: {loadError}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: disabled ? 0.55 : 1, pointerEvents: disabled ? "none" : "auto" }}>
      <div>
        <label style={labelStyle}>Card number</label>
        {/* Cardknox iFields injects a sandboxed iframe inside this element when it sees data-ifields="card-number" */}
        <div data-ifields="card-number" data-ifields-placeholder="•••• •••• •••• ••••" style={ifieldsCardCss} />
        {/* Hidden input where Cardknox writes the SUT after getTokens() */}
        <input type="hidden" ref={cardTokenRef} name="xCardNum" data-ifields="card-number-token" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={labelStyle}>Expiration (MM/YY)</label>
          <input
            type="text"
            value={exp}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^\d]/g, "").slice(0, 4);
              setExp(digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits);
            }}
            placeholder="12/28"
            style={plainInputCss}
            autoComplete="cc-exp"
            inputMode="numeric"
          />
        </div>
        <div>
          <label style={labelStyle}>CVV</label>
          <div data-ifields="cvv" data-ifields-placeholder="•••" style={ifieldsCvvCss} />
          <input type="hidden" ref={cvvTokenRef} name="xCVV" data-ifields="cvv-token" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={labelStyle}>Billing zip (optional, helps AVS)</label>
          <input
            type="text"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            placeholder="10001"
            style={plainInputCss}
            autoComplete="postal-code"
          />
        </div>
        <div>
          <label style={labelStyle}>Billing street (optional)</label>
          <input
            type="text"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            placeholder="1 Main St"
            style={plainInputCss}
            autoComplete="address-line1"
          />
        </div>
      </div>

      {!loaded && (
        <div style={{ fontSize: 12, opacity: 0.55 }}>Loading secure card fields…</div>
      )}
      <div style={{ fontSize: 11, opacity: 0.55, display: "flex", alignItems: "center", gap: 6 }}>
        <span>🔒</span>
        <span>Card details are tokenized by Sola Payments — your server never sees the card number.</span>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  opacity: 0.65,
  display: "block",
  marginBottom: 5,
};

const plainInputCss: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid rgba(10,16,25,0.14)",
  borderRadius: 8,
  fontSize: 14,
  width: "100%",
  outline: "none",
  background: "#fff",
};

// The iFields container styles. The iframe Cardknox renders inherits some of these
// via the data attributes, but mostly we just need to size the box correctly.
const ifieldsCardCss: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid rgba(10,16,25,0.14)",
  borderRadius: 8,
  background: "#fff",
  minHeight: 40,
};
const ifieldsCvvCss: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid rgba(10,16,25,0.14)",
  borderRadius: 8,
  background: "#fff",
  minHeight: 40,
};
const errorBox: React.CSSProperties = {
  padding: 14,
  background: "rgba(232,93,31,0.08)",
  border: "1px solid rgba(232,93,31,0.25)",
  borderRadius: 10,
  color: "var(--cone-orange)",
  fontSize: 13,
};
