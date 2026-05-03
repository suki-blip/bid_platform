"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { getCategoryIcon } from "@/lib/category-icons";

interface TradeCategory {
  id: string;
  name: string;
  grp: string;
  is_custom: number;
}

interface Vendor {
  id: string;
  name: string;
  email: string;
  cc_emails: string | null;
  phone: string | null;
  contact_person: string | null;
  trade_category: string | null;
  trade_name: string | null;
  trade_group: string | null;
  website: string | null;
  license: string | null;
  notes: string | null;
  status: string;
  rating: number | null;
}

function showToast(msg: string) {
  const el = document.getElementById("bm-toast");
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = "1";
  el.style.transform = "translateY(0)";
  setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateY(12px)"; }, 2200);
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [trades, setTrades] = useState<TradeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tradeFilter, setTradeFilter] = useState("");
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [vendorViewMode, setVendorViewMode] = useState<"list" | "grid">("list");
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; errors: { row: number; reason: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Form state
  const [form, setForm] = useState({ name: "", email: "", cc_emails: "", phone: "", contact_person: "", trade_category: "", website: "", license: "", notes: "" });

  // Edit modal state
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", cc_emails: "", phone: "", contact_person: "", trade_category: "", website: "", license: "", notes: "", rating: null as number | null });
  const [editSaving, setEditSaving] = useState(false);

  // New category creation
  const [newCatName, setNewCatName] = useState("");
  const [addingCat, setAddingCat] = useState(false);

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    setAddingCat(true);
    try {
      const res = await fetch("/api/trade-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCatName.trim(), grp: "Other" }),
      });
      if (res.status === 409) { showToast("Category already exists"); setAddingCat(false); return; }
      if (!res.ok) { showToast("Failed to add category"); setAddingCat(false); return; }
      const created = await res.json();
      setTrades(prev => [...prev, created]);
      // Auto-select the new category in whichever form is open
      if (editVendor) {
        setEditForm(prev => ({ ...prev, trade_category: created.id }));
      } else {
        setForm(prev => ({ ...prev, trade_category: created.id }));
      }
      setNewCatName("");
      showToast(`Category "${created.name}" added`);
    } catch { showToast("Failed to add category"); }
    setAddingCat(false);
  };

  const openEditModal = (v: Vendor) => {
    setEditVendor(v);
    setEditForm({
      name: v.name,
      email: v.email,
      cc_emails: v.cc_emails || "",
      phone: v.phone || "",
      contact_person: v.contact_person || "",
      trade_category: v.trade_category || "",
      website: v.website || "",
      license: v.license || "",
      notes: v.notes || "",
      rating: v.rating,
    });
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editVendor) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/vendors/${editVendor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          trade_category: editForm.trade_category || null,
          cc_emails: editForm.cc_emails || null,
          phone: editForm.phone || null,
          contact_person: editForm.contact_person || null,
          website: editForm.website || null,
          license: editForm.license || null,
          notes: editForm.notes || null,
          rating: editForm.rating,
        }),
      });
      if (!res.ok) { showToast("Failed to save vendor"); return; }
      showToast("Vendor updated");
      setEditVendor(null);
      fetchVendors();
    } catch { showToast("Failed to save vendor"); }
    finally { setEditSaving(false); }
  };

  const fetchVendors = () => {
    fetch("/api/vendors")
      .then(r => r.json())
      .then(setVendors)
      .catch(() => showToast("Failed to load vendors"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchVendors();
    fetch("/api/trade-categories").then(r => r.json()).then(setTrades).catch(() => {});
  }, []);

  const filtered = vendors.filter(v => {
    const matchSearch = !search || v.name.toLowerCase().includes(search.toLowerCase()) || v.email.toLowerCase().includes(search.toLowerCase());
    const matchTrade = !tradeFilter || v.trade_category === tradeFilter;
    return matchSearch && matchTrade;
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, trade_category: form.trade_category || null }),
      });
      if (res.status === 409) { showToast("Email already exists"); return; }
      if (!res.ok) { showToast("Failed to add vendor"); return; }
      showToast("Vendor added");
      setShowAdd(false);
      setForm({ name: "", email: "", cc_emails: "", phone: "", contact_person: "", trade_category: "", website: "", license: "", notes: "" });
      fetchVendors();
    } catch { showToast("Failed to add vendor"); }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/vendors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        showToast(`Vendor ${status}`);
        fetchVendors();
      }
    } catch { showToast("Failed to update vendor"); }
  };

  const handleCSVUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) { showToast("CSV must have a header row and data"); return; }

    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const nameIdx = headers.indexOf("name");
    const emailIdx = headers.indexOf("email");
    const phoneIdx = headers.indexOf("phone");
    const tradeIdx = headers.indexOf("trade");

    if (nameIdx === -1 || emailIdx === -1) { showToast("CSV must have 'name' and 'email' columns"); return; }

    const rows = lines.slice(1).map(line => {
      const cols = line.split(",").map(c => c.trim());
      return {
        name: cols[nameIdx] || "",
        email: cols[emailIdx] || "",
        phone: phoneIdx >= 0 ? cols[phoneIdx] : undefined,
        trade: tradeIdx >= 0 ? cols[tradeIdx] : undefined,
      };
    });

    try {
      const res = await fetch("/api/vendors/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      setImportResult(data);
      fetchVendors();
    } catch { showToast("Import failed"); }
  };

  // Group trades by group
  const tradeGroups = trades.reduce<Record<string, TradeCategory[]>>((acc, t) => {
    (acc[t.grp] = acc[t.grp] || []).push(t);
    return acc;
  }, {});

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}>
        <div className="so-spinner" />
      </div>
    );
  }

  return (
    <div className="page on">
      {/* Page header */}
      <div className="so-page-head">
        <div>
          <div className="so-page-eyebrow">SUBCONTRACTOR ROSTER</div>
          <h1>Vendors</h1>
          <p>{filtered.length} vendor{filtered.length !== 1 ? "s" : ""} on file · trades color-coded by hardhat</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="stamp ok">{vendors.filter(v => v.status === "active").length} ACTIVE</span>
          {vendors.filter(v => v.status === "suspended").length > 0 && <span className="stamp notes">{vendors.filter(v => v.status === "suspended").length} SUSPENDED</span>}
        </div>
      </div>

      {/* Filter strip */}
      <div className="fstrip">
        <div className="fs-search">
          <span style={{ color: "var(--faint)" }}>&#128269;</span>
          <input placeholder="Search vendors..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="finput" style={{ width: "auto", minWidth: 140, padding: "4px 8px", fontSize: "0.78rem" }} value={tradeFilter} onChange={e => setTradeFilter(e.target.value)}>
          <option value="">All Trades</option>
          {trades.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button
          className={`btn btn-xs ${groupByCategory ? "btn-gold" : "btn-outline"}`}
          onClick={() => setGroupByCategory(!groupByCategory)}
          title="Group by category"
        >
          {groupByCategory ? "☰ Grouped" : "☰ Group by Category"}
        </button>
        <div className="so-view-toggle" style={{ padding: 2 }}>
          <button
            type="button"
            onClick={() => setVendorViewMode("list")}
            className={vendorViewMode === "list" ? "on" : ""}
            title="List view"
            style={{ padding: "4px 8px" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
          </button>
          <button
            type="button"
            onClick={() => { setVendorViewMode("grid"); setGroupByCategory(true); }}
            className={vendorViewMode === "grid" ? "on" : ""}
            title="Grid view"
            style={{ padding: "4px 8px" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          </button>
        </div>
        <span className="fcount">{filtered.length} vendors</span>
        <div className="fright">
          <button className="btn btn-outline btn-xs" onClick={() => { setShowImport(true); setImportResult(null); }}>&#128196; Import CSV</button>
          <button className="btn btn-gold btn-xs" onClick={() => setShowAdd(true)}>+ Add Vendor</button>
        </div>
      </div>

      <div className="scroll">
      {/* Vendor table */}
      {!groupByCategory ? (
        <div className="scard" style={{ margin: "16px 0" }}>
          <table className="ctable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Trade</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--muted)", fontSize: "0.85rem" }}>No vendors found.</td></tr>
              )}
              {filtered.map(v => (
                <tr key={v.id} onClick={() => openEditModal(v)} style={{ cursor: "pointer", transition: "background 0.15s" }} onMouseEnter={e => (e.currentTarget.style.background = "var(--gold-bg)")} onMouseLeave={e => (e.currentTarget.style.background = "")}>
                  <td>
                    <div style={{ fontWeight: 700, fontSize: "0.84rem", color: "var(--ink)" }}>{v.name}</div>
                    {v.contact_person && <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{v.contact_person}</div>}
                  </td>
                  <td style={{ fontSize: "0.82rem" }}>{v.email}</td>
                  <td style={{ fontSize: "0.82rem", color: "var(--muted)" }}>{v.phone || "—"}</td>
                  <td>{v.trade_name ? <span className="tag tag-draft">{v.trade_name}</span> : <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>—</span>}</td>
                  <td>
                    <span className={`tag ${v.status === "active" ? "tag-active" : v.status === "suspended" ? "tag-pending" : "tag-closed"}`}>
                      {v.status}
                    </span>
                  </td>
                  <td>
                    {v.status === "active" && (
                      <button className="btn btn-outline btn-xs" style={{ fontSize: "0.7rem" }} onClick={e => { e.stopPropagation(); handleStatusChange(v.id, "suspended"); }}>Suspend</button>
                    )}
                    {v.status === "suspended" && (
                      <button className="btn btn-outline btn-xs" style={{ fontSize: "0.7rem" }} onClick={e => { e.stopPropagation(); handleStatusChange(v.id, "active"); }}>Reactivate</button>
                    )}
                    {v.status !== "removed" && (
                      <button className="btn btn-outline btn-xs" style={{ fontSize: "0.7rem", color: "var(--red)", borderColor: "var(--red-b)", marginLeft: 4 }} onClick={e => { e.stopPropagation(); handleStatusChange(v.id, "removed"); }}>Remove</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Grouped by category view */
        <div style={{ margin: "16px 0", display: "flex", flexDirection: "column", gap: 12 }}>
          {(() => {
            // Build groups: group by trade_category (or "Uncategorized")
            const groups: Record<string, { name: string; grp: string; vendors: Vendor[] }> = {};
            for (const v of filtered) {
              const key = v.trade_category || "__none__";
              if (!groups[key]) {
                groups[key] = {
                  name: v.trade_name || "Uncategorized",
                  grp: v.trade_group || "",
                  vendors: [],
                };
              }
              groups[key].vendors.push(v);
            }

            // Sort groups: by trade group, then by name; uncategorized last
            const sortedKeys = Object.keys(groups).sort((a, b) => {
              if (a === "__none__") return 1;
              if (b === "__none__") return -1;
              const ga = groups[a].grp;
              const gb = groups[b].grp;
              if (ga !== gb) return ga.localeCompare(gb);
              return groups[a].name.localeCompare(groups[b].name);
            });

            // Group keys by trade group
            let currentGrp = "";
            const elements: React.ReactNode[] = [];

            for (const key of sortedKeys) {
              const group = groups[key];
              if (group.grp !== currentGrp) {
                currentGrp = group.grp;
                elements.push(
                  <div key={`grp-${currentGrp}`} style={{
                    fontSize: "0.68rem", fontWeight: 800, color: "var(--muted)",
                    textTransform: "uppercase", letterSpacing: "0.06em",
                    marginTop: elements.length > 0 ? 8 : 0, marginBottom: 2,
                  }}>
                    {currentGrp || "OTHER"}
                  </div>
                );
              }

              elements.push(
                <div key={key} className="scard" style={{ overflow: "hidden" }}>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 16px", background: "var(--gold-bg)",
                    borderBottom: "1px solid var(--gold-b)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: "1.1rem" }}>{getCategoryIcon(key)}</span>
                      <span style={{
                        fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800,
                        fontSize: "0.88rem", color: "var(--ink)",
                      }}>
                        {group.name}
                      </span>
                      <span style={{
                        fontSize: "0.68rem", fontWeight: 700, color: "var(--gold)",
                        background: "var(--card)", padding: "1px 8px", borderRadius: 100,
                        border: "1px solid var(--gold-b)",
                      }}>
                        {group.vendors.length}
                      </span>
                    </div>
                  </div>
                  {vendorViewMode === "grid" ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, padding: 12 }}>
                      {group.vendors.map(v => (
                        <div key={v.id} onClick={() => openEditModal(v)} style={{
                          cursor: "pointer", padding: "12px 14px", borderRadius: 8,
                          border: "1.5px solid var(--border)", background: "var(--bg)",
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--gold)"; e.currentTarget.style.background = "var(--gold-bg)"; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg)"; }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: "50%", background: "var(--gold-bg)",
                              border: "1.5px solid var(--gold-b)", display: "flex", alignItems: "center",
                              justifyContent: "center", fontWeight: 800, fontSize: "0.65rem",
                              color: "var(--gold)", flexShrink: 0,
                            }}>
                              {v.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</div>
                              <div style={{ fontSize: "0.68rem", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.email}</div>
                            </div>
                          </div>
                          {v.phone && <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{v.phone}</div>}
                          <span className={`tag ${v.status === "active" ? "tag-active" : v.status === "suspended" ? "tag-pending" : "tag-closed"}`} style={{ fontSize: "0.6rem", marginTop: 4 }}>
                            {v.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <table className="ctable">
                      <tbody>
                        {group.vendors.map(v => (
                          <tr key={v.id} onClick={() => openEditModal(v)} style={{ cursor: "pointer", transition: "background 0.15s" }} onMouseEnter={e => (e.currentTarget.style.background = "var(--gold-bg)")} onMouseLeave={e => (e.currentTarget.style.background = "")}>
                            <td>
                              <div style={{ fontWeight: 700, fontSize: "0.84rem", color: "var(--ink)" }}>{v.name}</div>
                              {v.contact_person && <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{v.contact_person}</div>}
                            </td>
                            <td style={{ fontSize: "0.82rem" }}>{v.email}</td>
                            <td style={{ fontSize: "0.82rem", color: "var(--muted)" }}>{v.phone || "—"}</td>
                            <td>
                              <span className={`tag ${v.status === "active" ? "tag-active" : v.status === "suspended" ? "tag-pending" : "tag-closed"}`}>
                                {v.status}
                              </span>
                            </td>
                            <td>
                              {v.status === "active" && (
                                <button className="btn btn-outline btn-xs" style={{ fontSize: "0.7rem" }} onClick={e => { e.stopPropagation(); handleStatusChange(v.id, "suspended"); }}>Suspend</button>
                              )}
                              {v.status === "suspended" && (
                                <button className="btn btn-outline btn-xs" style={{ fontSize: "0.7rem" }} onClick={e => { e.stopPropagation(); handleStatusChange(v.id, "active"); }}>Reactivate</button>
                              )}
                              {v.status !== "removed" && (
                                <button className="btn btn-outline btn-xs" style={{ fontSize: "0.7rem", color: "var(--red)", borderColor: "var(--red-b)", marginLeft: 4 }} onClick={e => { e.stopPropagation(); handleStatusChange(v.id, "removed"); }}>Remove</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            }

            return elements.length > 0 ? elements : (
              <div style={{ textAlign: "center", padding: 24, color: "var(--muted)", fontSize: "0.85rem" }}>No vendors found.</div>
            );
          })()}
        </div>
      )}

      {/* Add Vendor Modal */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setShowAdd(false)}>
          <div className="scard" style={{ width: 480, maxHeight: "90vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
            <div className="scard-head"><h3>Add Vendor</h3></div>
            <form onSubmit={handleAdd} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <div><label className="flbl">Name *</label><input className="finput" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div><label className="flbl">Email *</label><input className="finput" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div><label className="flbl">CC Emails</label><input className="finput" placeholder="comma-separated" value={form.cc_emails} onChange={e => setForm({ ...form, cc_emails: e.target.value })} /></div>
              <div><label className="flbl">Phone</label><input className="finput" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              <div><label className="flbl">Contact Person</label><input className="finput" value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} /></div>
              <div>
                <label className="flbl">Trade Category</label>
                <select className="finput" value={form.trade_category} onChange={e => setForm({ ...form, trade_category: e.target.value })}>
                  <option value="">— None —</option>
                  {Object.entries(tradeGroups).map(([grp, cats]) => (
                    <optgroup key={grp} label={grp}>
                      {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                  ))}
                </select>
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <input className="finput" value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="New category name..." style={{ flex: 1 }}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddCategory(); } }} />
                  <button type="button" className="btn btn-outline btn-xs" onClick={handleAddCategory} disabled={addingCat || !newCatName.trim()}>+ Add</button>
                </div>
              </div>
              <div><label className="flbl">Website</label><input className="finput" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} /></div>
              <div><label className="flbl">License #</label><input className="finput" value={form.license} onChange={e => setForm({ ...form, license: e.target.value })} /></div>
              <div><label className="flbl">Notes</label><textarea className="finput" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="btn btn-gold">Add Vendor</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showImport && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setShowImport(false)}>
          <div className="scard" style={{ width: 440, maxHeight: "80vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
            <div className="scard-head"><h3>Import Vendors from CSV</h3></div>
            <div style={{ padding: 16 }}>
              <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 12 }}>
                CSV must have columns: <strong>name</strong>, <strong>email</strong>. Optional: <strong>phone</strong>, <strong>trade</strong>.
              </p>
              <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain,application/csv" style={{ marginBottom: 12 }} />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn btn-outline" onClick={() => setShowImport(false)}>Cancel</button>
                <button className="btn btn-gold" onClick={handleCSVUpload}>Upload &amp; Import</button>
              </div>
              {importResult && (
                <div style={{ marginTop: 16, padding: 12, background: "var(--green-bg)", borderRadius: 8, fontSize: "0.82rem" }}>
                  <div style={{ fontWeight: 700, color: "var(--green)" }}>{importResult.created} vendors imported</div>
                  {importResult.errors.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontWeight: 600, color: "var(--red)", marginBottom: 4 }}>{importResult.errors.length} errors:</div>
                      {importResult.errors.map((e, i) => (
                        <div key={i} style={{ color: "var(--red)", fontSize: "0.78rem" }}>Row {e.row}: {e.reason}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Edit Vendor Modal — portaled */}
      {typeof document !== "undefined" && editVendor && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setEditVendor(null)}>
          <div className="scard" style={{ width: 480, maxHeight: "90vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
            <div className="scard-head"><h3>Edit Vendor</h3></div>
            <form onSubmit={handleEditSave} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <div><label className="flbl">Name *</label><input className="finput" required value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} /></div>
              <div><label className="flbl">Email *</label><input className="finput" type="email" required value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} /></div>
              <div><label className="flbl">CC Emails</label><input className="finput" placeholder="comma-separated" value={editForm.cc_emails} onChange={e => setEditForm({ ...editForm, cc_emails: e.target.value })} /></div>
              <div><label className="flbl">Phone</label><input className="finput" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} /></div>
              <div><label className="flbl">Contact Person</label><input className="finput" value={editForm.contact_person} onChange={e => setEditForm({ ...editForm, contact_person: e.target.value })} /></div>
              <div>
                <label className="flbl">Trade Category</label>
                <select className="finput" value={editForm.trade_category} onChange={e => setEditForm({ ...editForm, trade_category: e.target.value })}>
                  <option value="">— None —</option>
                  {Object.entries(tradeGroups).map(([grp, cats]) => (
                    <optgroup key={grp} label={grp}>
                      {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                  ))}
                </select>
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <input className="finput" value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="New category name..." style={{ flex: 1 }}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddCategory(); } }} />
                  <button type="button" className="btn btn-outline btn-xs" onClick={handleAddCategory} disabled={addingCat || !newCatName.trim()}>+ Add</button>
                </div>
              </div>
              <div><label className="flbl">Website</label><input className="finput" value={editForm.website} onChange={e => setEditForm({ ...editForm, website: e.target.value })} /></div>
              <div><label className="flbl">License #</label><input className="finput" value={editForm.license} onChange={e => setEditForm({ ...editForm, license: e.target.value })} /></div>
              <div><label className="flbl">Notes</label><textarea className="finput" rows={2} value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} /></div>
              <div>
                <label className="flbl">Rating</label>
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setEditForm({ ...editForm, rating: editForm.rating === star ? null : star })}
                      style={{
                        background: "none", border: "none", cursor: "pointer", padding: 2, fontSize: "1.4rem",
                        color: editForm.rating !== null && star <= editForm.rating ? "var(--high-vis)" : "var(--border)",
                        transition: "color 0.15s",
                      }}
                    >
                      ★
                    </button>
                  ))}
                  {editForm.rating && (
                    <span style={{ fontSize: "0.78rem", color: "var(--muted)", alignSelf: "center", marginLeft: 4 }}>{editForm.rating}/5</span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button type="button" className="btn btn-outline" onClick={() => setEditVendor(null)}>Cancel</button>
                <button type="submit" className="btn btn-gold" disabled={editSaving}>{editSaving ? "Saving..." : "Save Changes"}</button>
              </div>
            </form>
          </div>
        </div>
      , document.body)}
      </div>
    </div>
  );
}
