"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import CommandPalette from "./_components/CommandPalette";

interface SessionInfo {
  role: "manager" | "fundraiser";
  name: string;
  email: string;
}

const NAV: { href: string; label: string; managerOnly?: boolean }[] = [
  { href: "/fundraising", label: "Dashboard" },
  { href: "/fundraising/today", label: "Today" },
  { href: "/fundraising/prospects", label: "Prospects" },
  { href: "/fundraising/donors", label: "Donors" },
  { href: "/fundraising/projects", label: "Projects" },
  { href: "/fundraising/collections", label: "Collections" },
  { href: "/fundraising/calendar", label: "Calendar" },
  { href: "/fundraising/reports", label: "Reports" },
  { href: "/fundraising/team", label: "Team", managerOnly: true },
  { href: "/fundraising/import", label: "Import", managerOnly: true },
  { href: "/fundraising/settings", label: "Settings", managerOnly: true },
];

export default function FundraisingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/fundraising/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setSession(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleLogout() {
    if (session?.role === "fundraiser") {
      await fetch("/api/team-auth/logout", { method: "POST" });
    } else {
      await fetch("/api/auth/logout", { method: "POST" });
    }
    router.push("/login");
  }

  const visibleNav = NAV.filter((n) => !n.managerOnly || session?.role === "manager");

  return (
    <div className="fr-shell" style={{ minHeight: "100vh", background: "var(--paper)", display: "flex", flexDirection: "column", color: "var(--cast-iron)" }}>
      <div className="so-shed-ribbon" />

      <header
        style={{
          background: "#ffffff",
          borderBottom: "1px solid rgba(10,16,25,0.08)",
          padding: "0 32px",
          display: "flex",
          alignItems: "stretch",
          gap: 28,
          position: "sticky",
          top: 0,
          zIndex: 50,
          height: 56,
        }}
      >
        <Link
          href="/fundraising"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
            color: "var(--cast-iron)",
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              background: "var(--cast-iron)",
              color: "var(--paper)",
              display: "grid",
              placeItems: "center",
              fontWeight: 700,
              fontFamily: "var(--font-bricolage), sans-serif",
              fontSize: 14,
              lineHeight: 1,
            }}
          >
            e
          </div>
          <span
            style={{
              fontFamily: "var(--font-bricolage), sans-serif",
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            easyfundraisings
          </span>
        </Link>

        <nav
          style={{
            display: "flex",
            alignItems: "stretch",
            gap: 0,
            flex: 1,
            overflowX: "auto",
          }}
        >
          {visibleNav.map((item) => {
            const active =
              item.href === "/fundraising" ? pathname === "/fundraising" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "0 14px",
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  textDecoration: "none",
                  color: active ? "var(--cast-iron)" : "rgba(10,16,25,0.62)",
                  whiteSpace: "nowrap",
                  borderBottom: active ? "2px solid var(--cast-iron)" : "2px solid transparent",
                  marginBottom: -1,
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={() => {
            const e = new KeyboardEvent("keydown", { key: "k", metaKey: true });
            window.dispatchEvent(e);
          }}
          style={{
            alignSelf: "center",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "5px 8px 5px 12px",
            background: "transparent",
            border: "1px solid rgba(10,16,25,0.12)",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 12,
            color: "rgba(10,16,25,0.55)",
            fontFamily: "inherit",
          }}
          title="Search and quick actions (⌘K)"
        >
          <span className="fr-search-label">Search</span>
          <kbd
            style={{
              padding: "1px 5px",
              background: "rgba(10,16,25,0.05)",
              borderRadius: 3,
              fontSize: 10,
              fontWeight: 600,
              fontFamily: "var(--font-mono, ui-monospace, monospace)",
              color: "rgba(10,16,25,0.5)",
            }}
          >
            ⌘K
          </kbd>
        </button>

        <div style={{ position: "relative", alignSelf: "center" }}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 10px 4px 4px",
              borderRadius: 6,
              border: "1px solid rgba(10,16,25,0.12)",
              background: "#fff",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--cast-iron)",
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 4,
                background: "var(--paper)",
                color: "var(--cast-iron)",
                display: "grid",
                placeItems: "center",
                fontSize: 11,
                fontWeight: 700,
                fontFamily: "var(--font-bricolage), sans-serif",
              }}
            >
              {session?.name?.[0]?.toUpperCase() || "?"}
            </div>
            <span className="fr-user-name" style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {loading ? "…" : session?.name || "Guest"}
            </span>
          </button>
          {menuOpen && session && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                minWidth: 220,
                background: "#fff",
                border: "1px solid rgba(10,16,25,0.1)",
                borderRadius: 8,
                boxShadow: "0 8px 24px rgba(10,16,25,0.08)",
                padding: 6,
                zIndex: 60,
              }}
            >
              <div
                style={{
                  padding: "8px 10px 10px",
                  borderBottom: "1px solid rgba(10,16,25,0.06)",
                  marginBottom: 4,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700 }}>{session.name}</div>
                <div style={{ fontSize: 11, opacity: 0.55 }}>{session.email}</div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    opacity: 0.5,
                  }}
                >
                  {session.role}
                </div>
              </div>
              <button
                onClick={handleLogout}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "7px 10px",
                  borderRadius: 4,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 13,
                  color: "var(--cast-iron)",
                  fontWeight: 500,
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main style={{ flex: 1, padding: "28px 32px" }}>{children}</main>

      <CommandPalette />

      <div
        id="fr-toast"
        style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%) translateY(12px)",
          background: "var(--cast-iron)",
          color: "#fff",
          padding: "10px 16px",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          opacity: 0,
          transition: "all var(--dur-base) var(--ease-out)",
          pointerEvents: "none",
          zIndex: 100,
        }}
      />
    </div>
  );
}
