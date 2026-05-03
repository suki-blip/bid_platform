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
    <div className="so-shell" style={{ minHeight: "100vh", background: "var(--paper)", display: "flex", flexDirection: "column" }}>
      {/* Sidewalk-shed-green signature ribbon */}
      <div className="so-shed-ribbon" />

      {/* Top Navigation Bar */}
      <nav className="so-topnav">
        {/* Logo */}
        <Link href="/customer" className="so-logo-link">
          <div className="so-logo-icon">M</div>
          <span className="so-logo-text">Bid<span>Master</span></span>
        </Link>

        {/* Nav links */}
        <div className="so-nav-links">
          {[
            { label: "Projects", href: "/customer" },
            { label: "Vendors", href: "/customer/vendors" },
            { label: "Templates", href: "/customer/bid-templates" },
          ].map(item => {
            const isActive = item.href === "/customer"
              ? pathname === "/customer"
              : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`so-nav-link${isActive ? " on" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Right section */}
        <div className="so-topnav-right">
          {isTeamMember && (
            <span className={`stamp ${teamRole === "editor" ? "ok" : "draft"}`}>
              {teamRole === "editor" ? "EDITOR" : "VIEWER"}
            </span>
          )}
          {(!isTeamMember || teamRole === "editor") && (
            <Link href="/customer/create" className="so-cta">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
              <span>New Bid</span>
            </Link>
          )}

          {/* User menu */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="so-user-btn"
            >
              <div className="so-avatar">
                {user ? user.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?"}
              </div>
              <span style={{ fontWeight: 600, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.name?.split(" ")[0] || "…"}
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 9l6 6 6-6"/></svg>
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
        <div className={`so-trial-banner${trialDaysLeft <= 3 ? " urgent" : ""}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
          </svg>
          <span>Trial ends in <strong>{trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""}</strong></span>
          <Link href="/customer/billing" className="so-trial-cta">Subscribe Now</Link>
        </div>
      )}

      {/* Access blocked screen (allow billing page through) */}
      {accessBlocked && !pathname?.includes('/billing') ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
          <div className="so-blocked-card">
            <div className="so-blocked-stamp">
              <span className={`stamp ${trialExpired ? "revise" : "draft"}`}>
                {trialExpired ? "TRIAL EXPIRED" : "ACCOUNT PENDING"}
              </span>
            </div>
            <h2 className="so-blocked-title">
              {trialExpired ? "Your trial period ended" : "Account not active yet"}
            </h2>
            <p className="so-blocked-body">
              {trialExpired
                ? "Subscribe to Pro to keep running your bid pipeline, or contact us if you need a trial extension."
                : "Subscribe to Pro to start, or ask us about a free trial period."
              }
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
              <Link href="/customer/billing" className="so-blocked-primary">
                Subscribe — $199/mo
              </Link>
              <a
                href={`mailto:info@bidmaster.app?subject=Trial%20Request&body=${encodeURIComponent(`Hi,\n\nI would like to request a free trial for BidMaster.\n\nMy name: ${user?.name || ''}\nMy email: ${user?.email || ''}\nCompany: ${user?.company || ''}\n\nThank you!`)}`}
                className="so-blocked-secondary"
              >
                Request Free Trial
              </a>
            </div>
            <button onClick={handleLogout} className="so-blocked-signout">
              Sign out
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Page content */}
          <div className="content so-content">
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
