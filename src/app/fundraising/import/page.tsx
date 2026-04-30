"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface AvailableField {
  key: string;
  label: string;
}

interface ParseResult {
  headers: string[];
  mapping: Record<string, string>;
  preview: Record<string, string>[];
  total_rows: number;
  sheet_name: string;
  available_fields: AvailableField[];
}

interface CommitResult {
  created: number;
  skipped: number;
  total: number;
  errors: { row: number; reason: string }[];
}

interface Source { id: string; name: string }

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [defaultStatus, setDefaultStatus] = useState<"prospect" | "donor">("prospect");
  const [defaultSourceId, setDefaultSourceId] = useState("");
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState("");
  const [sources, setSources] = useState<Source[]>([]);

  useEffect(() => {
    fetch("/api/fundraising/sources").then((r) => (r.ok ? r.json() : [])).then((d) => setSources(d || []));
  }, []);

  async function handleFile(f: File) {
    setError("");
    setCommitResult(null);
    setFile(f);
    setParsing(true);
    const fd = new FormData();
    fd.append("file", f);
    const res = await fetch("/api/fundraising/import/parse", { method: "POST", body: fd });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setError(e.error || "Parse failed");
      setParsing(false);
      return;
    }
    const data = await res.json();
    setParseResult(data);
    setParsing(false);
  }

  function updateMapping(header: string, fieldKey: string) {
    if (!parseResult) return;
    setParseResult({ ...parseResult, mapping: { ...parseResult.mapping, [header]: fieldKey } });
  }

  async function commit() {
    if (!file || !parseResult) return;
    setCommitting(true);
    setError("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mapping", JSON.stringify(parseResult.mapping));
    fd.append("default_status", defaultStatus);
    if (defaultSourceId) fd.append("default_source_id", defaultSourceId);
    const res = await fetch("/api/fundraising/import/commit", { method: "POST", body: fd });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setError(e.error || "Import failed");
      setCommitting(false);
      return;
    }
    setCommitResult(await res.json());
    setCommitting(false);
  }

  function reset() {
    setFile(null);
    setParseResult(null);
    setCommitResult(null);
    setError("");
  }

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontFamily: "var(--font-bricolage), sans-serif", fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
          Import donors from Excel / CSV
        </h1>
        <div style={{ fontSize: 13, opacity: 0.6, marginTop: 4 }}>
          Upload your spreadsheet, map your columns to donor fields, preview, and commit. Hebrew names &amp; UTF-8 supported.
        </div>
      </div>

      {/* Step 1: Upload */}
      {!parseResult && !commitResult && (
        <div
          style={{
            background: "#fff",
            border: "2px dashed rgba(10,16,25,0.15)",
            borderRadius: 14,
            padding: 50,
            textAlign: "center",
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) handleFile(f);
          }}
        >
          <div style={{ fontSize: 50, marginBottom: 10 }}>📁</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
            {parsing ? "Reading file…" : "Drop a file here or click to upload"}
          </div>
          <div style={{ fontSize: 13, opacity: 0.55, marginBottom: 16 }}>
            Supports .xlsx, .xls, .csv — up to 10MB
          </div>
          <label style={{ cursor: "pointer", display: "inline-block" }}>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
              style={{ display: "none" }}
            />
            <span
              style={{
                padding: "10px 18px",
                background: "var(--cast-iron)",
                color: "#fff",
                borderRadius: 10,
                fontWeight: 700,
                fontSize: 14,
                display: "inline-block",
              }}
            >
              Choose file
            </span>
          </label>
          {error && (
            <div style={{ color: "var(--cone-orange)", fontSize: 13, marginTop: 16 }}>{error}</div>
          )}
        </div>
      )}

      {/* Step 2: Map columns + preview */}
      {parseResult && !commitResult && (
        <>
          <div style={{ background: "#fff", border: "1px solid rgba(10,16,25,0.08)", borderRadius: 12, padding: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{file?.name}</div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>
                  Sheet: {parseResult.sheet_name} · {parseResult.total_rows} rows · {parseResult.headers.length} columns
                </div>
              </div>
              <button onClick={reset} style={ghostBtn}>Choose different file</button>
            </div>
          </div>

          <div style={{ background: "#fff", border: "1px solid rgba(10,16,25,0.08)", borderRadius: 12, padding: 18, marginBottom: 12 }}>
            <h2 style={sectionTitle}>1. Defaults</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              <div>
                <Label>Default status (when not in file)</Label>
                <select value={defaultStatus} onChange={(e) => setDefaultStatus(e.target.value as "prospect" | "donor")} style={inputStyle}>
                  <option value="prospect">Prospect</option>
                  <option value="donor">Donor</option>
                </select>
              </div>
              <div>
                <Label>Default source (when not in file)</Label>
                <select value={defaultSourceId} onChange={(e) => setDefaultSourceId(e.target.value)} style={inputStyle}>
                  <option value="">— None —</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div style={{ background: "#fff", border: "1px solid rgba(10,16,25,0.08)", borderRadius: 12, padding: 18, marginBottom: 12 }}>
            <h2 style={sectionTitle}>2. Map columns</h2>
            <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 12 }}>
              We auto-detected your columns — adjust where needed. Set to &ldquo;Skip&rdquo; to ignore a column.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
              {parseResult.headers.filter((h) => h).map((h) => (
                <div key={h} style={{ display: "flex", alignItems: "center", gap: 8, background: "#fbf7ec", padding: 10, borderRadius: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{h}</div>
                    <div style={{ fontSize: 10, opacity: 0.55 }}>
                      e.g. {String(parseResult.preview[0]?.[h] || "").slice(0, 30) || "—"}
                    </div>
                  </div>
                  <span style={{ opacity: 0.4, fontSize: 16 }}>→</span>
                  <select
                    value={parseResult.mapping[h] || "skip"}
                    onChange={(e) => updateMapping(h, e.target.value)}
                    style={{ ...inputStyle, width: 160, padding: "7px 10px", fontSize: 12 }}
                  >
                    {parseResult.available_fields.map((f) => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: "#fff", border: "1px solid rgba(10,16,25,0.08)", borderRadius: 12, padding: 18, marginBottom: 12 }}>
            <h2 style={sectionTitle}>3. Preview (first 5 rows)</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#fbf7ec", textAlign: "left" }}>
                    {parseResult.headers.filter((h) => h).map((h) => (
                      <th key={h} style={{ padding: "8px 10px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", opacity: 0.6 }}>
                        {h}
                        {parseResult.mapping[h] && parseResult.mapping[h] !== "skip" && (
                          <div style={{ fontSize: 9, color: "var(--blueprint)", textTransform: "none", marginTop: 2 }}>
                            → {parseResult.available_fields.find((f) => f.key === parseResult.mapping[h])?.label}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parseResult.preview.map((row, i) => (
                    <tr key={i} style={{ borderTop: "1px solid rgba(10,16,25,0.05)" }}>
                      {parseResult.headers.filter((h) => h).map((h) => {
                        const skipped = parseResult.mapping[h] === "skip" || !parseResult.mapping[h];
                        return (
                          <td
                            key={h}
                            style={{
                              padding: "8px 10px",
                              opacity: skipped ? 0.3 : 1,
                              textDecoration: skipped ? "line-through" : "none",
                            }}
                          >
                            {row[h] || ""}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {error && (
            <div style={{ background: "rgba(232,93,31,0.1)", color: "var(--cone-orange)", padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={reset} style={ghostBtn}>Cancel</button>
            <button onClick={commit} disabled={committing} style={primaryBtn}>
              {committing ? "Importing…" : `Import ${parseResult.total_rows} rows`}
            </button>
          </div>
        </>
      )}

      {/* Step 3: Result */}
      {commitResult && (
        <div
          style={{
            background: "#fff",
            border: "1px solid rgba(10,16,25,0.08)",
            borderRadius: 14,
            padding: 30,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 50, marginBottom: 10 }}>✅</div>
          <h2 style={{ fontSize: 24, fontWeight: 800, fontFamily: "var(--font-bricolage), sans-serif", margin: "0 0 8px" }}>
            Import complete
          </h2>
          <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 20 }}>
            <strong style={{ color: "var(--shed-green)" }}>{commitResult.created}</strong> donors created
            {commitResult.skipped > 0 && (
              <> · <strong style={{ color: "var(--cone-orange)" }}>{commitResult.skipped}</strong> skipped</>
            )}
            {" "}out of {commitResult.total} rows.
          </div>

          {commitResult.errors.length > 0 && (
            <div
              style={{
                background: "rgba(232,93,31,0.06)",
                borderRadius: 8,
                padding: 14,
                textAlign: "left",
                marginBottom: 20,
                maxHeight: 240,
                overflowY: "auto",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "var(--cone-orange)" }}>Errors:</div>
              {commitResult.errors.map((er, i) => (
                <div key={i} style={{ fontSize: 12, marginBottom: 3 }}>
                  Row {er.row}: {er.reason}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <Link
              href="/fundraising/prospects"
              style={{
                padding: "10px 18px",
                background: "var(--cast-iron)",
                color: "#fff",
                borderRadius: 10,
                textDecoration: "none",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              View prospects
            </Link>
            <button onClick={reset} style={ghostBtn}>Import another file</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.65, marginBottom: 4 }}>
      {children}
    </div>
  );
}

const sectionTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  margin: "0 0 12px",
};
const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  border: "1px solid rgba(10,16,25,0.14)",
  borderRadius: 8,
  fontSize: 13,
  width: "100%",
  outline: "none",
  background: "#fff",
};
const primaryBtn: React.CSSProperties = {
  padding: "10px 18px",
  background: "var(--cast-iron)",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};
const ghostBtn: React.CSSProperties = {
  padding: "10px 18px",
  background: "transparent",
  border: "1px solid rgba(10,16,25,0.12)",
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
