"use client";

import { useEffect, useState } from "react";

interface VendorProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  contact_person: string | null;
  website: string | null;
  notes: string | null;
}

function showToast(msg: string) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = "1";
  setTimeout(() => { el.style.opacity = "0"; }, 2200);
}

export default function ProfilePage() {
  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Profile form
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");

  // Password form
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    fetch("/api/vendor-auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setVendor(d);
          setName(d.name || "");
          setPhone(d.phone || "");
          setContactPerson(d.contact_person || "");
          setWebsite(d.website || "");
          setNotes(d.notes || "");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/vendor/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, contact_person: contactPerson, website, notes }),
      });
      if (res.ok) {
        showToast("Profile updated!");
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to update");
      }
    } catch {
      showToast("Error saving profile");
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) {
      showToast("Passwords don't match");
      return;
    }
    if (newPw.length < 8) {
      showToast("Password must be at least 8 characters");
      return;
    }
    setPwSaving(true);
    try {
      const res = await fetch("/api/vendor/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      });
      if (res.ok) {
        showToast("Password changed!");
        setCurrentPw("");
        setNewPw("");
        setConfirmPw("");
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to change password");
      }
    } catch {
      showToast("Error changing password");
    } finally {
      setPwSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--ink)",
    fontSize: "0.9rem",
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.82rem",
    color: "var(--muted)",
    marginBottom: 6,
    fontWeight: 600,
  };

  if (loading) return (
    <div className="page on" style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        border: "4px solid var(--gold-b)", borderTopColor: "var(--gold)",
        animation: "spin 0.8s linear infinite",
      }} />
    </div>
  );

  return (
    <div className="page on">
      {/* COMPANY INFO */}
      <div className="scard" style={{ marginBottom: 16 }}>
        <div className="scard-head">
          <h3>🏢 Company Information</h3>
        </div>
        <div className="scard-body" style={{ padding: 20 }}>
          <form onSubmit={handleSaveProfile}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Company Name</label>
                <input value={name} onChange={e => setName(e.target.value)} required style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Contact Person</label>
                <input value={contactPerson} onChange={e => setContactPerson(e.target.value)} style={inputStyle} placeholder="John Doe" />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input value={vendor?.email || ""} disabled style={{ ...inputStyle, opacity: 0.6, cursor: "not-allowed" }} />
                <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Contact admin to change email</span>
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} placeholder="(555) 123-4567" />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Website</label>
                <input value={website} onChange={e => setWebsite(e.target.value)} style={inputStyle} placeholder="https://yourcompany.com" />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  style={{ ...inputStyle, minHeight: 80, resize: "vertical" } as React.CSSProperties}
                  placeholder="Specialties, certifications, etc."
                />
              </div>
            </div>
            <button type="submit" disabled={saving} className="btn btn-gold" style={{ padding: "10px 24px" }}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </form>
        </div>
      </div>

      {/* CHANGE PASSWORD */}
      <div className="scard">
        <div className="scard-head">
          <h3>🔒 Change Password</h3>
        </div>
        <div className="scard-body" style={{ padding: 20 }}>
          <form onSubmit={handleChangePassword}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Current Password</label>
                <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>New Password</label>
                <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required style={inputStyle} placeholder="Min. 8 characters" />
              </div>
              <div>
                <label style={labelStyle}>Confirm New Password</label>
                <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required style={inputStyle} />
              </div>
            </div>
            <button type="submit" disabled={pwSaving} className="btn" style={{
              padding: "10px 24px", background: "var(--card)", border: "1px solid var(--border)",
              color: "var(--ink)", borderRadius: 8, cursor: "pointer", fontWeight: 600,
            }}>
              {pwSaving ? "Changing..." : "Change Password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
