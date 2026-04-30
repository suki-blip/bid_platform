"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtMoney } from "@/lib/fundraising-format";

interface DonorHit {
  id: string;
  first_name: string;
  last_name: string | null;
  hebrew_name: string | null;
  organization: string | null;
  status: string;
  total_paid: number;
}
interface ProjectHit {
  id: string;
  name: string;
  status: string;
}

interface CommandItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
  hebrewSubtitle?: string;
  action: () => void;
}

const NAV_ITEMS: { label: string; href: string; managerOnly?: boolean }[] = [
  { label: "Dashboard", href: "/fundraising" },
  { label: "Today", href: "/fundraising/today" },
  { label: "Prospects", href: "/fundraising/prospects" },
  { label: "Donors", href: "/fundraising/donors" },
  { label: "Projects", href: "/fundraising/projects" },
  { label: "Collections", href: "/fundraising/collections" },
  { label: "Calendar", href: "/fundraising/calendar" },
  { label: "Reports", href: "/fundraising/reports" },
  { label: "Team", href: "/fundraising/team", managerOnly: true },
  { label: "Import", href: "/fundraising/import", managerOnly: true },
  { label: "Settings", href: "/fundraising/settings", managerOnly: true },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [donors, setDonors] = useState<DonorHit[]>([]);
  const [projects, setProjects] = useState<ProjectHit[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isManager, setIsManager] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Detect manager
  useEffect(() => {
    fetch("/api/fundraising/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => setIsManager(!!m?.isManager))
      .catch(() => {});
  }, []);

  // Global ⌘K / Ctrl-K listener
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Reset & focus on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Search donors + projects (debounced)
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setDonors([]);
      setProjects([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`/api/fundraising/search?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled || !d) return;
          setDonors(d.donors || []);
          setProjects(d.projects || []);
          setActiveIndex(0);
        });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  // Build the flat command list. Filter nav by query, and inject quick actions.
  const items: CommandItem[] = [];
  const q = query.trim().toLowerCase();
  const matches = (s: string) => !q || s.toLowerCase().includes(q);

  // Quick actions (always show but filterable)
  const actions: CommandItem[] = [
    { id: "act-new-prospect", group: "Quick actions", label: "New prospect", hint: "Create a new prospect", action: () => go("/fundraising/donors/new?status=prospect") },
    { id: "act-new-donor", group: "Quick actions", label: "New donor", hint: "Create a new donor", action: () => go("/fundraising/donors/new?status=donor") },
    { id: "act-new-project", group: "Quick actions", label: "New project", hint: "Create a fundraising project", action: () => go("/fundraising/projects") },
    ...(isManager
      ? [
          { id: "act-import", group: "Quick actions", label: "Import donors from Excel/CSV", action: () => go("/fundraising/import") },
          { id: "act-team", group: "Quick actions", label: "Manage team", action: () => go("/fundraising/team") },
        ]
      : []),
  ];
  for (const a of actions) if (matches(a.label)) items.push(a);

  // Nav items
  for (const n of NAV_ITEMS) {
    if (n.managerOnly && !isManager) continue;
    if (!matches(n.label)) continue;
    items.push({
      id: `nav-${n.href}`,
      group: "Navigate",
      label: n.label,
      action: () => go(n.href),
    });
  }

  // Donor results
  for (const d of donors) {
    items.push({
      id: `donor-${d.id}`,
      group: "Donors",
      label: `${d.first_name}${d.last_name ? ` ${d.last_name}` : ""}`,
      hebrewSubtitle: d.hebrew_name || undefined,
      hint: d.organization
        ? `${d.organization} · ${d.status}${d.total_paid ? ` · ${fmtMoney(d.total_paid)} lifetime` : ""}`
        : `${d.status}${d.total_paid ? ` · ${fmtMoney(d.total_paid)} lifetime` : ""}`,
      action: () => go(`/fundraising/donors/${d.id}`),
    });
  }
  // Project results
  for (const p of projects) {
    items.push({
      id: `project-${p.id}`,
      group: "Projects",
      label: p.name,
      hint: p.status,
      action: () => go(`/fundraising/projects/${p.id}`),
    });
  }

  // Group items for rendering
  const groups: { name: string; items: CommandItem[] }[] = [];
  for (const item of items) {
    let g = groups.find((x) => x.name === item.group);
    if (!g) {
      g = { name: item.group, items: [] };
      groups.push(g);
    }
    g.items.push(item);
  }
  const flat = groups.flatMap((g) => g.items);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      flat[activeIndex]?.action();
    }
  }

  if (!open) return null;

  let runningIdx = -1;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,16,25,0.45)",
        zIndex: 500,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "10vh",
      }}
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, 95vw)",
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
          overflow: "hidden",
          border: "1px solid rgba(10,16,25,0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid rgba(10,16,25,0.06)" }}>
          <span style={{ fontSize: 16, opacity: 0.45, marginRight: 10 }}>⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search donors, projects, or jump to a page…"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              fontSize: 16,
              fontWeight: 500,
              background: "transparent",
              color: "var(--cast-iron)",
            }}
          />
          <kbd style={kbdStyle}>esc</kbd>
        </div>

        <div style={{ maxHeight: "60vh", overflowY: "auto", padding: 6 }}>
          {flat.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", opacity: 0.5, fontSize: 13 }}>
              {query ? "No matches." : "Start typing to search donors, projects, or jump to a page."}
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.name} style={{ padding: "6px 6px 4px" }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    opacity: 0.5,
                    padding: "6px 8px 4px",
                  }}
                >
                  {group.name}
                </div>
                {group.items.map((item) => {
                  runningIdx++;
                  const isActive = runningIdx === activeIndex;
                  return (
                    <button
                      key={item.id}
                      onMouseEnter={() => setActiveIndex(runningIdx)}
                      onClick={item.action}
                      style={{
                        display: "flex",
                        width: "100%",
                        alignItems: "center",
                        textAlign: "left",
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: "none",
                        background: isActive ? "rgba(28,93,142,0.1)" : "transparent",
                        color: "var(--cast-iron)",
                        cursor: "pointer",
                        gap: 12,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.label}
                          {item.hebrewSubtitle && (
                            <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.55, direction: "rtl", fontWeight: 400 }}>
                              {item.hebrewSubtitle}
                            </span>
                          )}
                        </div>
                        {item.hint && (
                          <div
                            style={{
                              fontSize: 11,
                              opacity: 0.55,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {item.hint}
                          </div>
                        )}
                      </div>
                      {isActive && <kbd style={kbdStyle}>↵</kbd>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div
          style={{
            padding: "8px 14px",
            borderTop: "1px solid rgba(10,16,25,0.06)",
            fontSize: 11,
            opacity: 0.55,
            display: "flex",
            gap: 14,
          }}
        >
          <span>
            <kbd style={kbdStyle}>↑</kbd>
            <kbd style={kbdStyle}>↓</kbd> navigate
          </span>
          <span>
            <kbd style={kbdStyle}>↵</kbd> select
          </span>
          <span>
            <kbd style={kbdStyle}>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}

const kbdStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "1px 6px",
  background: "rgba(10,16,25,0.06)",
  borderRadius: 4,
  fontSize: 10,
  fontWeight: 700,
  fontFamily: "var(--font-mono, monospace)",
  marginRight: 4,
};
