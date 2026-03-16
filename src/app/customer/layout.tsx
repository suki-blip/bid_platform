"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface Bid {
  id: string;
  title: string;
  project_id: string | null;
  status: string;
}

interface Project {
  id: string;
  name: string;
  status: string;
}

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

const STATUS_DOT_COLORS: Record<string, string> = {
  active: "var(--green)",
  draft: "var(--gold)",
  closed: "var(--red)",
  paused: "var(--gold)",
};

const STATUS_PILL_CLASS: Record<string, string> = {
  active: "psp-active",
  draft: "psp-paused",
  closed: "psp-stopped",
  paused: "psp-paused",
};

const BID_DOT_COLORS = [
  "var(--green)",
  "var(--gold)",
  "var(--blue)",
  "var(--cyan)",
  "var(--red)",
];

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [bids, setBids] = useState<Bid[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    Promise.all([
      fetch("/api/projects").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/bids").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([projData, bidData]) => {
        setProjects(projData);
        setBids(bidData);
        // Expand first project by default
        if (projData.length > 0) {
          setExpanded({ [projData[0].id]: true });
        }
      })
      .catch(() => {});
  }, []);

  const toggleProject = (projectId: string) => {
    setExpanded((prev) => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  const bidsByProject = projects.map((proj) => ({
    project: proj,
    bids: bids.filter((b) => b.project_id === proj.id),
  }));
  const unassignedBids = bids.filter((b) => !b.project_id);

  const totalBidCount = bids.length;

  const pageTitle = (() => {
    if (pathname === "/customer") return "Dashboard";
    if (pathname === "/customer/create") return "Create Bid Request";
    if (pathname?.startsWith("/customer/vendors")) return "Vendors";
    if (pathname?.startsWith("/customer/settings")) return "Settings";
    if (pathname?.startsWith("/customer/new-project")) return "New Project";
    if (pathname?.startsWith("/customer/project/")) return "Project Details";
    if (pathname?.match(/^\/customer\/[^/]+$/)) return "Compare Bids";
    return "Dashboard";
  })();

  const pageSub = pathname === "/customer" ? "Welcome back, James" : "";

  const navItems = [
    { label: "Dashboard", icon: "\u25A6", href: "/customer" },
    { label: "Compare Bids", icon: "\u2696", href: "/customer", badge: String(totalBidCount) },
    { label: "Vendors", icon: "\uD83D\uDC65", href: "/customer/vendors" },
    { label: "Settings", icon: "\u2699\uFE0F", href: "/customer/settings" },
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo-bar">
          <div className="logo-text">
            Bid<em>Master</em>
          </div>
          <div className="logo-badge">PRO</div>
        </div>

        <div className="sidebar-scroll">
          <div className="nav-section">
            <div className="nav-section-label">Main</div>
            {navItems.map((item) => {
              const isActive =
                item.label === "Dashboard"
                  ? pathname === "/customer"
                  : item.label === "Compare Bids"
                  ? pathname?.match(/^\/customer\/[^/]+$/) && pathname !== "/customer/create" && pathname !== "/customer/vendors" && pathname !== "/customer/settings" && pathname !== "/customer/new-project"
                  : pathname === item.href;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`nav-item${isActive ? " active" : ""}`}
                >
                  <span className="ni">{item.icon}</span> {item.label}
                  {item.badge && (
                    <span className="nbadge">{item.badge}</span>
                  )}
                </Link>
              );
            })}
          </div>

          <Link href="/customer/new-project" className="add-proj-btn">
            <span style={{ fontSize: "1.1rem" }}>{"\uFF0B"}</span> New Project
          </Link>

          <div className="nav-section">
            <div className="nav-section-label">Projects</div>
          </div>

          {bidsByProject.map(({ project, bids: projBids }, pi) => {
            const isOpen = expanded[project.id] || false;
            const dotColor = STATUS_DOT_COLORS[project.status] || "var(--gold)";
            const pillClass = STATUS_PILL_CLASS[project.status] || "psp-paused";

            return (
              <div className="proj-tree" key={project.id}>
                <div
                  className={`proj-header${isOpen ? " open" : ""}`}
                  onClick={() => toggleProject(project.id)}
                >
                  <span
                    className="proj-dot"
                    style={{ background: dotColor }}
                  ></span>
                  <Link
                    href={`/customer/project/${project.id}`}
                    className="proj-header-name"
                    style={{ textDecoration: "none", color: "inherit" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {project.name}
                  </Link>
                  <span className={`proj-status-pill ${pillClass}`}>
                    {project.status}
                  </span>
                  <span className={`proj-arrow${isOpen ? " open" : ""}`}>{"\u25B6"}</span>
                </div>
                <div className={`proj-bids${isOpen ? " open" : ""}`}>
                  {projBids.map((bid, bi) => (
                    <Link
                      key={bid.id}
                      href={`/customer/${bid.id}`}
                      className="proj-bid-item"
                      style={{ textDecoration: "none" }}
                    >
                      <span
                        className="bid-dot"
                        style={{ background: BID_DOT_COLORS[(pi + bi) % BID_DOT_COLORS.length] }}
                      ></span>
                      {bid.title}
                    </Link>
                  ))}
                  <Link
                    href={`/customer/create?project=${project.id}`}
                    className="proj-bid-item"
                    style={{ textDecoration: "none", color: "var(--gold)", fontWeight: 600 }}
                  >
                    {"\uFF0B"} Add Bid Request
                  </Link>
                </div>
              </div>
            );
          })}

          {/* Unassigned bids */}
          {unassignedBids.length > 0 && (
            <div className="proj-tree">
              <div
                className={`proj-header${expanded["__unassigned"] ? " open" : ""}`}
                onClick={() => toggleProject("__unassigned")}
              >
                <span
                  className="proj-dot"
                  style={{ background: "var(--faint)" }}
                ></span>
                <span className="proj-header-name">Unassigned</span>
                <span className={`proj-arrow${expanded["__unassigned"] ? " open" : ""}`}>{"\u25B6"}</span>
              </div>
              <div className={`proj-bids${expanded["__unassigned"] ? " open" : ""}`}>
                {unassignedBids.map((bid, bi) => (
                  <Link
                    key={bid.id}
                    href={`/customer/${bid.id}`}
                    className="proj-bid-item"
                    style={{ textDecoration: "none" }}
                  >
                    <span
                      className="bid-dot"
                      style={{ background: BID_DOT_COLORS[bi % BID_DOT_COLORS.length] }}
                    ></span>
                    {bid.title}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sidebar-foot">
          <div className="user-chip">
            <div className="avatar">JR</div>
            <div>
              <div className="u-name">James Robertson</div>
              <div className="u-role">Procurement Director</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div>
            <span className="page-heading">{pageTitle}</span>
            {pageSub && <span className="page-sub">{pageSub}</span>}
          </div>
          <div className="topbar-right">
            <div className="gsearch">
              <span style={{ color: "var(--faint)", fontSize: "0.85rem" }}>
                {"\uD83D\uDD0D"}
              </span>
              <input placeholder="Search projects, vendors, bids\u2026" />
              <span
                style={{
                  fontSize: "0.67rem",
                  color: "var(--faint)",
                  background: "var(--border)",
                  borderRadius: "4px",
                  padding: "2px 5px",
                }}
              >
                {"\u2318"}K
              </span>
            </div>
            <div className="ibtn" onClick={() => showToast("No new notifications")}>
              {"\uD83D\uDD14"}
              <span className="notif-pip"></span>
            </div>
            <div className="ibtn" onClick={() => showToast("Settings coming soon")}>
              {"\u2699\uFE0F"}
            </div>
            <Link href="/customer/create" className="btn btn-gold btn-xs">
              {"\uFF0B"} New Bid Request
            </Link>
          </div>
        </div>

        <div className="content">{children}</div>
      </div>

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
