"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function showToast(msg: string) {
  const el = document.getElementById("bm-toast");
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = "1";
  el.style.transform = "translateY(0)";
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(12px)";
  }, 2200);
}

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; company: string; plan: string; email: string; status: string; trial_end_date: string | null } | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [accessBlocked, setAccessBlocked] = useState(false);
  const [trialExpired, setTrialExpired] = useState(false);
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);
  const [isTeamMember, setIsTeamMember] = useState(false);
  const [teamRole, setTeamRole] = useState<string>("viewer");

  useEffect(() => {
    // Try team-auth first, then contractor-auth
    fetch("/api/team-auth/me").then(r => r.ok ? r.json() : null).then(tm => {
      if (tm) {
        setIsTeamMember(true);
        setTeamRole(tm.role);
        setUser({ name: tm.name, company: "", plan: "Team", email: tm.email, status: "active", trial_end_date: null });
        return;
      }
      // Not a team member, check regular auth
      fetch("/api/auth/me").then(r => r.ok ? r.json() : null).then(u => {
        setUser(u);
        if (!u) return;
        if (u.plan === 'Pro' && u.status === 'active') return;
        if (u.status === 'trial' && u.trial_end_date) {
          const end = new Date(u.trial_end_date);
          const now = new Date();
          const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (daysLeft <= 0) {
            setTrialExpired(true);
            setAccessBlocked(true);
          } else {
            setTrialDaysLeft(daysLeft);
          }
          return;
        }
        if (u.status === 'pending') {
          setAccessBlocked(true);
        }
      }).catch(() => {});
    }).catch(() => {});
  }, []);

  async function handleLogout() {
    if (isTeamMember) {
      await fetch("/api/team-auth/logout", { method: "POST" });
    } else {
      await fetch("/api/auth/logout", { method: "POST" });
    }
    router.push("/login");
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      {/* Top Navigation Bar */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "var(--surface)", borderBottom: "1.5px solid var(--border)",
        padding: "0 24px", height: 54,
        display: "flex", alignItems: "center", gap: 20,
      }}>
        {/* Logo */}
        <Link href="/customer" style={{
          textDecoration: "none", display: "flex", alignItems: "center", gap: 6,
          marginRight: 12, flexShrink: 0,
        }}>
          <span style={{
            fontFamily: "'Bricolage Grotesque', sans-serif",
            fontWeight: 800, fontSize: "1.15rem", letterSpacing: "-0.03em",
            color: "var(--ink)",
          }}>
            Bid<span style={{ color: "var(--gold)" }}>Master</span>
          </span>
        </Link>

        {/* Nav links */}
        <div style={{ display: "flex", gap: 2, flex: 1 }}>
          {[
            { label: "Projects", href: "/customer" },
            { label: "Vendors", href: "/customer/vendors" },
            { label: "Bid Templates", href: "/customer/bid-templates" },
          ].map(item => {
            const isActive = item.href === "/customer"
              ? pathname === "/customer"
              : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                style={{
                  padding: "6px 14px", borderRadius: 7,
                  fontSize: "0.82rem", fontWeight: 600,
                  color: isActive ? "var(--gold)" : "var(--ink2)",
                  background: isActive ? "var(--gold-bg)" : "transparent",
                  textDecoration: "none",
                  transition: "all 0.15s",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Right section */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isTeamMember && (
            <span style={{
              padding: "3px 8px", borderRadius: 6, fontSize: "0.68rem", fontWeight: 700,
              background: teamRole === "editor" ? "var(--blue-bg)" : "var(--bg)",
              color: teamRole === "editor" ? "var(--blue)" : "var(--muted)",
              border: "1px solid var(--border)",
            }}>
              {teamRole === "editor" ? "Editor" : "Viewer"}
            </span>
          )}
          {(!isTeamMember || teamRole === "editor") && (
            <Link
              href="/customer/create"
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "6px 14px", borderRadius: 7,
                fontSize: "0.78rem", fontWeight: 700,
                background: "var(--gold)", color: "#fff",
                textDecoration: "none", transition: "all 0.15s",
              }}
            >
              + New Bid
            </Link>
          )}

          {/* User menu */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "4px 10px 4px 4px", borderRadius: 8,
                background: "none", border: "1.5px solid var(--border)",
                cursor: "pointer", fontSize: "0.8rem", color: "var(--ink)",
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: "var(--gold)", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: "0.68rem",
              }}>
                {user ? user.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?"}
              </div>
              <span style={{ fontWeight: 600, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.name?.split(" ")[0] || "..."}
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
            </button>

            {showUserMenu && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 98 }} onClick={() => setShowUserMenu(false)} />
                <div style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0, width: 200,
                  background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 10,
                  boxShadow: "0 8px 32px rgba(0,0,0,0.12)", zIndex: 99, overflow: "hidden",
                  padding: "4px",
                }}>
                  <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ fontWeight: 700, fontSize: "0.84rem", color: "var(--ink)" }}>{user?.name}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                      {user?.email}
                      {isTeamMember && <span style={{ marginLeft: 6, color: "var(--gold)" }}>(Team)</span>}
                    </div>
                  </div>
                  {!isTeamMember && (
                    <>
                      <Link
                        href="/customer/settings"
                        onClick={() => setShowUserMenu(false)}
                        style={{
                          display: "block", padding: "8px 12px", fontSize: "0.82rem",
                          color: "var(--ink)", textDecoration: "none", borderRadius: 6,
                          fontWeight: 600,
                        }}
                        onMouseOver={e => { e.currentTarget.style.background = "var(--bg)"; }}
                        onMouseOut={e => { e.currentTarget.style.background = "transparent"; }}
                      >
                        Settings
                      </Link>
                      <Link
                        href="/customer/billing"
                        onClick={() => setShowUserMenu(false)}
                        style={{
                          display: "block", padding: "8px 12px", fontSize: "0.82rem",
                          color: "var(--ink)", textDecoration: "none", borderRadius: 6,
                          fontWeight: 600,
                        }}
                        onMouseOver={e => { e.currentTarget.style.background = "var(--bg)"; }}
                        onMouseOut={e => { e.currentTarget.style.background = "transparent"; }}
                      >
                        Billing
                      </Link>
                    </>
                  )}
                  <button
                    onClick={handleLogout}
                    style={{
                      display: "block", width: "100%", padding: "8px 12px", fontSize: "0.82rem",
                      color: "var(--muted)", textAlign: "left", borderRadius: 6,
                      background: "none", border: "none", cursor: "pointer",
                      fontWeight: 600,
                    }}
                    onMouseOver={e => { e.currentTarget.style.background = "var(--bg)"; }}
                    onMouseOut={e => { e.currentTarget.style.background = "transparent"; }}
                  >
                    Logout
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Trial days remaining banner */}
      {trialDaysLeft !== null && trialDaysLeft <= 7 && !accessBlocked && (
        <div style={{
          background: trialDaysLeft <= 3 ? "#fef2f2" : "#fffbeb",
          borderBottom: `1.5px solid ${trialDaysLeft <= 3 ? "#fecaca" : "#fde68a"}`,
          padding: "8px 24px", display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
          fontSize: "0.82rem", fontWeight: 600,
          color: trialDaysLeft <= 3 ? "#991b1b" : "#92400e",
        }}>
          <span>{trialDaysLeft <= 3 ? "⚠️" : "⏰"} Trial ends in {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""}</span>
          <Link href="/customer/billing" style={{
            padding: "4px 12px", borderRadius: 6, fontSize: "0.78rem", fontWeight: 700,
            background: "var(--gold)", color: "#fff", textDecoration: "none",
          }}>Subscribe Now</Link>
        </div>
      )}

      {/* Access blocked screen (allow billing page through) */}
      {accessBlocked && !pathname?.includes('/billing') ? (
        <div style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          padding: "40px 20px",
        }}>
          <div style={{
            maxWidth: 480, width: "100%", textAlign: "center",
            background: "var(--surface)", border: "1.5px solid var(--border)",
            borderRadius: 16, padding: "48px 36px",
          }}>
            <div style={{ fontSize: "3rem", marginBottom: 16 }}>{trialExpired ? "⏰" : "🔒"}</div>
            <h2 style={{
              fontFamily: "'Bricolage Grotesque', sans-serif",
              fontWeight: 800, fontSize: "1.3rem", marginBottom: 8,
              color: "var(--ink)",
            }}>
              {trialExpired ? "Trial Period Ended" : "Account Not Active"}
            </h2>
            <p style={{ color: "var(--muted)", fontSize: "0.88rem", lineHeight: 1.6, marginBottom: 24 }}>
              {trialExpired
                ? "Your trial period has expired. Subscribe to Pro to continue using BidMaster, or contact us to extend your trial."
                : "Your account is pending activation. Subscribe to Pro to get started, or request a free trial period."
              }
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
              <Link href="/customer/billing" style={{
                display: "inline-block", padding: "12px 32px", borderRadius: 8,
                background: "var(--gold)", color: "#fff", fontWeight: 700, fontSize: "0.92rem",
                textDecoration: "none", width: "100%",
              }}>
                Subscribe — $199/mo
              </Link>
              <a href={`mailto:info@bidmaster.app?subject=Trial%20Request&body=${encodeURIComponent(`Hi,\n\nI would like to request a free trial for BidMaster.\n\nMy name: ${user?.name || ''}\nMy email: ${user?.email || ''}\nCompany: ${user?.company || ''}\n\nThank you!`)}`} style={{
                display: "inline-block", padding: "12px 32px", borderRadius: 8,
                border: "1.5px solid var(--border)", background: "var(--surface)",
                color: "var(--ink)", fontWeight: 700, fontSize: "0.92rem",
                textDecoration: "none", width: "100%",
              }}>
                Request Free Trial
              </a>
            </div>
            <button
              onClick={handleLogout}
              style={{
                marginTop: 20, background: "none", border: "none",
                color: "var(--muted)", fontSize: "0.8rem", cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Page content */}
          <div className="content" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 20px", width: "100%", flex: 1 }}>
            {children}
          </div>
        </>
      )}

      {/* Toast */}
      <div
        id="bm-toast"
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          background: "var(--ink)",
          color: "#fff",
          padding: "12px 20px",
          borderRadius: "10px",
          fontSize: "0.84rem",
          fontWeight: 700,
          opacity: 0,
          transform: "translateY(12px)",
          transition: "opacity 0.25s, transform 0.25s",
          zIndex: 9999,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
