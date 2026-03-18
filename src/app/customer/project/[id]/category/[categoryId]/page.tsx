"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface Vendor {
  id: string;
  name: string;
  email: string;
}
interface Bid {
  id: string;
  title: string;
  description: string;
  status: string;
  deadline: string;
  trade_category_id?: string;
  vendor_response_count: number;
}
interface VendorResponse {
  id: string;
  vendor_name: string;
  vendor_id: string | null;
  base_price: number | null;
  pricing_mode: string;
  submitted_at: string;
}
interface BidInvitation {
  id: string;
  vendor_id: string;
  status: string;
  sent_at: string;
}
interface ProjectCategory {
  id: string;
  category_id: string;
  name: string;
  grp: string;
}

function showToast(msg: string) {
  const el = document.getElementById("bm-toast");
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = "1";
  el.style.transform = "translateY(0)";
  setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateY(12px)"; }, 2200);
}

export default function CategoryDetailPage() {
  const { id: projectId, categoryId } = useParams();
  const router = useRouter();

  const [projectName, setProjectName] = useState("");
  const [category, setCategory] = useState<{ name: string; grp: string } | null>(null);
  const [categoryVendors, setCategoryVendors] = useState<Vendor[]>([]);
  const [allCategoryVendors, setAllCategoryVendors] = useState<Vendor[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [bid, setBid] = useState<Bid | null>(null);
  const [activeBidIndex, setActiveBidIndex] = useState(0);
  const [responses, setResponses] = useState<VendorResponse[]>([]);
  const [invitations, setInvitations] = useState<BidInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"bid" | "form">("bid");

  // Add vendor + send prompt
  const [vendorJustAdded, setVendorJustAdded] = useState<Vendor | null>(null);

  // File links
  const [bidLinks, setBidLinks] = useState<{ id: string; url: string; label: string }[]>([]);
  const [newBidLinkUrl, setNewBidLinkUrl] = useState("");
  const [newBidLinkLabel, setNewBidLinkLabel] = useState("");

  // Editing bid form
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [saving, setSaving] = useState(false);

  // Parameters
  interface BidParam { name: string; options: string[]; is_track?: boolean }
  const [bidParams, setBidParams] = useState<BidParam[]>([]);
  const [editParams, setEditParams] = useState<BidParam[]>([]);
  const [newOptInputs, setNewOptInputs] = useState<Record<number, string>>({});

  // Checklist & VE
  interface CheckItem { text: string; required: boolean }
  const [editChecklist, setEditChecklist] = useState<CheckItem[]>([]);
  const [newCheckText, setNewCheckText] = useState("");
  const [allowVe, setAllowVe] = useState(false);

  // Project files for bid attachment
  interface ProjFile { id: string; filename: string; uploaded_at: string }
  const [projectFiles, setProjectFiles] = useState<ProjFile[]>([]);
  const [projectFileLinks, setProjectFileLinks] = useState<{ id: string; url: string; label: string }[]>([]);
  const [bidFileIds, setBidFileIds] = useState<Set<string>>(new Set()); // already attached
  const [selectedProjFiles, setSelectedProjFiles] = useState<Set<string>>(new Set());
  const [selectedProjLinks, setSelectedProjLinks] = useState<Set<string>>(new Set());
  const [attachingFiles, setAttachingFiles] = useState(false);
  const [bidFiles, setBidFiles] = useState<{ id: string; filename: string }[]>([]);

  // Send
  const [showSendPanel, setShowSendPanel] = useState(false);
  const [sendToAll, setSendToAll] = useState(true);
  const [selectedVendorIds, setSelectedVendorIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  // Add vendor
  const [showAddVendor, setShowAddVendor] = useState(false);

  // Vendor action modals
  const [vendorAction, setVendorAction] = useState<{ vendor: Vendor; action: "pause" | "delete" } | null>(null);
  const [vendorActionNotify, setVendorActionNotify] = useState(true);
  const [vendorActionMsg, setVendorActionMsg] = useState("");
  const [vendorActioning, setVendorActioning] = useState(false);

  // Bid pause
  const [showBidPause, setShowBidPause] = useState(false);
  const [pauseDuration, setPauseDuration] = useState("7");
  const [pauseNotify, setPauseNotify] = useState(true);
  const [pauseMsg, setPauseMsg] = useState("התוכניות בניין משתנות, אין לשלוח מחירים עד לעדכון הקבצים");
  const [pausing, setPausing] = useState(false);

  useEffect(() => { loadData(); }, [projectId, categoryId]);

  async function loadData() {
    setLoading(true);
    try {
      // Fetch project
      const projRes = await fetch(`/api/projects/${projectId}`);
      if (!projRes.ok) throw new Error();
      const projData = await projRes.json();
      setProjectName(projData.name);

      // Find category
      const cat = projData.categories.find((c: ProjectCategory) => c.category_id === categoryId);
      if (cat) setCategory({ name: cat.name, grp: cat.grp });

      // Find ALL bids for this category
      const currentBids = projData.bids.filter((b: Bid) => b.trade_category_id === categoryId);
      setBids(currentBids);
      const currentBid = currentBids[activeBidIndex] || currentBids[0] || null;
      setBid(currentBid);
      if (currentBid) {
        setEditTitle(currentBid.title);
        setEditDesc(currentBid.description);
        setEditDeadline(currentBid.deadline);

        // Fetch full bid data (includes vendor_responses) and invitations
        const [bidFullRes, invRes] = await Promise.all([
          fetch(`/api/bids/${currentBid.id}`).then(r => r.ok ? r.json() : null),
          fetch(`/api/bids/${currentBid.id}/invite`).then(r => r.ok ? r.json() : []),
        ]);
        if (bidFullRes?.vendor_responses) setResponses(bidFullRes.vendor_responses);
        if (bidFullRes?.parameters) {
          setBidParams(bidFullRes.parameters);
          setEditParams(bidFullRes.parameters.map((p: BidParam) => ({ ...p, options: [...p.options] })));
        }
        if (bidFullRes?.checklist) {
          setEditChecklist(bidFullRes.checklist);
        }
        if (bidFullRes?.allow_ve !== undefined) {
          setAllowVe(!!bidFullRes.allow_ve);
        }
        setInvitations(invRes);
        // Load file links for this bid
        fetch(`/api/file-links?ref_type=bid&ref_id=${currentBid.id}`)
          .then(r => r.ok ? r.json() : [])
          .then(setBidLinks)
          .catch(() => {});
        // Load bid files to know which project files are already attached
        fetch(`/api/bids/${currentBid.id}/files`)
          .then(r => r.ok ? r.json() : [])
          .then((files: { id: string; filename: string }[]) => setBidFiles(files))
          .catch(() => {});
      }

      // Load project files and links
      if (projData.files) setProjectFiles(projData.files);
      fetch(`/api/file-links?ref_type=project&ref_id=${projectId}`)
        .then(r => r.ok ? r.json() : [])
        .then(setProjectFileLinks)
        .catch(() => {});

      // Fetch vendors for this trade category
      const tcRes = await fetch("/api/trade-categories");
      if (tcRes.ok) {
        const allCats = await tcRes.json();
        const thisCat = allCats.find((c: { id: string }) => c.id === categoryId);
        if (thisCat && thisCat.vendors) {
          setAllCategoryVendors(thisCat.vendors);
          // Determine which vendors are "in" this project's category (invited or default)
          if (currentBid) {
            // Use invitations to determine project vendors
            const currentInvitations = await fetch(`/api/bids/${currentBid.id}/invite`).then(r => r.ok ? r.json() : []).catch(() => []);
            const invitedIds = new Set((currentInvitations || []).map((i: BidInvitation) => i.vendor_id));
            setCategoryVendors(invitedIds.size > 0 ? thisCat.vendors.filter((v: Vendor) => invitedIds.has(v.id)) : thisCat.vendors);
          } else {
            setCategoryVendors(thisCat.vendors);
          }
        }
      }
    } catch { }
    finally { setLoading(false); }
  }

  async function handleSaveBidForm() {
    if (!bid) return;
    setSaving(true);
    try {
      const validParams = editParams
        .filter(p => p.name.trim() && p.options.length > 0)
        .map((p, i) => ({ name: p.name.trim(), options: p.options, is_track: !!p.is_track, sort_order: i }));

      const res = await fetch(`/api/bids/${bid.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle, description: editDesc, deadline: editDeadline,
          parameters: validParams,
          checklist: editChecklist.filter(c => c.text.trim()),
          allow_ve: allowVe,
        }),
      });
      if (res.ok) {
        showToast("Bid updated");
        await loadData();
      }
    } catch { showToast("Failed to save"); }
    finally { setSaving(false); }
  }

  async function handleSendBid() {
    if (!bid) return;
    setSending(true);
    try {
      const vendorIds = sendToAll
        ? categoryVendors.map(v => v.id)
        : Array.from(selectedVendorIds);

      if (vendorIds.length === 0) { showToast("Select vendors"); setSending(false); return; }

      // First activate the bid if it's still draft
      if (bid.status === "draft") {
        await fetch(`/api/bids/${bid.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "active" }),
        });
      }
      // Send invitations
      const res = await fetch(`/api/bids/${bid.id}/invite`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendor_ids: vendorIds }),
      });
      if (res.ok) {
        showToast(`Bid sent to ${vendorIds.length} vendor${vendorIds.length !== 1 ? "s" : ""}`);
        setShowSendPanel(false);
        await loadData();
      }
    } catch { showToast("Failed to send"); }
    finally { setSending(false); }
  }

  function toggleVendorSelect(vendorId: string) {
    setSelectedVendorIds(prev => {
      const next = new Set(prev);
      if (next.has(vendorId)) next.delete(vendorId); else next.add(vendorId);
      return next;
    });
  }

  function addVendorToProject(vendor: Vendor) {
    if (!categoryVendors.find(v => v.id === vendor.id)) {
      setCategoryVendors(prev => [...prev, vendor]);
    }
    setShowAddVendor(false);
    // If there's an active bid, ask whether to send it to this vendor
    if (bid && (bid.status === "active" || bid.status === "draft")) {
      setVendorJustAdded(vendor);
    }
  }

  function removeVendorFromProject(vendorId: string) {
    setCategoryVendors(prev => prev.filter(v => v.id !== vendorId));
  }

  function openVendorAction(vendor: Vendor, action: "pause" | "delete") {
    setVendorAction({ vendor, action });
    setVendorActionNotify(true);
    setVendorActionMsg(action === "pause"
      ? "הביט שלך הושהה זמנית, נעדכן אותך כשנחדש"
      : "הביט בוטל, תודה על ההשתתפות");
  }

  async function handleVendorAction() {
    if (!vendorAction || !bid) return;
    setVendorActioning(true);
    try {
      const { vendor, action } = vendorAction;
      if (action === "delete") {
        // Remove invitation
        await fetch(`/api/bids/${bid.id}/invite`, {
          method: "DELETE", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vendor_id: vendor.id }),
        });
        setCategoryVendors(prev => prev.filter(v => v.id !== vendor.id));
      } else {
        // Pause = update invitation status
        await fetch(`/api/bids/${bid.id}/invite`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vendor_id: vendor.id, status: "paused" }),
        });
      }
      // Send notification if requested
      if (vendorActionNotify && vendorActionMsg) {
        await fetch(`/api/bids/${bid.id}/notify`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vendor_ids: [vendor.id],
            message: vendorActionMsg,
            type: action === "pause" ? "bid_paused" : "bid_cancelled",
          }),
        }).catch(() => {}); // Don't fail if notify endpoint doesn't exist yet
      }
      showToast(action === "delete" ? `${vendor.name} removed` : `${vendor.name} paused`);
      setVendorAction(null);
      await loadData();
    } catch { showToast("Failed"); }
    finally { setVendorActioning(false); }
  }

  async function handlePauseBid() {
    if (!bid) return;
    setPausing(true);
    try {
      // Update bid status to paused
      await fetch(`/api/bids/${bid.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paused" }),
      });
      // Notify vendors if requested
      if (pauseNotify && pauseMsg) {
        const vendorIds = categoryVendors.map(v => v.id);
        await fetch(`/api/bids/${bid.id}/notify`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vendor_ids: vendorIds,
            message: pauseMsg,
            type: "bid_paused",
            pause_days: parseInt(pauseDuration) || 7,
          }),
        }).catch(() => {});
      }
      showToast("Bid paused");
      setShowBidPause(false);
      await loadData();
    } catch { showToast("Failed to pause"); }
    finally { setPausing(false); }
  }

  async function handleResumeBid() {
    if (!bid) return;
    try {
      await fetch(`/api/bids/${bid.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      showToast("Bid resumed");
      await loadData();
    } catch { showToast("Failed"); }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 11px", background: "var(--bg)",
    border: "1.5px solid var(--border)", borderRadius: 7,
    color: "var(--ink)", fontSize: "0.84rem", outline: "none",
    fontFamily: "'Plus Jakarta Sans', sans-serif", boxSizing: "border-box",
  };

  if (loading) return (
    <div className="page on" style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: "4px solid var(--gold-b)", borderTopColor: "var(--gold)", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  const availableToAdd = allCategoryVendors.filter(v => !categoryVendors.find(cv => cv.id === v.id));
  const invRes = invitations || [];

  return (
    <div className="page on">
      {/* Header */}
      <div style={{
        padding: "14px 20px", borderBottom: "1px solid var(--border)", background: "var(--surface)",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <Link
          href={`/customer/project/${projectId}`}
          style={{ color: "var(--muted)", textDecoration: "none", fontSize: "0.82rem" }}
        >
          ←
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "0.68rem", color: "var(--muted)" }}>
            {projectName}
            {category && <span> · {category.grp}</span>}
          </div>
          <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: "1rem", color: "var(--ink)" }}>
            {category?.name || "Category"}
          </div>
        </div>
        {bid && bid.status === "draft" && (
          <button
            className="btn btn-gold btn-xs"
            onClick={() => setShowSendPanel(true)}
          >
            Send to Vendors
          </button>
        )}
        {bid && bid.status === "active" && (
          <>
            <button
              className="btn btn-outline btn-xs"
              onClick={() => setShowSendPanel(true)}
            >
              Send to More
            </button>
            <button
              className="btn btn-outline btn-xs"
              onClick={() => setShowBidPause(true)}
              style={{ color: "#92400e", borderColor: "#92400e" }}
            >
              ⏸ Pause Bid
            </button>
          </>
        )}
        {bid && bid.status === "paused" && (
          <button
            className="btn btn-gold btn-xs"
            onClick={handleResumeBid}
          >
            ▶ Resume Bid
          </button>
        )}
        {!bid && (
          <Link
            href={`/customer/create?project=${projectId}&category=${categoryId}`}
            className="btn btn-gold btn-xs"
            style={{ textDecoration: "none" }}
          >
            + Create Bid
          </Link>
        )}
        {bid && (
          <Link
            href={`/customer/create?project=${projectId}&category=${categoryId}`}
            style={{
              fontSize: "0.72rem", fontWeight: 600, color: "var(--gold)",
              textDecoration: "none",
            }}
          >
            + New Form
          </Link>
        )}
      </div>

      {/* Multi-bid selector */}
      {bids.length > 1 && (
        <div style={{
          display: "flex", gap: 4, padding: "8px 20px", background: "var(--surface)",
          borderBottom: "1px solid var(--border)", overflowX: "auto",
        }}>
          {bids.map((b, i) => (
            <button
              key={b.id}
              onClick={() => { setActiveBidIndex(i); setBid(b); setEditTitle(b.title); setEditDesc(b.description); setEditDeadline(b.deadline); setTab("bid"); loadData(); }}
              style={{
                padding: "5px 12px", borderRadius: 100, fontSize: "0.74rem",
                fontWeight: 600, cursor: "pointer", border: "1.5px solid",
                background: i === activeBidIndex ? "var(--gold-bg)" : "var(--surface)",
                color: i === activeBidIndex ? "var(--gold)" : "var(--ink2)",
                borderColor: i === activeBidIndex ? "var(--gold-b)" : "var(--border)",
                whiteSpace: "nowrap",
              }}
            >
              {b.title}
              <span style={{
                marginLeft: 5, fontSize: "0.62rem",
                color: b.status === "paused" ? "#92400e" : b.status === "active" ? "var(--gold)" : "var(--muted)",
              }}>
                {b.status === "paused" ? "⏸" : b.status === "active" ? "●" : b.status === "draft" ? "○" : "✓"}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Main layout: sidebar + content */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* Vendor sidebar */}
        <div style={{
          width: 240, flexShrink: 0, borderRight: "1px solid var(--border)",
          background: "var(--surface)", display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>
          <div style={{
            padding: "12px 14px", borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <div style={{
              fontSize: "0.72rem", fontWeight: 800, color: "var(--muted)",
              textTransform: "uppercase", letterSpacing: "0.04em", flex: 1,
            }}>
              Vendors ({categoryVendors.length})
            </div>
            <button
              onClick={() => setShowAddVendor(!showAddVendor)}
              style={{
                fontSize: "0.72rem", fontWeight: 700, color: "var(--gold)",
                background: "none", border: "none", cursor: "pointer",
              }}
            >
              +
            </button>
          </div>

          {/* Add vendor dropdown */}
          {showAddVendor && availableToAdd.length > 0 && (
            <div style={{
              padding: "8px", borderBottom: "1px solid var(--border)",
              background: "var(--bg)", maxHeight: 150, overflowY: "auto",
            }}>
              {availableToAdd.map(v => (
                <div
                  key={v.id}
                  onClick={() => addVendorToProject(v)}
                  style={{
                    padding: "6px 8px", fontSize: "0.78rem", cursor: "pointer",
                    borderRadius: 5, color: "var(--ink2)",
                    transition: "background 0.1s",
                  }}
                  onMouseOver={e => { e.currentTarget.style.background = "var(--gold-bg)"; }}
                  onMouseOut={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ fontWeight: 600 }}>{v.name}</div>
                  <div style={{ fontSize: "0.68rem", color: "var(--muted)" }}>{v.email}</div>
                </div>
              ))}
            </div>
          )}
          {showAddVendor && availableToAdd.length === 0 && (
            <div style={{ padding: "10px 14px", fontSize: "0.78rem", color: "var(--muted)", borderBottom: "1px solid var(--border)", background: "var(--bg)" }}>
              No more vendors in this category
            </div>
          )}

          {/* Vendor list */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {categoryVendors.length === 0 && (
              <div style={{ padding: "20px 14px", textAlign: "center", color: "var(--muted)", fontSize: "0.8rem" }}>
                No vendors assigned
              </div>
            )}
            {categoryVendors.map(vendor => {
              const inv = invRes.find(i => i.vendor_id === vendor.id);
              const invStatus = inv?.status || "not invited";
              const isPaused = invStatus === "paused";
              return (
                <div key={vendor.id} style={{
                  padding: "10px 14px", borderBottom: "1px solid var(--border)",
                  display: "flex", alignItems: "center", gap: 8,
                  opacity: isPaused ? 0.6 : 1,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: isPaused ? "#f3f4f6" : "var(--gold-bg)",
                    border: `1.5px solid ${isPaused ? "#d1d5db" : "var(--gold-b)"}`,
                    display: "flex", alignItems: "center",
                    justifyContent: "center", fontWeight: 800, fontSize: "0.65rem",
                    color: isPaused ? "var(--muted)" : "var(--gold)", flexShrink: 0,
                  }}>
                    {vendor.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 600, fontSize: "0.78rem", color: "var(--ink)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {vendor.name}
                    </div>
                    <div style={{ fontSize: "0.65rem", color: isPaused ? "#92400e" : "var(--muted)" }}>
                      {isPaused ? "⏸ Paused" :
                       invStatus === "submitted" ? "✓ Submitted" :
                       invStatus === "opened" ? "👁 Opened" :
                       invStatus === "pending" ? "→ Sent" :
                       "Not invited"}
                    </div>
                  </div>
                  {/* Vendor action buttons */}
                  <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                    {!isPaused ? (
                      <button
                        onClick={() => openVendorAction(vendor, "pause")}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          color: "var(--muted)", fontSize: "0.6rem", padding: "2px 4px",
                          opacity: 0.5, transition: "opacity 0.15s",
                        }}
                        onMouseOver={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = "#92400e"; }}
                        onMouseOut={e => { e.currentTarget.style.opacity = "0.5"; e.currentTarget.style.color = "var(--muted)"; }}
                        title="Pause vendor"
                      >
                        ⏸
                      </button>
                    ) : (
                      <button
                        onClick={async () => {
                          if (!bid) return;
                          await fetch(`/api/bids/${bid.id}/invite`, {
                            method: "PATCH", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ vendor_id: vendor.id, status: "pending" }),
                          });
                          showToast(`${vendor.name} resumed`);
                          await loadData();
                        }}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          color: "var(--gold)", fontSize: "0.6rem", padding: "2px 4px",
                          fontWeight: 700,
                        }}
                        title="Resume vendor"
                      >
                        ▶
                      </button>
                    )}
                    <button
                      onClick={() => openVendorAction(vendor, "delete")}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "var(--muted)", fontSize: "0.6rem", padding: "2px 4px",
                        opacity: 0.5, transition: "opacity 0.15s",
                      }}
                      onMouseOver={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = "#dc2626"; }}
                      onMouseOut={e => { e.currentTarget.style.opacity = "0.5"; e.currentTarget.style.color = "var(--muted)"; }}
                      title="Remove vendor"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Tabs: Bid / Form */}
          {bid && (
            <div style={{
              display: "flex", gap: 0, padding: "0 20px", background: "var(--surface)",
              borderBottom: "1px solid var(--border)",
            }}>
              {([
                { key: "bid" as const, label: "Bid Results" },
                { key: "form" as const, label: "Bid Form" },
              ]).map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  style={{
                    padding: "10px 16px", border: "none", background: "none",
                    fontSize: "0.82rem", fontWeight: tab === t.key ? 700 : 500,
                    color: tab === t.key ? "var(--gold)" : "var(--muted)",
                    borderBottom: tab === t.key ? "2px solid var(--gold)" : "2px solid transparent",
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
            {!bid ? (
              /* No bid yet */
              <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--muted)" }}>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 8 }}>No bid form created yet</div>
                <Link
                  href={`/customer/create?project=${projectId}&category=${categoryId}`}
                  style={{ color: "var(--gold)", fontWeight: 700, fontSize: "0.88rem" }}
                >
                  Create Bid Form
                </Link>
              </div>
            ) : tab === "bid" ? (
              /* Bid Results tab */
              <div>
                {/* Bid status row */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 12, marginBottom: 16,
                  padding: "12px 14px", background: "var(--bg)", borderRadius: 8,
                  border: "1px solid var(--border)",
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--ink)" }}>{bid.title}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 2 }}>
                      Deadline: {new Date(bid.deadline).toLocaleDateString()}
                      {bid.status === "active" && new Date(bid.deadline) < new Date() && (
                        <span style={{ color: "#92400e", fontWeight: 700, marginLeft: 6 }}>OVERDUE</span>
                      )}
                    </div>
                  </div>
                  <span style={{
                    fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase",
                    padding: "3px 10px", borderRadius: 100,
                    background: bid.status === "paused" ? "#fef3c7" : bid.status === "active" ? "var(--gold-bg)" : bid.status === "draft" ? "#f3f4f6" : "var(--gold-bg)",
                    color: bid.status === "paused" ? "#92400e" : bid.status === "active" ? "var(--gold)" : bid.status === "draft" ? "var(--muted)" : "var(--gold)",
                    border: `1px solid ${bid.status === "paused" ? "#fde68a" : bid.status === "draft" ? "#e5e7eb" : "var(--gold-b)"}`,
                  }}>
                    {bid.status === "paused" ? "⏸ Paused" : bid.status}
                  </span>
                </div>

                {/* Responses table */}
                {responses.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px 20px", color: "var(--muted)" }}>
                    <div style={{ fontSize: "0.86rem", fontWeight: 600, marginBottom: 4 }}>
                      {bid.status === "draft" ? "Bid not sent yet" : "No responses yet"}
                    </div>
                    <div style={{ fontSize: "0.78rem" }}>
                      {bid.status === "draft"
                        ? "Send this bid to vendors to start receiving responses"
                        : "Waiting for vendors to submit their bids"}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{
                      fontSize: "0.72rem", fontWeight: 800, color: "var(--muted)",
                      textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8,
                    }}>
                      Vendor Responses ({responses.length})
                    </div>
                    {responses.map(resp => (
                      <div key={resp.id} style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "12px 14px", background: "var(--card)",
                        border: "1px solid var(--border)", borderRadius: 8,
                        marginBottom: 5,
                      }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: "50%", background: "var(--gold-bg)",
                          border: "2px solid var(--gold-b)", display: "flex", alignItems: "center",
                          justifyContent: "center", fontWeight: 800, fontSize: "0.7rem",
                          color: "var(--gold)", flexShrink: 0,
                        }}>
                          {resp.vendor_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: "0.86rem", color: "var(--ink)" }}>
                            {resp.vendor_name}
                          </div>
                          <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 1 }}>
                            {new Date(resp.submitted_at).toLocaleDateString()}
                          </div>
                        </div>
                        {resp.base_price != null && (
                          <div style={{
                            fontWeight: 800, fontSize: "0.95rem", color: "var(--ink)",
                            fontFamily: "'Bricolage Grotesque', sans-serif",
                          }}>
                            ${resp.base_price.toLocaleString()}
                          </div>
                        )}
                        <Link
                          href={`/customer/${bid.id}`}
                          style={{
                            fontSize: "0.72rem", fontWeight: 600, color: "var(--gold)",
                            textDecoration: "none",
                          }}
                        >
                          View
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Bid Form tab */
              <div>
                <div style={{
                  fontSize: "0.72rem", fontWeight: 800, color: "var(--muted)",
                  textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12,
                }}>
                  Edit Bid Form
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      Title
                    </div>
                    <input value={editTitle} onChange={e => setEditTitle(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      Description
                    </div>
                    <textarea
                      value={editDesc}
                      onChange={e => setEditDesc(e.target.value)}
                      style={{ ...inputStyle, minHeight: 100, resize: "vertical" }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      Deadline
                    </div>
                    <input type="date" value={editDeadline} onChange={e => setEditDeadline(e.target.value)} style={{ ...inputStyle, width: 200 }} />
                  </div>

                  {/* Parameters & Tracks */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        Parameters & Tracks
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button type="button" className="btn btn-gold btn-xs" style={{ fontSize: "0.65rem", padding: "2px 8px" }}
                          onClick={() => setEditParams(prev => [...prev, { name: "", options: [], is_track: true }])}>
                          + Track
                        </button>
                        <button type="button" className="btn btn-outline btn-xs" style={{ fontSize: "0.65rem", padding: "2px 8px" }}
                          onClick={() => setEditParams(prev => [...prev, { name: "", options: [], is_track: false }])}>
                          + Parameter
                        </button>
                      </div>
                    </div>

                    {editParams.length === 0 && (
                      <div style={{ fontSize: "0.78rem", color: "var(--muted)", padding: "8px 0" }}>
                        No parameters. Add a Pricing Track (e.g., Import/Local) or a Parameter (e.g., Material type).
                      </div>
                    )}

                    {editParams.map((param, pi) => (
                      <div key={pi} style={{
                        border: param.is_track ? "2px solid var(--gold)" : "1.5px solid var(--border)",
                        borderRadius: 8, padding: 10, marginBottom: 8,
                        background: param.is_track ? "var(--gold-bg)" : "var(--bg)",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                          {param.is_track && (
                            <span style={{
                              fontSize: "0.58rem", fontWeight: 800, color: "var(--gold)",
                              background: "rgba(217,119,6,0.15)", padding: "1px 6px",
                              borderRadius: 3, textTransform: "uppercase", letterSpacing: "0.05em",
                            }}>Track</span>
                          )}
                          <input
                            value={param.name}
                            onChange={e => {
                              const next = [...editParams];
                              next[pi] = { ...next[pi], name: e.target.value };
                              setEditParams(next);
                            }}
                            placeholder={param.is_track ? "Track name (e.g., Source)" : "Parameter (e.g., Material)"}
                            style={{ ...inputStyle, flex: 1, padding: "5px 8px", fontSize: "0.82rem" }}
                          />
                          <button type="button" onClick={() => setEditParams(prev => prev.filter((_, i) => i !== pi))}
                            style={{ background: "none", border: "none", color: "var(--red)", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer" }}>
                            Remove
                          </button>
                        </div>

                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                          {param.options.map((opt, oi) => (
                            <span key={oi} style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              background: param.is_track ? "rgba(217,119,6,0.2)" : "var(--surface)",
                              border: "1px solid var(--border)", borderRadius: 4,
                              padding: "2px 8px", fontSize: "0.76rem", fontWeight: 600,
                              color: param.is_track ? "var(--gold)" : "var(--ink)",
                            }}>
                              {opt}
                              <span style={{ cursor: "pointer", color: "var(--muted)", fontSize: "0.65rem" }}
                                onClick={() => {
                                  const next = [...editParams];
                                  next[pi] = { ...next[pi], options: next[pi].options.filter((_, i) => i !== oi) };
                                  setEditParams(next);
                                }}>✕</span>
                            </span>
                          ))}
                        </div>

                        <div style={{ display: "flex", gap: 4 }}>
                          <input
                            value={newOptInputs[pi] || ""}
                            onChange={e => setNewOptInputs(prev => ({ ...prev, [pi]: e.target.value }))}
                            onKeyDown={e => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const val = (newOptInputs[pi] || "").trim();
                                if (val && !editParams[pi].options.includes(val)) {
                                  const next = [...editParams];
                                  next[pi] = { ...next[pi], options: [...next[pi].options, val] };
                                  setEditParams(next);
                                  setNewOptInputs(prev => ({ ...prev, [pi]: "" }));
                                }
                              }
                            }}
                            placeholder="Add option..."
                            style={{ ...inputStyle, flex: 1, padding: "4px 8px", fontSize: "0.78rem" }}
                          />
                          <button type="button" className="btn btn-outline btn-xs" style={{ fontSize: "0.62rem", padding: "2px 6px" }}
                            onClick={() => {
                              const val = (newOptInputs[pi] || "").trim();
                              if (val && !editParams[pi].options.includes(val)) {
                                const next = [...editParams];
                                next[pi] = { ...next[pi], options: [...next[pi].options, val] };
                                setEditParams(next);
                                setNewOptInputs(prev => ({ ...prev, [pi]: "" }));
                              }
                            }}>Add</button>
                        </div>
                      </div>
                    ))}

                    {/* Combinations preview */}
                    {editParams.filter(p => p.name && p.options.length > 0).length > 0 && (() => {
                      const tracks = editParams.filter(p => p.is_track && p.name && p.options.length > 0);
                      const params = editParams.filter(p => !p.is_track && p.name && p.options.length > 0);
                      const totalCombos = [...tracks, ...params].reduce((acc, p) => acc * p.options.length, 1);
                      return (
                        <div style={{
                          background: "var(--gold-bg)", border: "1px solid var(--gold-b)",
                          borderRadius: 6, padding: "8px 12px", marginTop: 4, fontSize: "0.76rem",
                        }}>
                          <strong style={{ color: "var(--gold)" }}>{totalCombos}</strong> pricing combinations
                          {tracks.length > 0 && <span style={{ color: "var(--muted)" }}> across {tracks.length} track{tracks.length > 1 ? "s" : ""}</span>}
                          {params.length > 0 && <span style={{ color: "var(--muted)" }}> × {params.length} parameter{params.length > 1 ? "s" : ""}</span>}
                        </div>
                      );
                    })()}
                  </div>
                  {/* Checklist */}
                  <div style={{
                    padding: "12px 14px", background: "var(--bg)",
                    borderRadius: 8, border: "1px solid var(--border)",
                  }}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      Checklist Items
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: 8 }}>
                      Vendors must check required items before submitting. Optional items are informational.
                    </div>

                    {editChecklist.map((item, ci) => (
                      <div key={ci} style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
                        borderBottom: "1px solid var(--border)",
                      }}>
                        <button
                          type="button"
                          onClick={() => {
                            const next = [...editChecklist];
                            next[ci] = { ...next[ci], required: !next[ci].required };
                            setEditChecklist(next);
                          }}
                          style={{
                            background: item.required ? "var(--gold)" : "transparent",
                            border: item.required ? "2px solid var(--gold)" : "2px solid var(--border)",
                            borderRadius: 4, width: 18, height: 18, cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "0.6rem", color: item.required ? "#fff" : "transparent", flexShrink: 0,
                          }}
                        >
                          ✓
                        </button>
                        <span style={{ flex: 1, fontSize: "0.82rem", color: "var(--ink)" }}>{item.text}</span>
                        <span style={{
                          fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase",
                          color: item.required ? "var(--gold)" : "var(--muted)",
                        }}>
                          {item.required ? "Required" : "Optional"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditChecklist(prev => prev.filter((_, i) => i !== ci))}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "0.65rem" }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}

                    <div style={{ display: "flex", gap: 6, marginTop: editChecklist.length > 0 ? 8 : 0 }}>
                      <input
                        value={newCheckText}
                        onChange={e => setNewCheckText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && newCheckText.trim()) {
                            e.preventDefault();
                            setEditChecklist(prev => [...prev, { text: newCheckText.trim(), required: true }]);
                            setNewCheckText("");
                          }
                        }}
                        placeholder="e.g., Provide warranty certificate"
                        style={{ ...inputStyle, flex: 1, fontSize: "0.8rem" }}
                      />
                      <button
                        type="button"
                        className="btn btn-outline btn-xs"
                        onClick={() => {
                          if (newCheckText.trim()) {
                            setEditChecklist(prev => [...prev, { text: newCheckText.trim(), required: true }]);
                            setNewCheckText("");
                          }
                        }}
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {/* VE Option Toggle */}
                  <div style={{
                    padding: "12px 14px", background: "var(--bg)",
                    borderRadius: 8, border: "1px solid var(--border)",
                    display: "flex", alignItems: "center", gap: 12,
                  }}>
                    <button
                      type="button"
                      onClick={() => setAllowVe(!allowVe)}
                      style={{
                        width: 40, height: 22, borderRadius: 12, border: "none", cursor: "pointer",
                        background: allowVe ? "var(--gold)" : "var(--border)",
                        position: "relative", transition: "background 0.2s", flexShrink: 0,
                      }}
                    >
                      <div style={{
                        width: 16, height: 16, borderRadius: "50%", background: "#fff",
                        position: "absolute", top: 3,
                        left: allowVe ? 21 : 3,
                        transition: "left 0.2s",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      }} />
                    </button>
                    <div>
                      <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--ink)" }}>
                        Allow Value Engineering (VE)
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                        Adds an extra price column for vendors to suggest alternative pricing
                      </div>
                    </div>
                  </div>

                  {/* Project Files Attachment */}
                  {(projectFiles.length > 0 || projectFileLinks.length > 0) && (
                    <div style={{
                      padding: "12px 14px", background: "var(--bg)",
                      borderRadius: 8, border: "1px solid var(--border)",
                    }}>
                      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        Project Files
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: 8 }}>
                        Select project files to attach to this bid form
                      </div>

                      {projectFiles.map(pf => {
                        const alreadyAttached = bidFiles.some(bf => bf.filename === pf.filename);
                        const isSelected = selectedProjFiles.has(pf.id);
                        return (
                          <label key={pf.id} style={{
                            display: "flex", alignItems: "center", gap: 8, padding: "7px 0",
                            borderBottom: "1px solid var(--border)", cursor: alreadyAttached ? "default" : "pointer",
                            opacity: alreadyAttached ? 0.5 : 1,
                          }}>
                            <input
                              type="checkbox"
                              checked={alreadyAttached || isSelected}
                              disabled={alreadyAttached}
                              onChange={e => {
                                const next = new Set(selectedProjFiles);
                                if (e.target.checked) next.add(pf.id);
                                else next.delete(pf.id);
                                setSelectedProjFiles(next);
                              }}
                              style={{ accentColor: "var(--gold)", width: 16, height: 16, flexShrink: 0 }}
                            />
                            <span style={{ flex: 1, fontSize: "0.82rem", fontWeight: 600, color: "var(--ink)" }}>
                              📄 {pf.filename}
                            </span>
                            {alreadyAttached && (
                              <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--gold)", textTransform: "uppercase" }}>
                                Attached
                              </span>
                            )}
                          </label>
                        );
                      })}

                      {projectFileLinks.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase" }}>
                            Project Links
                          </div>
                          {projectFileLinks.map(link => {
                            const alreadyLinked = bidLinks.some(bl => bl.url === link.url);
                            const isSelected = selectedProjLinks.has(link.id);
                            return (
                              <label key={link.id} style={{
                                display: "flex", alignItems: "center", gap: 8, padding: "7px 0",
                                borderBottom: "1px solid var(--border)",
                                cursor: alreadyLinked ? "default" : "pointer",
                                opacity: alreadyLinked ? 0.5 : 1,
                              }}>
                                <input
                                  type="checkbox"
                                  checked={alreadyLinked || isSelected}
                                  disabled={alreadyLinked}
                                  onChange={e => {
                                    const next = new Set(selectedProjLinks);
                                    if (e.target.checked) next.add(link.id);
                                    else next.delete(link.id);
                                    setSelectedProjLinks(next);
                                  }}
                                  style={{ accentColor: "var(--gold)", width: 16, height: 16, flexShrink: 0 }}
                                />
                                <span style={{ flex: 1, fontSize: "0.82rem", fontWeight: 600, color: "var(--ink)" }}>
                                  🔗 {link.label || link.url}
                                </span>
                                {alreadyLinked && (
                                  <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--gold)", textTransform: "uppercase" }}>
                                    Attached
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {(selectedProjFiles.size > 0 || selectedProjLinks.size > 0) && (
                        <button
                          type="button"
                          className="btn btn-gold btn-xs"
                          disabled={attachingFiles}
                          style={{ marginTop: 8, fontSize: "0.72rem" }}
                          onClick={async () => {
                            if (!bid) return;
                            setAttachingFiles(true);
                            try {
                              let attachedCount = 0;
                              // Attach files
                              if (selectedProjFiles.size > 0) {
                                const res = await fetch(`/api/projects/${projectId}/files/attach-to-bid`, {
                                  method: "POST", headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ bid_id: bid.id, file_ids: Array.from(selectedProjFiles) }),
                                });
                                if (res.ok) {
                                  const data = await res.json();
                                  setBidFiles(prev => [...prev, ...data.copied]);
                                  attachedCount += data.copied.length;
                                }
                              }
                              // Attach links
                              if (selectedProjLinks.size > 0) {
                                const linksToAttach = projectFileLinks
                                  .filter(l => selectedProjLinks.has(l.id))
                                  .map(l => ({ url: l.url, label: l.label }));
                                const res = await fetch("/api/file-links", {
                                  method: "POST", headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ ref_type: "bid", ref_id: bid.id, links: linksToAttach }),
                                });
                                if (res.ok) {
                                  const created = await res.json();
                                  setBidLinks(prev => [...created, ...prev]);
                                  attachedCount += created.length;
                                }
                              }
                              setSelectedProjFiles(new Set());
                              setSelectedProjLinks(new Set());
                              showToast(`${attachedCount} item${attachedCount !== 1 ? "s" : ""} attached to bid`);
                            } catch { showToast("Failed to attach"); }
                            finally { setAttachingFiles(false); }
                          }}
                        >
                          {attachingFiles ? "Attaching..." : `Attach ${selectedProjFiles.size + selectedProjLinks.size} item${(selectedProjFiles.size + selectedProjLinks.size) !== 1 ? "s" : ""} to bid`}
                        </button>
                      )}
                    </div>
                  )}

                  {/* File Links */}
                  <div style={{
                    padding: "12px 14px", background: "var(--bg)",
                    borderRadius: 8, border: "1px solid var(--border)",
                  }}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                      🔗 File Links
                    </div>

                    {bidLinks.map(link => (
                      <div key={link.id} style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "5px 0",
                        borderBottom: "1px solid var(--border)",
                      }}>
                        <span style={{ fontSize: "0.76rem" }}>🔗</span>
                        <a href={link.url} target="_blank" rel="noreferrer" style={{
                          flex: 1, fontSize: "0.82rem", fontWeight: 600, color: "var(--gold)",
                          textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {link.label || link.url}
                        </a>
                        <button
                          onClick={async () => {
                            await fetch("/api/file-links", {
                              method: "DELETE", headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ id: link.id }),
                            });
                            setBidLinks(prev => prev.filter(l => l.id !== link.id));
                          }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "0.65rem" }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}

                    <div style={{ display: "flex", gap: 6, marginTop: bidLinks.length > 0 ? 6 : 0 }}>
                      <input
                        value={newBidLinkUrl}
                        onChange={e => setNewBidLinkUrl(e.target.value)}
                        placeholder="https://drive.google.com/..."
                        style={{ ...inputStyle, flex: 2, fontSize: "0.8rem" }}
                      />
                      <input
                        value={newBidLinkLabel}
                        onChange={e => setNewBidLinkLabel(e.target.value)}
                        onKeyDown={async e => {
                          if (e.key === "Enter" && newBidLinkUrl.trim() && bid) {
                            e.preventDefault();
                            const res = await fetch("/api/file-links", {
                              method: "POST", headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ ref_type: "bid", ref_id: bid.id, links: [{ url: newBidLinkUrl.trim(), label: newBidLinkLabel.trim() }] }),
                            });
                            if (res.ok) {
                              const created = await res.json();
                              setBidLinks(prev => [...created, ...prev]);
                              setNewBidLinkUrl(""); setNewBidLinkLabel("");
                              showToast("Link added");
                            }
                          }
                        }}
                        placeholder="Label"
                        style={{ ...inputStyle, flex: 1, fontSize: "0.8rem" }}
                      />
                      <button
                        className="btn btn-outline btn-xs"
                        onClick={async () => {
                          if (!newBidLinkUrl.trim() || !bid) return;
                          const res = await fetch("/api/file-links", {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ ref_type: "bid", ref_id: bid.id, links: [{ url: newBidLinkUrl.trim(), label: newBidLinkLabel.trim() }] }),
                          });
                          if (res.ok) {
                            const created = await res.json();
                            setBidLinks(prev => [...created, ...prev]);
                            setNewBidLinkUrl(""); setNewBidLinkLabel("");
                            showToast("Link added");
                          }
                        }}
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <button className="btn btn-gold btn-sm" onClick={handleSaveBidForm} disabled={saving}>
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                    <Link href={`/customer/${bid.id}`} style={{ textDecoration: "none" }}>
                      <button className="btn btn-outline btn-sm" type="button">
                        Full Bid Page
                      </button>
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SEND BID PANEL */}
      {showSendPanel && bid && (
        <div className="modal-overlay open" onClick={() => setShowSendPanel(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, marginBottom: 14 }}>
              Send Bid to Vendors
            </h3>

            <div style={{ marginBottom: 12 }}>
              <label style={{
                display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                fontSize: "0.84rem", fontWeight: 600, color: "var(--ink)", marginBottom: 6,
              }}>
                <input type="radio" checked={sendToAll} onChange={() => setSendToAll(true)} style={{ accentColor: "var(--gold)" }} />
                Send to all vendors ({categoryVendors.length})
              </label>
              <label style={{
                display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                fontSize: "0.84rem", fontWeight: 600, color: "var(--ink)",
              }}>
                <input type="radio" checked={!sendToAll} onChange={() => setSendToAll(false)} style={{ accentColor: "var(--gold)" }} />
                Select specific vendors
              </label>
            </div>

            {!sendToAll && (
              <div style={{
                maxHeight: 200, overflowY: "auto", marginBottom: 12,
                border: "1px solid var(--border)", borderRadius: 8,
              }}>
                {categoryVendors.map(v => (
                  <label key={v.id} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                    borderBottom: "1px solid var(--border)", cursor: "pointer",
                    fontSize: "0.82rem", color: "var(--ink)",
                  }}>
                    <input
                      type="checkbox"
                      checked={selectedVendorIds.has(v.id)}
                      onChange={() => toggleVendorSelect(v.id)}
                      style={{ accentColor: "var(--gold)" }}
                    />
                    <span style={{ fontWeight: 600 }}>{v.name}</span>
                    <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{v.email}</span>
                  </label>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline btn-sm" onClick={() => setShowSendPanel(false)}>Cancel</button>
              <button className="btn btn-gold btn-sm" onClick={handleSendBid} disabled={sending}>
                {sending ? "Sending..." : "Send Bid"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VENDOR ACTION MODAL (Pause / Delete) */}
      {vendorAction && (
        <div className="modal-overlay open" onClick={() => setVendorAction(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, marginBottom: 12 }}>
              {vendorAction.action === "pause" ? "Pause Vendor" : "Remove Vendor"}
            </h3>

            <p style={{ fontSize: "0.86rem", color: "var(--ink2)", marginBottom: 8 }}>
              {vendorAction.action === "pause"
                ? <>Are you sure you want to pause <strong>{vendorAction.vendor.name}</strong>? They will not be able to submit bids while paused.</>
                : <>Are you sure you want to remove <strong>{vendorAction.vendor.name}</strong> from this bid? Their invitation and any submitted response will be removed.</>
              }
            </p>

            {vendorAction.action === "delete" && (
              <div style={{
                background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8,
                padding: "10px 14px", fontSize: "0.82rem", color: "#92400e",
                marginBottom: 12, fontWeight: 600,
              }}>
                This action cannot be undone.
              </div>
            )}

            {/* Send notification toggle */}
            <div style={{
              padding: "12px 14px", background: "var(--bg)", borderRadius: 8,
              border: "1px solid var(--border)", marginBottom: 12,
            }}>
              <label style={{
                display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                fontSize: "0.82rem", fontWeight: 600, color: "var(--ink2)", marginBottom: 8,
              }}>
                <input
                  type="checkbox"
                  checked={vendorActionNotify}
                  onChange={e => setVendorActionNotify(e.target.checked)}
                  style={{ accentColor: "var(--gold)" }}
                />
                Send notification to vendor
              </label>
              {vendorActionNotify && (
                <textarea
                  value={vendorActionMsg}
                  onChange={e => setVendorActionMsg(e.target.value)}
                  placeholder="Message to vendor..."
                  style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontSize: "0.8rem" }}
                />
              )}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline btn-sm" onClick={() => setVendorAction(null)}>Cancel</button>
              <button
                className="btn btn-gold btn-sm"
                onClick={handleVendorAction}
                disabled={vendorActioning}
                style={vendorAction.action === "delete" ? { background: "#92400e", borderColor: "#92400e" } : {}}
              >
                {vendorActioning ? "..." : vendorAction.action === "pause" ? "Pause Vendor" : "Remove Vendor"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAUSE BID MODAL */}
      {showBidPause && bid && (
        <div className="modal-overlay open" onClick={() => setShowBidPause(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, marginBottom: 12 }}>
              Pause Bid
            </h3>
            <p style={{ fontSize: "0.86rem", color: "var(--ink2)", marginBottom: 14 }}>
              Pausing <strong>{bid.title}</strong> will temporarily stop vendors from submitting responses.
            </p>

            {/* Duration */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Pause Duration
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[
                  { val: "3", label: "3 days" },
                  { val: "7", label: "1 week" },
                  { val: "14", label: "2 weeks" },
                  { val: "30", label: "1 month" },
                  { val: "0", label: "Until I resume" },
                ].map(opt => (
                  <button
                    key={opt.val}
                    onClick={() => setPauseDuration(opt.val)}
                    style={{
                      padding: "6px 12px", borderRadius: 100, fontSize: "0.78rem",
                      fontWeight: 600, cursor: "pointer", transition: "all 0.12s",
                      background: pauseDuration === opt.val ? "var(--gold-bg)" : "var(--surface)",
                      color: pauseDuration === opt.val ? "var(--gold)" : "var(--ink2)",
                      border: `1.5px solid ${pauseDuration === opt.val ? "var(--gold-b)" : "var(--border)"}`,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notify vendors */}
            <div style={{
              padding: "12px 14px", background: "var(--bg)", borderRadius: 8,
              border: "1px solid var(--border)", marginBottom: 14,
            }}>
              <label style={{
                display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                fontSize: "0.82rem", fontWeight: 600, color: "var(--ink2)", marginBottom: 8,
              }}>
                <input
                  type="checkbox"
                  checked={pauseNotify}
                  onChange={e => setPauseNotify(e.target.checked)}
                  style={{ accentColor: "var(--gold)" }}
                />
                Send notification to all vendors ({categoryVendors.length})
              </label>
              {pauseNotify && (
                <textarea
                  value={pauseMsg}
                  onChange={e => setPauseMsg(e.target.value)}
                  placeholder="Message to vendors..."
                  style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontSize: "0.8rem" }}
                />
              )}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline btn-sm" onClick={() => setShowBidPause(false)}>Cancel</button>
              <button
                className="btn btn-gold btn-sm"
                onClick={handlePauseBid}
                disabled={pausing}
                style={{ background: "#92400e", borderColor: "#92400e" }}
              >
                {pausing ? "Pausing..." : "Pause Bid"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SEND BID TO NEW VENDOR PROMPT */}
      {vendorJustAdded && bid && (
        <div className="modal-overlay open" onClick={() => setVendorJustAdded(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, marginBottom: 12 }}>
              Send Bid?
            </h3>
            <p style={{ fontSize: "0.86rem", color: "var(--ink2)", marginBottom: 14 }}>
              <strong>{vendorJustAdded.name}</strong> was added to {category?.name}. Would you like to send them the current bid?
            </p>
            {bids.length > 1 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase" }}>
                  Select which bid to send:
                </div>
                {bids.filter(b => b.status === "active" || b.status === "draft").map(b => (
                  <label key={b.id} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
                    cursor: "pointer", fontSize: "0.82rem", color: "var(--ink)",
                  }}>
                    <input
                      type="checkbox"
                      defaultChecked={b.id === bid.id}
                      style={{ accentColor: "var(--gold)" }}
                      data-bid-id={b.id}
                    />
                    <span style={{ fontWeight: 600 }}>{b.title}</span>
                    <span style={{ fontSize: "0.68rem", color: "var(--muted)" }}>({b.status})</span>
                  </label>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline btn-sm" onClick={() => setVendorJustAdded(null)}>
                Not Now
              </button>
              <button
                className="btn btn-gold btn-sm"
                onClick={async () => {
                  const vendor = vendorJustAdded;
                  setVendorJustAdded(null);
                  try {
                    // Send to checked bids or current bid
                    const bidIds = bids.length > 1
                      ? Array.from(document.querySelectorAll('[data-bid-id]'))
                          .filter(el => (el as HTMLInputElement).checked)
                          .map(el => (el as HTMLElement).getAttribute('data-bid-id')!)
                      : [bid.id];

                    for (const bidId of bidIds) {
                      // Activate if draft
                      const theBid = bids.find(b => b.id === bidId);
                      if (theBid?.status === "draft") {
                        await fetch(`/api/bids/${bidId}`, {
                          method: "PATCH", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: "active" }),
                        });
                      }
                      await fetch(`/api/bids/${bidId}/invite`, {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ vendor_ids: [vendor.id] }),
                      });
                    }
                    showToast(`Bid sent to ${vendor.name}`);
                    await loadData();
                  } catch { showToast("Failed to send"); }
                }}
              >
                Send Bid
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
