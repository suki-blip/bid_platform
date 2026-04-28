"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

function showToast(msg: string) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = "1";
  setTimeout(() => { el.style.opacity = "0"; }, 2200);
}

interface VendorInfo {
  id: string;
  name: string;
  email: string;
  phone?: string;
  contact_person?: string;
}

interface MyBid {
  display_status: string;
  invitation_status: string;
  deadline: string;
}

export default function VendorLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [vendor, setVendor] = useState<VendorInfo | null>(null);
  const [counts, setCounts] = useState({ open: 0, submitted: 0, won: 0, lost: 0 });

  useEffect(() => {
    fetch("/api/vendor-auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setVendor(d))
      .catch(() => {});

    fetch("/api/vendor/my-bids")
      .then(r => r.ok ? r.json() : [])
      .then((bids: MyBid[]) => {
        setCounts({
          open: bids.filter(b => b.display_status === "open").length,
          submitted: bids.filter(b => b.display_status === "pending_review").length,
          won: bids.filter(b => b.display_status === "won").length,
          lost: bids.filter(b => b.display_status === "lost").length,
        });
      })
      .catch(() => {});
  }, [pathname]);

  async function handleLogout() {
    await fetch("/api/vendor-auth/logout", { method: "POST" });
    router.push("/login?tab=vendor");
  }

  const vendorName = vendor?.name || "Loading...";
  const initials = vendorName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const isBidDetail = pathname.startsWith("/vendor/my-bids/") && pathname !== "/vendor/my-bids";
  const isSubmitBid = pathname.startsWith("/vendor/") && !pathname.startsWith("/vendor/my-bids") && pathname !== "/vendor" && pathname !== "/vendor/profile";

  const PAGE_TITLES: Record<string, [string, string]> = {
    "/vendor": ["Dashboard", `Welcome back, ${vendorName} 👋`],
    "/vendor/my-bids": ["My Bids", "All submitted bids and invitations"],
    "/vendor/profile": ["My Profile", "Company & contact info"],
  };

  const [pageTitle, pageSub] = isBidDetail
    ? ["Bid Details", "View your submission"]
    : isSubmitBid
    ? ["Submit Bid", "Fill in your pricing and submit"]
    : PAGE_TITLES[pathname] || ["Vendor Portal", ""];

  const NAV_ITEMS = [
    { label: "Dashboard", icon: "◦", href: "/vendor", badge: null, badgeClass: "" },
    { label: "My Bids", icon: "📋", href: "/vendor/my-bids", badge: counts.submitted > 0 ? String(counts.submitted) : null, badgeClass: "blue" },
    { label: "Invitations", icon: "📨", href: "/vendor", badge: counts.open > 0 ? String(counts.open) : null, badgeClass: "gold" },
  ];

  const NAV_RESULTS = [
    { label: "Won Bids", icon: "🏆", href: "/vendor/my-bids?filter=won", badge: counts.won > 0 ? String(counts.won) : null, badgeClass: "green" },
    { label: "All History", icon: "🗂", href: "/vendor/my-bids?filter=all", badge: null, badgeClass: "" },
  ];

  const NAV_ACCOUNT = [
    { label: "My Profile", icon: "👤", href: "/vendor/profile", badge: null, badgeClass: "" },
  ];

  function renderNavItem(item: { label: string; icon: string; href: string; badge: string | null; badgeClass: string }) {
    const isActive = item.href === "/vendor"
      ? pathname === "/vendor"
      : pathname.startsWith(item.href.split("?")[0]) && item.href !== "/vendor";

    return (
      <Link
        key={item.label}
        href={item.href}
        className={`nav-item${isActive ? " active" : ""}`}
        style={{ textDecoration: "none" }}
      >
        <span className="ni">{item.icon}</span> {item.label}
        {item.badge && <span className={`nbadge${item.badgeClass ? " " + item.badgeClass : ""}`}>{item.badge}</span>}
      </Link>
    );
  }

  return (
    <>
      <div id="toast"></div>
      <div className="shell">
        <aside className="sidebar">
          <div className="logo-bar">
            <div className="logo">Bid<em>Master</em></div>
            <div className="logo-sub">Vendor Portal</div>
          </div>
          <div className="vendor-chip">
            <div className="va">{initials}</div>
            <div>
              <div className="vname">{vendorName}</div>
              <div className="vco">{vendor?.email || ""}</div>
            </div>
          </div>
          <div className="sidebar-scroll">
            <div className="nav-lbl">Menu</div>
            {NAV_ITEMS.map(renderNavItem)}
            <div className="nav-lbl" style={{ marginTop: 8 }}>Results</div>
            {NAV_RESULTS.map(renderNavItem)}
            <div className="nav-lbl" style={{ marginTop: 8 }}>Account</div>
            {NAV_ACCOUNT.map(renderNavItem)}
            <div style={{ marginTop: 16, padding: "0 8px" }}>
              <button
                onClick={handleLogout}
                className="btn"
                style={{
                  width: "100%", padding: "8px 12px", background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#999",
                  fontSize: "0.8rem", cursor: "pointer",
                }}
              >
                🚪 Log Out
              </button>
            </div>
          </div>
        </aside>

        <div className="main">
          <div className="topbar">
            <div>
              <span className="page-title">{pageTitle}</span>
              <span className="page-sub">{pageSub}</span>
            </div>
            <div className="topbar-right">
              <div className="notif-btn" onClick={() => showToast("No new notifications")} style={{ cursor: "pointer" }}>
                🔔<span className="notif-pip"></span>
              </div>
            </div>
          </div>
          <div className="content">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
