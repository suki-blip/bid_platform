export default function ComingSoon({ title, stage }: { title: string; stage: string }) {
  return (
    <div style={{ maxWidth: 720, margin: "60px auto", textAlign: "center" }}>
      <div
        style={{
          display: "inline-block",
          padding: "4px 10px",
          borderRadius: 999,
          background: "rgba(28,93,142,0.1)",
          color: "var(--blueprint)",
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        Coming in {stage}
      </div>
      <h1
        style={{
          fontFamily: "var(--font-bricolage), sans-serif",
          fontSize: 36,
          fontWeight: 800,
          margin: "16px 0 8px",
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </h1>
      <p style={{ fontSize: 14, opacity: 0.6, margin: 0 }}>
        This section is being built. Stage 1 ships the foundation; the next stages add Donors, Pledges, Collections,
        Calendar, and Reports in order.
      </p>
    </div>
  );
}
