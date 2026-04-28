"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import JSZip from "jszip";
import { useParams, useRouter } from "next/navigation";

interface ProjectBid {
  id: string;
  title: string;
  status: string;
  deadline: string;
  vendor_response_count: number;
  trade_category?: string;
  trade_category_id?: string;
}
interface ProjectFile {
  id: string;
  filename: string;
  uploaded_at: string;
}
interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: string;
}
interface ProjectCategory {
  id: string;
  category_id: string;
  name: string;
  grp: string;
  budget?: number | null;
}
interface WinnerInfo {
  bid_id: string;
  trade_category_id: string | null;
  base_price: number | null;
  proposals_total: number | null;
}
interface TradeCategoryVendor {
  id: string;
  name: string;
  email: string;
}
interface TradeCategory {
  id: string;
  name: string;
  grp: string;
  vendors: TradeCategoryVendor[];
}
interface Preset {
  id: string;
  name: string;
  project_type: string | null;
  category_ids: string[];
  include_vendors: number;
  vendor_ids: string[];
}
interface ProjectData {
  id: string;
  name: string;
  address: string | null;
  type: string | null;
  description: string | null;
  status: string;
  created_at: string;
  image_url?: string | null;
  budget?: number | null;
  budget_visible?: number;
  bids: ProjectBid[];
  files: ProjectFile[];
  team: TeamMember[];
  categories: ProjectCategory[];
  winners: WinnerInfo[];
}

function showToast(msg: string) {
  const el = document.getElementById("bm-toast");
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = "1";
  el.style.transform = "translateY(0)";
  setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateY(12px)"; }, 2200);
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"bids" | "team" | "files">("bids");

  // Team
  const [teamName, setTeamName] = useState("");
  const [teamEmail, setTeamEmail] = useState("");
  const [teamRole, setTeamRole] = useState("member");

  // Files
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const projectImageRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // File links
  const [projectLinks, setProjectLinks] = useState<{ id: string; url: string; label: string }[]>([]);
  const [newProjLinkUrl, setNewProjLinkUrl] = useState("");
  const [newProjLinkLabel, setNewProjLinkLabel] = useState("");

  // Resend notification modal
  const [showResendModal, setShowResendModal] = useState(false);
  const [resendScope, setResendScope] = useState<"all" | "select">("all");
  const [resendSelectedBids, setResendSelectedBids] = useState<Set<string>>(new Set());
  const [resendMessage, setResendMessage] = useState("");
  const [resending, setResending] = useState(false);

  // Modals
  const [showStop, setShowStop] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [deletingCat, setDeletingCat] = useState<{ category_id: string; name: string; hasBids: boolean } | null>(null);
  const [removingCat, setRemovingCat] = useState(false);

  // Category management
  const [showCatPanel, setShowCatPanel] = useState(false);
  const [allCategories, setAllCategories] = useState<TradeCategory[]>([]);
  const [selectedCatIds, setSelectedCatIds] = useState<Set<string>>(new Set());
  const [includeVendors, setIncludeVendors] = useState(true);
  const [catSearch, setCatSearch] = useState("");
  const [addingCats, setAddingCats] = useState(false);
  const [customCatName, setCustomCatName] = useState("");
  const [customCatAdding, setCustomCatAdding] = useState(false);

  // Presets
  const [presets, setPresets] = useState<Preset[]>([]);
  const [showPresetSave, setShowPresetSave] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetType, setPresetType] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);

  // Budget
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");

  // Smart Upload (AI parse at project level)
  const [showSmartUpload, setShowSmartUpload] = useState(false);
  const [smartFiles, setSmartFiles] = useState<File[]>([]);
  const [smartParsing, setSmartParsing] = useState(false);
  const [smartParseProgress, setSmartParseProgress] = useState("");
  const [smartResults, setSmartResults] = useState<any[]>([]);
  const [smartSaving, setSmartSaving] = useState(false);
  const [smartUrl, setSmartUrl] = useState("");
  const [smartUrlLoading, setSmartUrlLoading] = useState(false);
  const [smartExcludeKeywords, setSmartExcludeKeywords] = useState<string[]>([]);
  const [showSmartFilter, setShowSmartFilter] = useState(false);

  useEffect(() => { loadProject(); }, [id]);

  async function loadProject() {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error();
      setProject(await res.json());
      // Load file links
      fetch(`/api/file-links?ref_type=project&ref_id=${id}`)
        .then(r => r.ok ? r.json() : [])
        .then(setProjectLinks)
        .catch(() => {});
    } catch { setProject(null); }
    finally { setLoading(false); }
  }

  async function loadCategories() {
    try {
      const [catRes, presetRes] = await Promise.all([
        fetch("/api/trade-categories"),
        fetch("/api/category-presets"),
      ]);
      if (catRes.ok) setAllCategories(await catRes.json());
      if (presetRes.ok) setPresets(await presetRes.json());
    } catch {}
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach(f => formData.append("files", f));
      const res = await fetch(`/api/projects/${id}/files`, { method: "POST", body: formData });
      if (res.ok) {
        await loadProject();
        showToast("Files uploaded!");
        // Show resend modal if there are active bids
        const activeBids = project?.bids.filter(b => b.status === "active") || [];
        if (activeBids.length > 0) {
          setResendSelectedBids(new Set(activeBids.map(b => b.id)));
          setResendMessage("New files have been added to the project. Please review updated documents.");
          setShowResendModal(true);
        }
      }
    } catch { showToast("Upload failed"); }
    finally { setUploading(false); }
  }

  async function handleProjectImageUpload(file: File) {
    if (!file.type.startsWith("image/")) { showToast("Must be an image"); return; }
    if (file.size > 2 * 1024 * 1024) { showToast("Max 2MB"); return; }
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(`/api/projects/${id}/image`, { method: "POST", body: formData });
      if (res.ok) {
        await loadProject();
        showToast("Project image updated");
      } else {
        showToast("Failed to upload image");
      }
    } catch { showToast("Upload failed"); }
    finally { setUploadingImage(false); }
  }

  async function handleSmartUrlFetch() {
    if (!smartUrl.trim()) return;
    setSmartUrlLoading(true);
    const urlStr = smartUrl.trim();
    const isFolder = urlStr.includes('drive.google.com/drive/folders') ||
      urlStr.includes('dropbox.com/sh') || urlStr.includes('dropbox.com/scl/fo');
    try {
      if (isFolder) {
        // Folder link — try folder API first, fall back to simple download
        let folderSuccess = false;
        try {
          const res = await fetch("/api/fetch-folder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: urlStr }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            if (data.type === "vendors" && data.vendors && data.vendors.length > 0) {
              let totalFiles = 0;
              const newFiles: File[] = [];
              for (const v of data.vendors) {
                for (const f of v.files) {
                  const bytes = Uint8Array.from(atob(f.base64), (c: string) => c.charCodeAt(0));
                  const file = new File([bytes], `[${v.vendorName}] ${f.filename}`, { type: f.contentType });
                  newFiles.push(file);
                  totalFiles++;
                }
              }
              if (newFiles.length > 0) {
                setSmartFiles(prev => [...prev, ...newFiles]);
                setSmartUrl("");
                showToast(`Downloaded ${totalFiles} files from ${data.vendors.length} vendors`);
                folderSuccess = true;
              }
            } else if (data.files && data.files.length > 0) {
              for (const f of data.files) {
                const bytes = Uint8Array.from(atob(f.base64), (c: string) => c.charCodeAt(0));
                const file = new File([bytes], f.filename, { type: f.contentType });
                setSmartFiles(prev => [...prev, file]);
              }
              setSmartUrl("");
              showToast(`Downloaded ${data.files.length} files`);
              folderSuccess = true;
            }
          }
        } catch { /* folder parse failed, will fall back */ }

        // Fallback: download as zip via streaming proxy, extract client-side
        if (!folderSuccess) {
          showToast("Downloading folder...");
          const res = await fetch("/api/fetch-zip", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: urlStr }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            showToast(err.error || "Failed to download folder");
          } else {
            const blob = await res.blob();
            const contentType = res.headers.get("content-type") || "";
            if (contentType.includes("zip") || contentType.includes("octet-stream")) {
              // Extract zip client-side
              showToast("Extracting files...");
              const zip = await JSZip.loadAsync(blob);
              const newFiles: File[] = [];
              const vendorMap = new Map<string, File[]>();
              const rootFiles: File[] = [];

              for (const [path, entry] of Object.entries(zip.files)) {
                if (entry.dir) continue;
                const name = path.split("/").pop() || "";
                if (!name || name.startsWith(".") || name.startsWith("__")) continue;

                const data = await entry.async("arraybuffer");
                const ext = name.split(".").pop()?.toLowerCase() || "";
                let ct = "application/octet-stream";
                if (ext === "pdf") ct = "application/pdf";
                else if (ext === "png") ct = "image/png";
                else if (ext === "jpg" || ext === "jpeg") ct = "image/jpeg";
                else if (ext === "doc") ct = "application/msword";
                else if (ext === "docx") ct = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

                const parts = path.split("/").filter(p => p && !p.startsWith(".") && !p.startsWith("__"));
                if (parts.length >= 3) {
                  const vendorName = parts[1];
                  const file = new File([data], `[${vendorName}] ${name}`, { type: ct });
                  if (!vendorMap.has(vendorName)) vendorMap.set(vendorName, []);
                  vendorMap.get(vendorName)!.push(file);
                } else if (parts.length === 2) {
                  const vendorName = parts[0];
                  const file = new File([data], `[${vendorName}] ${name}`, { type: ct });
                  if (!vendorMap.has(vendorName)) vendorMap.set(vendorName, []);
                  vendorMap.get(vendorName)!.push(file);
                } else {
                  rootFiles.push(new File([data], name, { type: ct }));
                }
              }

              if (vendorMap.size > 1) {
                for (const files of vendorMap.values()) newFiles.push(...files);
              } else if (vendorMap.size === 1) {
                for (const files of vendorMap.values()) newFiles.push(...files);
              }
              newFiles.push(...rootFiles);

              if (newFiles.length > 0) {
                setSmartFiles(prev => [...prev, ...newFiles]);
                setSmartUrl("");
                showToast(`Extracted ${newFiles.length} files`);
              } else {
                showToast("Zip was empty");
              }
            } else {
              // Not a zip — add as single file
              const filename = res.headers.get("x-filename") || "downloaded-file";
              const file = new File([blob], filename, { type: contentType });
              setSmartFiles(prev => [...prev, file]);
              setSmartUrl("");
              showToast(`Downloaded: ${filename}`);
            }
          }
        }
      } else {
        // Single file link
        const res = await fetch("/api/fetch-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: urlStr }),
        });
        const data = await res.json();
        if (res.ok && data.base64) {
          const bytes = Uint8Array.from(atob(data.base64), (c: string) => c.charCodeAt(0));
          const file = new File([bytes], data.filename, { type: data.contentType });
          setSmartFiles(prev => [...prev, file]);
          setSmartUrl("");
          showToast(`Downloaded: ${data.filename}`);
        } else {
          showToast(data.error || "Failed to download");
        }
      }
    } catch { showToast("Failed to download from URL"); }
    finally { setSmartUrlLoading(false); }
  }

  async function handleSmartParse() {
    if (smartFiles.length === 0) return;
    // Apply exclude filter
    const filesToScan = smartExcludeKeywords.length > 0
      ? smartFiles.filter(f => !smartExcludeKeywords.some(k => f.name.toLowerCase().includes(k.toLowerCase())))
      : smartFiles;
    if (filesToScan.length === 0) { showToast("All files excluded by filter"); return; }
    setSmartParsing(true);
    setSmartResults([]);
    const allResults: any[] = [];
    const BATCH = 5;
    let failedBatches = 0;
    try {
      for (let i = 0; i < filesToScan.length; i += BATCH) {
        const batch = filesToScan.slice(i, i + BATCH);
        setSmartParseProgress(`${Math.min(i + BATCH, filesToScan.length)}/${filesToScan.length}`);
        try {
          const formData = new FormData();
          batch.forEach(f => formData.append("files", f));
          const res = await fetch(`/api/projects/${id}/smart-parse`, { method: "POST", body: formData });
          const data = await res.json();
          if (res.ok && data.results) {
            allResults.push(...data.results);
            setSmartResults([...allResults]);
          } else {
            failedBatches++;
            batch.forEach(f => allResults.push({ fileName: f.name, error: "Batch timeout", data: null }));
            setSmartResults([...allResults]);
          }
        } catch {
          failedBatches++;
          batch.forEach(f => allResults.push({ fileName: f.name, error: "Batch timeout", data: null }));
          setSmartResults([...allResults]);
        }
      }
      const ok = allResults.filter((r: any) => !r.error).length;
      showToast(failedBatches > 0
        ? `Parsed ${ok}/${allResults.length} — ${failedBatches} batches failed`
        : `Parsed ${ok}/${allResults.length} files`);
    } catch { showToast("Parsing failed"); }
    finally { setSmartParsing(false); }
  }

  async function handleSmartSave() {
    if (smartResults.length === 0) return;
    setSmartSaving(true);
    try {
      const items = smartResults
        .filter(r => r.data && r.data.vendor_name)
        .map(r => ({
          vendor_name: r.data.vendor_name,
          proposals: r.data.proposals,
          category_id: r.data.matched_category_id || null,
          new_category_name: r.data.suggested_new_category || null,
        }));

      if (items.length === 0) { showToast("No valid results to save"); setSmartSaving(false); return; }

      const res = await fetch(`/api/projects/${id}/smart-parse`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Saved ${data.saved?.length || 0} vendor responses!`);
        setShowSmartUpload(false);
        setSmartFiles([]);
        setSmartResults([]);
        await loadProject();
      } else {
        showToast(data.error || "Failed to save");
      }
    } catch { showToast("Save failed"); }
    finally { setSmartSaving(false); }
  }

  async function handleDeleteFile(fileId: string) {
    try {
      await fetch(`/api/projects/${id}/files/${fileId}`, { method: "DELETE" });
      await loadProject(); showToast("File deleted");
    } catch { showToast("Failed to delete"); }
  }

  function triggerResendModal() {
    const activeBids = project?.bids.filter(b => b.status === "active") || [];
    if (activeBids.length > 0) {
      setResendSelectedBids(new Set(activeBids.map(b => b.id)));
      setResendMessage("New files have been added to the project. Please review updated documents.");
      setShowResendModal(true);
    }
  }

  async function handleResendNotify() {
    if (resendSelectedBids.size === 0) return;
    setResending(true);
    try {
      for (const bidId of resendSelectedBids) {
        await fetch(`/api/bids/${bidId}/notify`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vendor_ids: "all",
            type: "files_updated",
            message: resendMessage || undefined,
          }),
        });
      }
      showToast("Vendors notified");
      setShowResendModal(false);
    } catch { showToast("Failed to notify"); }
    finally { setResending(false); }
  }

  async function handleAddTeamMember() {
    if (!teamName || !teamEmail) return;
    try {
      const res = await fetch(`/api/projects/${id}/team`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: teamName, email: teamEmail, role: teamRole }),
      });
      if (res.ok) {
        await loadProject();
        setTeamName(""); setTeamEmail(""); setTeamRole("member");
        showToast("Team member added!");
      }
    } catch { showToast("Failed to add member"); }
  }

  async function handleRemoveTeamMember(memberId: string) {
    try {
      await fetch(`/api/projects/${id}/team`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: memberId }),
      });
      await loadProject();
    } catch {}
  }

  async function handleStop() {
    setStopping(true);
    try {
      const res = await fetch(`/api/projects/${id}/stop`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notify_vendors: "none" }),
      });
      if (res.ok) {
        showToast("Project paused");
        setShowStop(false);
        await loadProject();
      }
    } catch { showToast("Failed"); }
    finally { setStopping(false); }
  }

  function openCategoryPanel() {
    setShowCatPanel(true);
    setSelectedCatIds(new Set());
    setCatSearch("");
    loadCategories();
  }

  async function handleAddCategories() {
    if (selectedCatIds.size === 0) return;
    setAddingCats(true);
    try {
      const catIds = Array.from(selectedCatIds);
      const res = await fetch(`/api/projects/${id}/categories`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_ids: catIds }),
      });
      if (res.ok) {
        // If include vendors, also invite vendors for these categories to existing bids
        // For now just add the categories
        await loadProject();
        setShowCatPanel(false);
        showToast(`${catIds.length} categories added`);
      }
    } catch { showToast("Failed to add categories"); }
    finally { setAddingCats(false); }
  }

  async function handleAddCustomCategory() {
    const name = customCatName.trim();
    if (!name) return;
    setCustomCatAdding(true);
    try {
      // Create the trade category first
      const res = await fetch("/api/trade-categories", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, grp: "Other" }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        // Add it to the project
        await fetch(`/api/projects/${id}/categories`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category_ids: [data.id] }),
        });
        await loadProject();
        setCustomCatName("");
        showToast(`Category "${name}" created and added`);
        // Refresh all categories list
        const catRes = await fetch("/api/trade-categories");
        const catData = await catRes.json();
        if (Array.isArray(catData)) {
          setAllCategories(catData.map((c: any) => ({
            id: c.id, name: c.name, grp: c.grp || "Other", vendors: c.vendors || [],
          })));
        }
      } else if (res.status === 409) {
        showToast("Category already exists");
      } else {
        showToast("Failed to create category");
      }
    } catch { showToast("Failed to create category"); }
    finally { setCustomCatAdding(false); }
  }

  function confirmRemoveCategory(categoryId: string) {
    const cat = project?.categories.find(c => c.category_id === categoryId);
    if (!cat) return;
    const catBids = project?.bids.filter(b => b.trade_category_id === categoryId) || [];
    setDeletingCat({ category_id: categoryId, name: cat.name, hasBids: catBids.length > 0 });
  }

  async function handleRemoveCategory() {
    if (!deletingCat) return;
    setRemovingCat(true);
    try {
      // If has bids, delete them too
      if (deletingCat.hasBids) {
        const catBids = project?.bids.filter(b => b.trade_category_id === deletingCat.category_id) || [];
        for (const bid of catBids) {
          await fetch(`/api/bids/${bid.id}`, { method: "DELETE" });
        }
      }
      await fetch(`/api/projects/${id}/categories`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_id: deletingCat.category_id }),
      });
      await loadProject();
      setDeletingCat(null);
      showToast("Category removed");
    } catch { showToast("Failed to remove"); }
    finally { setRemovingCat(false); }
  }

  function applyPreset(preset: Preset) {
    setSelectedCatIds(new Set(preset.category_ids));
    setIncludeVendors(preset.include_vendors === 1);
    showToast(`Preset "${preset.name}" loaded`);
  }

  async function handleSavePreset() {
    if (!presetName || selectedCatIds.size === 0) return;
    setSavingPreset(true);
    try {
      // Collect vendor IDs from selected categories if includeVendors
      let vendorIds: string[] = [];
      if (includeVendors) {
        allCategories.forEach(cat => {
          if (selectedCatIds.has(cat.id)) {
            cat.vendors.forEach(v => { if (!vendorIds.includes(v.id)) vendorIds.push(v.id); });
          }
        });
      }
      const res = await fetch("/api/category-presets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: presetName,
          project_type: presetType || null,
          category_ids: Array.from(selectedCatIds),
          include_vendors: includeVendors,
          vendor_ids: vendorIds,
        }),
      });
      if (res.ok) {
        const newPreset = await res.json();
        setPresets(prev => [...prev, newPreset]);
        setShowPresetSave(false);
        setPresetName("");
        setPresetType("");
        showToast("Preset saved!");
      }
    } catch { showToast("Failed to save preset"); }
    finally { setSavingPreset(false); }
  }

  async function handleDeletePreset(presetId: string) {
    try {
      await fetch("/api/category-presets", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: presetId }),
      });
      setPresets(prev => prev.filter(p => p.id !== presetId));
    } catch {}
  }

  function toggleCat(catId: string) {
    setSelectedCatIds(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId); else next.add(catId);
      return next;
    });
  }

  function selectAllInGroup(grp: string) {
    const groupCats = allCategories.filter(c => c.grp === grp);
    setSelectedCatIds(prev => {
      const next = new Set(prev);
      const allSelected = groupCats.every(c => next.has(c.id));
      groupCats.forEach(c => { if (allSelected) next.delete(c.id); else next.add(c.id); });
      return next;
    });
  }

  function selectAll() {
    if (selectedCatIds.size === filteredCategories.length) {
      setSelectedCatIds(new Set());
    } else {
      setSelectedCatIds(new Set(filteredCategories.map(c => c.id)));
    }
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

  if (!project) return (
    <div className="page on"><div className="scroll">
      <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, padding: 16, color: "#92400e" }}>Project not found</div>
      <Link href="/customer" style={{ color: "var(--gold)", display: "inline-block", marginTop: 16 }}>← Back</Link>
    </div></div>
  );

  // Filter categories for search
  const existingCatIds = new Set(project.categories.map(c => c.category_id));
  const availableCategories = allCategories.filter(c => !existingCatIds.has(c.id));
  const filteredCategories = catSearch
    ? availableCategories.filter(c => c.name.toLowerCase().includes(catSearch.toLowerCase()) || c.grp.toLowerCase().includes(catSearch.toLowerCase()))
    : availableCategories;
  const groupedFiltered: Record<string, TradeCategory[]> = {};
  filteredCategories.forEach(c => {
    if (!groupedFiltered[c.grp]) groupedFiltered[c.grp] = [];
    groupedFiltered[c.grp].push(c);
  });

  // Map bids to categories by trade_category_id
  const bidsByCatId: Record<string, ProjectBid[]> = {};
  project.bids.forEach(bid => {
    const catId = bid.trade_category_id || "__unassigned";
    if (!bidsByCatId[catId]) bidsByCatId[catId] = [];
    bidsByCatId[catId].push(bid);
  });

  // Build category rows: each project category becomes a row with its bid info
  const categoryRows = project.categories.map(cat => {
    const catBids = bidsByCatId[cat.category_id] || [];
    const activeBids = catBids.filter(b => b.status === "active");
    const awardedBids = catBids.filter(b => b.status === "awarded");
    const closedBids = catBids.filter(b => b.status === "closed" || b.status === "awarded");
    const draftBids = catBids.filter(b => b.status === "draft");
    const overdueBids = catBids.filter(b => b.status === "active" && new Date(b.deadline) < new Date());
    const totalResponses = catBids.reduce((sum, b) => sum + b.vendor_response_count, 0);

    const pausedBids = catBids.filter(b => b.status === "paused");

    let status: "has_bids" | "waiting" | "not_sent" | "empty" | "paused" | "awarded" = "empty";
    if (awardedBids.length > 0) status = "awarded";
    else if (pausedBids.length > 0 && activeBids.length === 0) status = "paused";
    else if (closedBids.length > 0 || (activeBids.length > 0 && totalResponses > 0)) status = "has_bids";
    else if (activeBids.length > 0) status = "waiting";
    else if (draftBids.length > 0) status = "not_sent";

    // Awarded amount for this category
    const catWinners = (project.winners || []).filter(w => w.trade_category_id === cat.category_id);
    const awardedAmount = catWinners.reduce((sum, w) => sum + (w.proposals_total || w.base_price || 0), 0);

    return { ...cat, bids: catBids, activeBids, closedBids, draftBids, overdueBids, pausedBids, totalResponses, status, awardedAmount };
  });

  // Unassigned bids (bids without a trade_category_id or with a category not in this project)
  const projectCatIds = new Set(project.categories.map(c => c.category_id));
  const unassignedBids = project.bids.filter(b => {
    if (!b.trade_category_id) return true;
    return !projectCatIds.has(b.trade_category_id);
  });

  const tabs = [
    { key: "bids" as const, label: "Bids", count: project.categories.length },
    { key: "team" as const, label: "Team", count: project.team.length },
    { key: "files" as const, label: "Files", count: project.files.length + projectLinks.length },
  ];

  return (<>
    <div className="page on">
      {/* Header */}
      <div style={{
        padding: "14px 20px", borderBottom: "1px solid var(--border)", background: "var(--surface)",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <Link href="/customer" style={{ color: "var(--muted)", textDecoration: "none", fontSize: "0.82rem" }}>←</Link>
        {/* Project image */}
        <div
          onClick={() => projectImageRef.current?.click()}
          style={{
            width: 42, height: 42, borderRadius: 10, flexShrink: 0, cursor: "pointer",
            background: project.image_url ? "transparent" : "var(--gold-bg)",
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden", position: "relative", border: "1.5px solid var(--border)",
            opacity: uploadingImage ? 0.5 : 1,
          }}
          title="Click to change project image"
        >
          {project.image_url ? (
            <img src={project.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontSize: "0.7rem", color: "var(--muted)", textAlign: "center", lineHeight: 1.1 }}>📷</span>
          )}
        </div>
        <input
          ref={projectImageRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleProjectImageUpload(file);
            e.target.value = "";
          }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: "1rem", color: "var(--ink)" }}>
            {project.name}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
            {project.type || ""}{project.address ? ` · ${project.address}` : ""}
          </div>
          {/* Category summary stats */}
          {categoryRows.length > 0 && (() => {
            const closed = categoryRows.filter(r => r.closedBids.length > 0 && r.activeBids.length === 0).length;
            const active = categoryRows.filter(r => r.activeBids.length > 0 || (r.status === "has_bids" && r.closedBids.length === 0)).length;
            const notSent = categoryRows.filter(r => r.status === "not_sent" || r.status === "empty").length;
            const paused = categoryRows.filter(r => r.bids.some(b => b.status === "paused")).length;
            return (
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                {closed > 0 && (
                  <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--gold)" }}>
                    {closed} Closed
                  </span>
                )}
                {active > 0 && (
                  <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#16a34a" }}>
                    {active} Open
                  </span>
                )}
                {notSent > 0 && (
                  <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--muted)" }}>
                    {notSent} Not Sent
                  </span>
                )}
                {paused > 0 && (
                  <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#92400e" }}>
                    {paused} Paused
                  </span>
                )}
              </div>
            );
          })()}
        </div>
        <Link href={`/customer/create?project=${id}`} className="btn btn-gold btn-xs" style={{ textDecoration: "none" }}>
          + Add Bid
        </Link>
        {project.status !== "closed" && (
          <button className="btn btn-outline btn-xs" onClick={() => setShowStop(true)}>
            Pause
          </button>
        )}
      </div>

      {/* Budget Bar */}
      {(() => {
        const categoryBudgetTotal = categoryRows.reduce((sum, r) => sum + (r.budget || 0), 0);
        const awardedTotal = categoryRows.reduce((sum, r) => sum + r.awardedAmount, 0);
        const hasBudget = project.budget != null && project.budget > 0;
        const hasCategoryBudgets = categoryBudgetTotal > 0;
        const hasAnyBudget = hasBudget || hasCategoryBudgets;
        // Effective budget = overall if set, otherwise sum of categories
        const effectiveBudget = hasBudget ? project.budget! : categoryBudgetTotal;
        const remaining = effectiveBudget - awardedTotal;

        return (
          <div style={{
            display: "flex", alignItems: "center", gap: 12, padding: "8px 20px",
            background: "var(--surface)", borderBottom: "1px solid var(--border)",
            fontSize: "0.78rem", flexWrap: "wrap",
          }}>
            <span style={{ fontWeight: 700, color: "var(--ink)", fontSize: "0.72rem" }}>Budget:</span>
            {editingBudget ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "var(--muted)" }}>$</span>
                <input
                  className="finput"
                  type="number"
                  value={budgetInput}
                  onChange={e => setBudgetInput(e.target.value)}
                  placeholder="Overall budget"
                  style={{ width: 120, padding: "4px 8px", fontSize: "0.78rem" }}
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      const val = budgetInput ? Number(budgetInput) : null;
                      fetch(`/api/projects/${id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ budget: val }),
                      }).then(() => {
                        setProject(p => p ? { ...p, budget: val } : p);
                        setEditingBudget(false);
                        showToast(val ? "Budget updated" : "Budget removed");
                      });
                    }
                    if (e.key === "Escape") setEditingBudget(false);
                  }}
                />
                <button className="btn btn-xs btn-gold" onClick={() => {
                  const val = budgetInput ? Number(budgetInput) : null;
                  fetch(`/api/projects/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ budget: val }),
                  }).then(() => {
                    setProject(p => p ? { ...p, budget: val } : p);
                    setEditingBudget(false);
                    showToast(val ? "Budget updated" : "Budget removed");
                  });
                }}>Save</button>
                <button className="btn btn-xs btn-outline" onClick={() => setEditingBudget(false)}>Cancel</button>
              </div>
            ) : hasBudget ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontWeight: 700, color: "var(--ink)" }}>${project.budget!.toLocaleString()}</span>
                <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.7rem", color: "var(--muted)" }}
                  onClick={() => { setBudgetInput(String(project.budget || "")); setEditingBudget(true); }}>
                  Edit
                </button>
                <span style={{ color: "var(--border)" }}>|</span>
                <button
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.7rem", color: "var(--muted)" }}
                  onClick={async () => {
                    const vis = project.budget_visible === 1 ? 0 : 1;
                    await fetch(`/api/projects/${id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ budget_visible: vis }),
                    });
                    setProject(p => p ? { ...p, budget_visible: vis } : p);
                    showToast(vis ? "Budget visible to team" : "Budget hidden from team");
                  }}
                >
                  {project.budget_visible === 1 ? "Hide from team" : "Show to team"}
                </button>
              </div>
            ) : (
              <button
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.72rem", color: "var(--gold)", fontWeight: 600 }}
                onClick={() => { setBudgetInput(""); setEditingBudget(true); }}
              >
                + Set Overall Budget
              </button>
            )}

            {/* Category budgets sum + difference from overall */}
            {hasAnyBudget && (
              <>
                <span style={{ color: "var(--border)" }}>|</span>
                {hasCategoryBudgets && (
                  <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                    Categories: <span style={{ fontWeight: 700, color: "var(--ink)" }}>${categoryBudgetTotal.toLocaleString()}</span>
                  </span>
                )}
                {hasBudget && hasCategoryBudgets && (() => {
                  const diff = project.budget! - categoryBudgetTotal;
                  return (
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: diff >= 0 ? "#16a34a" : "#dc2626" }}>
                      {diff >= 0 ? `$${diff.toLocaleString()} unallocated` : `-$${Math.abs(diff).toLocaleString()} over allocated`}
                    </span>
                  );
                })()}
                <span style={{ color: "var(--border)" }}>|</span>
                <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                  Awarded: <span style={{ fontWeight: 700, color: "var(--ink)" }}>${awardedTotal.toLocaleString()}</span>
                </span>
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: remaining >= 0 ? "#16a34a" : "#dc2626" }}>
                  {remaining >= 0 ? `$${remaining.toLocaleString()} remaining` : `-$${Math.abs(remaining).toLocaleString()} over budget`}
                </span>
              </>
            )}
          </div>
        );
      })()}

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 0, padding: "0 20px", background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
      }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "10px 16px", border: "none", background: "none",
              fontSize: "0.82rem", fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? "var(--gold)" : "var(--muted)",
              borderBottom: tab === t.key ? "2px solid var(--gold)" : "2px solid transparent",
              cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
            }}
          >
            {t.label}
            <span style={{
              marginLeft: 6, fontSize: "0.68rem", fontWeight: 700,
              padding: "1px 6px", borderRadius: 100,
              background: tab === t.key ? "var(--gold-bg)" : "var(--bg)",
              color: tab === t.key ? "var(--gold)" : "var(--muted)",
            }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div className="scroll">
        {/* BIDS TAB */}
        {tab === "bids" && (
          <div>
            {/* Actions bar */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
            }}>
              <button
                onClick={() => {
                  setSmartFiles([]);
                  setSmartResults([]);
                  setShowSmartUpload(true);
                }}
                style={{
                  fontSize: "0.74rem", fontWeight: 700, color: "var(--ink)",
                  background: "var(--surface)", border: "1.5px solid var(--border)",
                  borderRadius: 7, padding: "5px 12px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 5,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Smart Upload (AI)
              </button>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              <button
                onClick={openCategoryPanel}
                style={{
                  fontSize: "0.74rem", fontWeight: 700, color: "var(--gold)",
                  background: "none", border: "none", cursor: "pointer",
                  padding: "2px 0",
                }}
              >
                + Add Categories
              </button>
            </div>

            {/* Category rows */}
            {categoryRows.length === 0 && unassignedBids.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--muted)" }}>
                <div style={{ fontSize: "0.88rem", fontWeight: 600, marginBottom: 4 }}>No categories yet</div>
                <button
                  onClick={openCategoryPanel}
                  style={{ color: "var(--gold)", fontWeight: 600, fontSize: "0.85rem", background: "none", border: "none", cursor: "pointer" }}
                >
                  Add categories to get started
                </button>
              </div>
            ) : (
              <>
                {/* Group category rows by grp */}
                {(() => {
                  const grouped: Record<string, typeof categoryRows> = {};
                  categoryRows.forEach(row => {
                    if (!grouped[row.grp]) grouped[row.grp] = [];
                    grouped[row.grp].push(row);
                  });
                  return Object.entries(grouped).map(([grp, rows]) => (
                    <div key={grp} style={{ marginBottom: 14 }}>
                      <div style={{
                        fontSize: "0.68rem", fontWeight: 800, color: "var(--muted)",
                        textTransform: "uppercase", letterSpacing: "0.04em",
                        marginBottom: 6, padding: "0 2px",
                      }}>
                        {grp}
                      </div>
                      {rows.map(row => {
                        const statusLabel =
                          row.status === "awarded" ? "🏆 Awarded" :
                          row.status === "paused" ? "⏸ Paused" :
                          row.status === "has_bids" ? `${row.totalResponses} response${row.totalResponses !== 1 ? "s" : ""}` :
                          row.status === "waiting" ? "Waiting for bids" :
                          row.status === "not_sent" ? "Ready · Not sent" :
                          "No bid";
                        const statusColor =
                          row.status === "awarded" ? "#166534" :
                          row.status === "paused" ? "#92400e" :
                          row.status === "has_bids" ? "var(--gold)" :
                          row.status === "waiting" ? "var(--gold)" :
                          row.status === "not_sent" ? "var(--muted)" :
                          "var(--muted)";
                        const statusBg =
                          row.status === "awarded" ? "#f0fdf4" :
                          row.status === "paused" ? "#fef3c7" :
                          row.status === "has_bids" ? "var(--gold-bg)" :
                          row.status === "waiting" ? "var(--gold-bg)" :
                          "#f3f4f6";
                        const statusBorder =
                          row.status === "awarded" ? "#bbf7d0" :
                          row.status === "paused" ? "#fde68a" :
                          row.status === "has_bids" || row.status === "waiting" ? "var(--gold-b)" : "#e5e7eb";

                        // Always go to category detail page
                        const href = `/customer/project/${id}/category/${row.category_id}`;

                        return (
                          <Link key={row.id} href={href} style={{ textDecoration: "none", color: "inherit" }}>
                            <div
                              style={{
                                display: "flex", alignItems: "center", gap: 12,
                                padding: "12px 14px", background: "var(--card)",
                                border: "1px solid var(--border)", borderRadius: 8,
                                marginBottom: 5, cursor: "pointer", transition: "all 0.15s",
                              }}
                              onMouseOver={e => { e.currentTarget.style.background = "var(--bg)"; e.currentTarget.style.borderColor = "var(--gold-b)"; }}
                              onMouseOut={e => { e.currentTarget.style.background = "var(--card)"; e.currentTarget.style.borderColor = "var(--border)"; }}
                            >
                              {/* Category name */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: "0.86rem", color: "var(--ink)" }}>
                                  {row.name}
                                </div>
                                <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 2 }}>
                                  {row.bids.length > 0 && (
                                    <span>
                                      {row.bids.length} bid{row.bids.length !== 1 ? "s" : ""}
                                      {row.overdueBids.length > 0 && (
                                        <span style={{ color: "#92400e", fontWeight: 700, marginLeft: 6 }}>
                                          {row.overdueBids.length} overdue
                                        </span>
                                      )}
                                      {row.closedBids.length > 0 && (
                                        <span style={{ marginLeft: 6 }}>
                                          {row.closedBids.length} closed
                                        </span>
                                      )}
                                    </span>
                                  )}
                                  {row.budget != null && row.budget > 0 && (
                                    <span style={{ marginLeft: row.bids.length > 0 ? 8 : 0 }}>
                                      Budget: <span style={{ fontWeight: 700 }}>${row.budget.toLocaleString()}</span>
                                      {row.awardedAmount > 0 && (
                                        <span style={{
                                          marginLeft: 6, fontWeight: 700,
                                          color: row.awardedAmount <= row.budget ? "#16a34a" : "#dc2626",
                                        }}>
                                          {row.awardedAmount <= row.budget
                                            ? `saved $${(row.budget - row.awardedAmount).toLocaleString()}`
                                            : `over $${(row.awardedAmount - row.budget).toLocaleString()}`}
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Response count if has bids */}
                              {row.totalResponses > 0 && (
                                <div style={{ textAlign: "center", minWidth: 40 }}>
                                  <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--ink)" }}>
                                    {row.totalResponses}
                                  </div>
                                  <div style={{ fontSize: "0.6rem", color: "var(--muted)", textTransform: "uppercase" }}>bids</div>
                                </div>
                              )}

                              {/* Status pill */}
                              <span style={{
                                fontSize: "0.66rem", fontWeight: 700, textTransform: "uppercase",
                                padding: "3px 10px", borderRadius: 100,
                                background: statusBg, color: statusColor,
                                border: `1px solid ${statusBorder}`,
                                whiteSpace: "nowrap",
                              }}>
                                {statusLabel}
                              </span>

                              {/* Remove button */}
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); confirmRemoveCategory(row.category_id); }}
                                style={{
                                  background: "none", border: "none", cursor: "pointer",
                                  color: "var(--muted)", fontSize: "0.7rem", padding: "2px",
                                  opacity: 0.5, transition: "opacity 0.15s",
                                }}
                                onMouseOver={e => { e.currentTarget.style.opacity = "1"; }}
                                onMouseOut={e => { e.currentTarget.style.opacity = "0.5"; }}
                                title="Remove category"
                              >
                                ✕
                              </button>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  ));
                })()}

                {/* Unassigned bids */}
                {unassignedBids.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{
                      fontSize: "0.68rem", fontWeight: 800, color: "var(--muted)",
                      textTransform: "uppercase", letterSpacing: "0.04em",
                      marginBottom: 6, padding: "0 2px",
                    }}>
                      Uncategorized
                    </div>
                    {unassignedBids.map(bid => {
                      const isOverdue = bid.status === "active" && new Date(bid.deadline) < new Date();
                      return (
                        <Link key={bid.id} href={`/customer/${bid.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                          <div
                            style={{
                              display: "flex", alignItems: "center", gap: 12,
                              padding: "12px 14px", background: "var(--card)",
                              border: "1px solid var(--border)", borderRadius: 8,
                              marginBottom: 5, cursor: "pointer", transition: "all 0.15s",
                            }}
                            onMouseOver={e => { e.currentTarget.style.background = "var(--bg)"; }}
                            onMouseOut={e => { e.currentTarget.style.background = "var(--card)"; }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: "0.86rem", color: "var(--ink)" }}>{bid.title}</div>
                              <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 2 }}>
                                Deadline: {new Date(bid.deadline).toLocaleDateString()}
                                {isOverdue && <span style={{ color: "#92400e", fontWeight: 700, marginLeft: 6 }}>OVERDUE</span>}
                              </div>
                            </div>
                            {bid.vendor_response_count > 0 && (
                              <div style={{ textAlign: "center", minWidth: 40 }}>
                                <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--ink)" }}>{bid.vendor_response_count}</div>
                                <div style={{ fontSize: "0.6rem", color: "var(--muted)", textTransform: "uppercase" }}>bids</div>
                              </div>
                            )}
                            <span style={{
                              fontSize: "0.66rem", fontWeight: 700, textTransform: "uppercase",
                              padding: "3px 10px", borderRadius: 100,
                              background: bid.status === "active" ? "var(--gold-bg)" : "#f3f4f6",
                              color: bid.status === "active" ? "var(--gold)" : "var(--muted)",
                              border: `1px solid ${bid.status === "active" ? "var(--gold-b)" : "#e5e7eb"}`,
                            }}>
                              {bid.status}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* TEAM TAB */}
        {tab === "team" && (
          <div>
            {project.team.map(member => (
              <div key={member.id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
                marginBottom: 6,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%", background: "var(--gold-bg)",
                  border: "2px solid var(--gold-b)", display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, fontSize: "0.75rem", color: "var(--gold)", flexShrink: 0,
                }}>
                  {member.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.86rem", color: "var(--ink)" }}>{member.name}</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{member.email}</div>
                </div>
                <select
                  value={member.role}
                  onChange={async (e) => {
                    const newRole = e.target.value;
                    await fetch(`/api/projects/${id}/team`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ member_id: member.id, role: newRole }),
                    });
                    setProject(p => p ? {
                      ...p,
                      team: p.team.map(m => m.id === member.id ? { ...m, role: newRole } : m),
                    } : p);
                    showToast(`Role updated to ${newRole}`);
                  }}
                  style={{
                    fontSize: "0.72rem", fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                    background: member.role === "manager" ? "var(--gold-bg)" : "var(--bg)",
                    color: member.role === "manager" ? "var(--gold)" : "var(--muted)",
                    border: `1px solid ${member.role === "manager" ? "var(--gold-b)" : "var(--border)"}`,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  <option value="member">Member</option>
                  <option value="manager">Manager</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  onClick={() => handleRemoveTeamMember(member.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "0.8rem" }}
                >
                  ✕
                </button>
              </div>
            ))}

            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 8,
              marginTop: 14, alignItems: "end",
            }}>
              <div>
                <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Name</div>
                <input value={teamName} onChange={e => setTeamName(e.target.value)} style={inputStyle} placeholder="John Doe" />
              </div>
              <div>
                <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Email</div>
                <input value={teamEmail} onChange={e => setTeamEmail(e.target.value)} style={inputStyle} placeholder="john@company.com" type="email" />
              </div>
              <select value={teamRole} onChange={e => setTeamRole(e.target.value)} style={{ ...inputStyle, width: 110 }}>
                <option value="member">Member</option>
                <option value="manager">Manager</option>
                <option value="viewer">Viewer</option>
              </select>
              <button className="btn btn-gold btn-xs" onClick={handleAddTeamMember} disabled={!teamName || !teamEmail}>
                + Add
              </button>
            </div>

            <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--bg)", borderRadius: 8, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", marginBottom: 6 }}>Role Permissions</div>
              <div style={{ fontSize: "0.74rem", color: "var(--ink2)", lineHeight: 1.6 }}>
                <div><strong>Manager</strong> — Full access: view, edit bids, manage vendors, view budget</div>
                <div><strong>Member</strong> — Can view and edit bids, add responses, but cannot manage settings</div>
                <div><strong>Viewer</strong> — Read-only access: view bids and responses, no editing</div>
              </div>
            </div>
          </div>
        )}

        {/* FILES TAB */}
        {tab === "files" && (
          <div>
            <div
              style={{
                border: "2px dashed var(--border2)", borderRadius: 10, padding: "24px",
                textAlign: "center", marginBottom: 14, cursor: "pointer",
                background: "var(--bg)", transition: "border-color 0.2s",
              }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--gold)"; }}
              onDragLeave={e => { e.currentTarget.style.borderColor = "var(--border2)"; }}
              onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--border2)"; handleFileUpload(e.dataTransfer.files); }}
            >
              <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={e => handleFileUpload(e.target.files)} />
              <div style={{ fontSize: "0.84rem", fontWeight: 600, color: "var(--ink2)" }}>
                {uploading ? "Uploading..." : "Drop files here or click to browse"}
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 4 }}>PDF, DWG, images, specs</div>
            </div>

            {project.files.length === 0 && (
              <div style={{ textAlign: "center", padding: "24px", color: "var(--muted)", fontSize: "0.82rem" }}>No files uploaded yet</div>
            )}

            {project.files.map(file => (
              <div key={file.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
                marginBottom: 6,
              }}>
                <a
                  href={`/api/projects/${id}/files/${file.id}`}
                  target="_blank" rel="noreferrer"
                  style={{ flex: 1, fontSize: "0.84rem", fontWeight: 600, color: "var(--ink)", textDecoration: "none" }}
                >
                  {file.filename}
                </a>
                <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                  {new Date(file.uploaded_at).toLocaleDateString()}
                </span>
                <button
                  onClick={() => handleDeleteFile(file.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "0.8rem" }}
                >
                  ✕
                </button>
              </div>
            ))}

            {/* File Links */}
            <div style={{
              marginTop: 14, padding: "12px 14px", background: "var(--bg)",
              borderRadius: 8, border: "1px solid var(--border)",
            }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                🔗 File Links
              </div>

              {projectLinks.map(link => (
                <div key={link.id} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
                  borderBottom: "1px solid var(--border)",
                }}>
                  <span style={{ fontSize: "0.78rem" }}>🔗</span>
                  <a href={link.url} target="_blank" rel="noreferrer" style={{
                    flex: 1, fontSize: "0.82rem", fontWeight: 600, color: "var(--gold)",
                    textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {link.label || link.url}
                  </a>
                  <button
                    onClick={() => {
                      const newLabel = prompt("Enter label for this link:", link.label || "");
                      if (newLabel === null) return;
                      fetch("/api/file-links", {
                        method: "PATCH", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: link.id, label: newLabel }),
                      }).then(() => {
                        setProjectLinks(prev => prev.map(l => l.id === link.id ? { ...l, label: newLabel } : l));
                        showToast("Label updated");
                      });
                    }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "0.68rem", fontWeight: 600 }}
                    title="Rename link"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={async () => {
                      await fetch("/api/file-links", {
                        method: "DELETE", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: link.id }),
                      });
                      setProjectLinks(prev => prev.filter(l => l.id !== link.id));
                    }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "0.7rem" }}
                  >
                    ✕
                  </button>
                </div>
              ))}

              <div style={{ display: "flex", gap: 6, marginTop: projectLinks.length > 0 ? 8 : 0 }}>
                <input
                  value={newProjLinkUrl}
                  onChange={e => setNewProjLinkUrl(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  style={{
                    flex: 2, padding: "7px 10px", background: "var(--surface)",
                    border: "1.5px solid var(--border)", borderRadius: 7,
                    color: "var(--ink)", fontSize: "0.82rem", outline: "none",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                />
                <input
                  value={newProjLinkLabel}
                  onChange={e => setNewProjLinkLabel(e.target.value)}
                  onKeyDown={async e => {
                    if (e.key === "Enter" && newProjLinkUrl.trim()) {
                      e.preventDefault();
                      const res = await fetch("/api/file-links", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ref_type: "project", ref_id: id, links: [{ url: newProjLinkUrl.trim(), label: newProjLinkLabel.trim() }] }),
                      });
                      if (res.ok) {
                        const created = await res.json();
                        setProjectLinks(prev => [...created, ...prev]);
                        setNewProjLinkUrl(""); setNewProjLinkLabel("");
                        showToast("Link added");
                        triggerResendModal();
                      }
                    }
                  }}
                  placeholder="Label (optional)"
                  style={{
                    flex: 1, padding: "7px 10px", background: "var(--surface)",
                    border: "1.5px solid var(--border)", borderRadius: 7,
                    color: "var(--ink)", fontSize: "0.82rem", outline: "none",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                />
                <button
                  className="btn btn-outline btn-xs"
                  onClick={async () => {
                    if (!newProjLinkUrl.trim()) return;
                    const res = await fetch("/api/file-links", {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ ref_type: "project", ref_id: id, links: [{ url: newProjLinkUrl.trim(), label: newProjLinkLabel.trim() }] }),
                    });
                    if (res.ok) {
                      const created = await res.json();
                      setProjectLinks(prev => [...created, ...prev]);
                      setNewProjLinkUrl(""); setNewProjLinkLabel("");
                      showToast("Link added");
                      triggerResendModal();
                    }
                  }}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* === MODALS (portaled to body to avoid overflow:hidden issues) === */}
    {typeof document !== "undefined" && createPortal(<>
      {/* RESEND NOTIFICATION MODAL */}
      {showResendModal && project && (
        <div className="modal-overlay open" onClick={() => setShowResendModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, marginBottom: 6 }}>
              Notify Vendors?
            </h3>
            <p style={{ fontSize: "0.84rem", color: "var(--ink2)", marginBottom: 14 }}>
              New files were added. Would you like to notify vendors about the update?
            </p>

            {/* Scope selection */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.84rem", fontWeight: 600, marginBottom: 6 }}>
                <input type="radio" name="resendScope" checked={resendScope === "all"} onChange={() => { setResendScope("all"); setResendSelectedBids(new Set(project.bids.filter(b => b.status === "active").map(b => b.id))); }} style={{ accentColor: "var(--gold)" }} />
                All active bids
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.84rem", fontWeight: 600 }}>
                <input type="radio" name="resendScope" checked={resendScope === "select"} onChange={() => setResendScope("select")} style={{ accentColor: "var(--gold)" }} />
                Select specific bids
              </label>
            </div>

            {resendScope === "select" && (
              <div style={{ maxHeight: 160, overflowY: "auto", marginBottom: 12, border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px" }}>
                {project.bids.filter(b => b.status === "active").map(b => (
                  <label key={b.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", cursor: "pointer", borderBottom: "1px solid var(--border)", fontSize: "0.82rem" }}>
                    <input
                      type="checkbox"
                      checked={resendSelectedBids.has(b.id)}
                      onChange={e => {
                        const next = new Set(resendSelectedBids);
                        if (e.target.checked) next.add(b.id);
                        else next.delete(b.id);
                        setResendSelectedBids(next);
                      }}
                      style={{ accentColor: "var(--gold)" }}
                    />
                    {b.title}
                  </label>
                ))}
                {project.bids.filter(b => b.status === "active").length === 0 && (
                  <div style={{ fontSize: "0.8rem", color: "var(--muted)", padding: "8px 0" }}>No active bids</div>
                )}
              </div>
            )}

            {/* Optional message */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase" }}>
                Message to vendors (optional)
              </div>
              <textarea
                value={resendMessage}
                onChange={e => setResendMessage(e.target.value)}
                placeholder="e.g., Updated drawings have been uploaded..."
                style={{
                  width: "100%", padding: "8px 10px", border: "1.5px solid var(--border)",
                  borderRadius: 7, fontSize: "0.82rem", minHeight: 60, resize: "vertical",
                  fontFamily: "'Plus Jakarta Sans', sans-serif", outline: "none",
                  background: "var(--surface)", color: "var(--ink)", boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline btn-sm" onClick={() => setShowResendModal(false)}>
                Skip
              </button>
              <button
                className="btn btn-gold btn-sm"
                onClick={handleResendNotify}
                disabled={resending || resendSelectedBids.size === 0}
              >
                {resending ? "Sending..." : `Notify Vendors (${resendSelectedBids.size} bid${resendSelectedBids.size !== 1 ? "s" : ""})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAUSE MODAL */}
      {showStop && (
        <div className="modal-overlay open" onClick={() => setShowStop(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, marginBottom: 12 }}>
              Pause Project
            </h3>
            <p style={{ fontSize: "0.88rem", color: "var(--ink2)", marginBottom: 20 }}>
              This will pause <strong>{project.name}</strong> and close all active bids.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline btn-sm" onClick={() => setShowStop(false)}>Cancel</button>
              <button className="btn btn-gold btn-sm" onClick={handleStop} disabled={stopping}>
                {stopping ? "Pausing..." : "Pause Project"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CATEGORY CONFIRMATION */}
      {deletingCat && (
        <div className="modal-overlay open" onClick={() => setDeletingCat(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, marginBottom: 12 }}>
              Remove Category
            </h3>
            <p style={{ fontSize: "0.88rem", color: "var(--ink2)", marginBottom: 8 }}>
              Are you sure you want to remove <strong>{deletingCat.name}</strong>?
            </p>
            {deletingCat.hasBids && (
              <div style={{
                background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8,
                padding: "10px 14px", fontSize: "0.82rem", color: "#92400e",
                marginBottom: 12, fontWeight: 600,
              }}>
                This category has bids and data inside. Removing it will delete all associated bids, vendor responses, and files.
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline btn-sm" onClick={() => setDeletingCat(null)}>Cancel</button>
              <button
                className="btn btn-gold btn-sm"
                onClick={handleRemoveCategory}
                disabled={removingCat}
                style={{ background: "#92400e", borderColor: "#92400e" }}
              >
                {removingCat ? "Removing..." : deletingCat.hasBids ? "Remove with all data" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD CATEGORIES PANEL */}
      {showCatPanel && (
        <div className="modal-overlay open" onClick={() => setShowCatPanel(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, width: "95vw", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, margin: 0, flex: 1 }}>
                Add Categories
              </h3>
              <button
                onClick={() => setShowCatPanel(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "1rem" }}
              >
                ✕
              </button>
            </div>

            {/* Presets row */}
            {presets.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                  Saved Presets
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {presets.map(preset => (
                    <div key={preset.id} style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "4px 10px", borderRadius: 100, fontSize: "0.74rem",
                      fontWeight: 600, background: "var(--bg)",
                      border: "1px solid var(--border)", cursor: "pointer",
                      color: "var(--ink2)",
                    }}>
                      <span onClick={() => applyPreset(preset)} style={{ cursor: "pointer" }}>
                        {preset.name}
                        {preset.project_type && (
                          <span style={{ fontSize: "0.62rem", color: "var(--muted)", marginLeft: 4 }}>({preset.project_type})</span>
                        )}
                      </span>
                      <span style={{ fontSize: "0.62rem", color: "var(--muted)", marginLeft: 2 }}>
                        {preset.category_ids.length} cats
                      </span>
                      <button
                        onClick={() => handleDeletePreset(preset.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "0.65rem", padding: "0 0 0 3px" }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Search + options */}
            <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
              <input
                value={catSearch}
                onChange={e => setCatSearch(e.target.value)}
                placeholder="Search categories..."
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={selectAll}
                style={{
                  fontSize: "0.72rem", fontWeight: 700, color: "var(--gold)",
                  background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                {selectedCatIds.size === filteredCategories.length && filteredCategories.length > 0 ? "Deselect All" : "Select All"}
              </button>
            </div>

            {/* Include vendors toggle */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
              padding: "8px 10px", background: "var(--bg)", borderRadius: 8,
              border: "1px solid var(--border)",
            }}>
              <label style={{
                display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                fontSize: "0.8rem", fontWeight: 600, color: "var(--ink2)", flex: 1,
              }}>
                <input
                  type="checkbox"
                  checked={includeVendors}
                  onChange={e => setIncludeVendors(e.target.checked)}
                  style={{ accentColor: "var(--gold)" }}
                />
                Include vendors with categories
              </label>
              <span style={{ fontSize: "0.68rem", color: "var(--muted)" }}>
                Auto-assign vendors to bids
              </span>
            </div>

            {/* Category list */}
            <div style={{ flex: 1, overflowY: "auto", marginBottom: 12, minHeight: 0 }}>
              {Object.keys(groupedFiltered).length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px", color: "var(--muted)", fontSize: "0.82rem" }}>
                  {allCategories.length === 0 ? "Loading categories..." : "All categories already added"}
                </div>
              ) : (
                Object.entries(groupedFiltered).map(([grp, cats]) => {
                  const groupAllSelected = cats.every(c => selectedCatIds.has(c.id));
                  return (
                    <div key={grp} style={{ marginBottom: 12 }}>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 6, marginBottom: 6,
                      }}>
                        <button
                          onClick={() => selectAllInGroup(grp)}
                          style={{
                            fontSize: "0.68rem", fontWeight: 800, color: groupAllSelected ? "var(--gold)" : "var(--muted)",
                            textTransform: "uppercase", letterSpacing: "0.04em",
                            background: "none", border: "none", cursor: "pointer",
                          }}
                        >
                          {grp}
                        </button>
                        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                        <span style={{ fontSize: "0.62rem", color: "var(--muted)" }}>
                          {cats.filter(c => selectedCatIds.has(c.id)).length}/{cats.length}
                        </span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {cats.map(cat => {
                          const selected = selectedCatIds.has(cat.id);
                          return (
                            <button
                              key={cat.id}
                              onClick={() => toggleCat(cat.id)}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 4,
                                padding: "5px 10px", borderRadius: 100, fontSize: "0.76rem",
                                fontWeight: 600, cursor: "pointer", transition: "all 0.12s",
                                background: selected ? "var(--gold-bg)" : "var(--surface)",
                                color: selected ? "var(--gold)" : "var(--ink2)",
                                border: `1.5px solid ${selected ? "var(--gold-b)" : "var(--border)"}`,
                              }}
                            >
                              {cat.name}
                              {includeVendors && cat.vendors.length > 0 && (
                                <span style={{
                                  fontSize: "0.6rem", color: selected ? "var(--gold)" : "var(--muted)",
                                  fontWeight: 500,
                                }}>
                                  ({cat.vendors.length})
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Custom category */}
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10, paddingTop: 6, borderTop: "1px solid var(--border)", flexShrink: 0 }}>
              <input
                value={customCatName}
                onChange={e => setCustomCatName(e.target.value)}
                placeholder="Add custom category..."
                className="finput"
                style={{ flex: 1, fontSize: "0.8rem", padding: "5px 10px" }}
                onKeyDown={e => { if (e.key === "Enter" && customCatName.trim()) handleAddCustomCategory(); }}
              />
              <button
                className="btn btn-gold btn-xs"
                onClick={(e) => { e.stopPropagation(); handleAddCustomCategory(); }}
                disabled={!customCatName.trim() || customCatAdding}
                type="button"
              >
                {customCatAdding ? "..." : "+ Add"}
              </button>
            </div>

            {/* Footer actions */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              borderTop: "1px solid var(--border)", paddingTop: 12,
              flexShrink: 0,
            }}>
              <div style={{ flex: 1, fontSize: "0.76rem", color: "var(--muted)", fontWeight: 600 }}>
                {selectedCatIds.size} selected
                {includeVendors && selectedCatIds.size > 0 && (() => {
                  let vCount = 0;
                  allCategories.forEach(c => { if (selectedCatIds.has(c.id)) vCount += c.vendors.length; });
                  return <span> · {vCount} vendors</span>;
                })()}
              </div>

              {/* Save as preset */}
              {selectedCatIds.size > 0 && !showPresetSave && (
                <button
                  onClick={() => setShowPresetSave(true)}
                  style={{
                    fontSize: "0.72rem", fontWeight: 600, color: "var(--muted)",
                    background: "none", border: "none", cursor: "pointer",
                  }}
                >
                  Save as preset
                </button>
              )}

              <button className="btn btn-outline btn-sm" onClick={() => setShowCatPanel(false)}>Cancel</button>
              <button
                className="btn btn-gold btn-sm"
                onClick={handleAddCategories}
                disabled={selectedCatIds.size === 0 || addingCats}
              >
                {addingCats ? "Adding..." : `Add ${selectedCatIds.size > 0 ? selectedCatIds.size : ""} Categories`}
              </button>
            </div>

            {/* Save preset inline form */}
            {showPresetSave && (
              <div style={{
                marginTop: 10, padding: "10px 12px", background: "var(--bg)",
                borderRadius: 8, border: "1px solid var(--border)",
              }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Save Preset
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "end" }}>
                  <div style={{ flex: 1 }}>
                    <input
                      value={presetName}
                      onChange={e => setPresetName(e.target.value)}
                      placeholder="Preset name (e.g. Bronx)"
                      style={{ ...inputStyle, fontSize: "0.8rem" }}
                    />
                  </div>
                  <div style={{ width: 120 }}>
                    <input
                      value={presetType}
                      onChange={e => setPresetType(e.target.value)}
                      placeholder="Project type"
                      style={{ ...inputStyle, fontSize: "0.8rem" }}
                    />
                  </div>
                  <button
                    className="btn btn-gold btn-xs"
                    onClick={handleSavePreset}
                    disabled={!presetName || savingPreset}
                  >
                    {savingPreset ? "..." : "Save"}
                  </button>
                  <button
                    onClick={() => { setShowPresetSave(false); setPresetName(""); setPresetType(""); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "0.8rem" }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* ===== Smart Upload Modal ===== */}
      {showSmartUpload && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)", padding: 20 }} onClick={() => setShowSmartUpload(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: 720, maxWidth: "95vw", maxHeight: "90vh", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column" }}>

            {/* Fixed header */}
            <div style={{ padding: "24px 28px 0 28px", flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "var(--ink)" }}>
                  Smart Upload — AI Quote Scanner
                </h3>
                <button onClick={() => setShowSmartUpload(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.2rem", color: "var(--muted)" }}>&#10005;</button>
              </div>
              <p style={{ fontSize: "0.82rem", color: "var(--muted)", margin: "0 0 12px 0" }}>
                Upload vendor quotes from any trade. AI will detect the trade category automatically.
              </p>
            </div>

            {/* Scrollable middle */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0 28px", minHeight: 0 }}>

              {/* File upload zone */}
              {smartResults.length === 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{
                    border: "2px dashed var(--border)", borderRadius: 10, padding: "18px",
                    textAlign: "center", cursor: "pointer", background: "var(--bg)",
                    transition: "all 0.15s",
                  }}
                    onClick={() => document.getElementById("smart-file-input")?.click()}
                    onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--gold)"; }}
                    onDragLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
                    onDrop={e => {
                      e.preventDefault();
                      e.currentTarget.style.borderColor = "var(--border)";
                      const files = Array.from(e.dataTransfer.files);
                      setSmartFiles(prev => [...prev, ...files]);
                    }}
                  >
                    <div style={{ fontSize: "1.3rem", marginBottom: 4 }}>&#128196;</div>
                    <div style={{ fontSize: "0.84rem", fontWeight: 600, color: "var(--ink)", marginBottom: 2 }}>
                      Drop vendor quotes here or click to browse
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "var(--muted)" }}>
                      PDF, Images — Multiple files supported
                    </div>
                  </div>
                  <input
                    id="smart-file-input"
                    type="file"
                    accept=".pdf,image/*"
                    multiple
                    style={{ display: "none" }}
                    onChange={e => {
                      const files = Array.from(e.target.files || []);
                      setSmartFiles(prev => [...prev, ...files]);
                      e.target.value = "";
                    }}
                  />
                </div>
              )}

              {/* Paste link */}
              {smartResults.length === 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                    <span style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase" }}>or paste a link</span>
                    <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="url"
                      value={smartUrl}
                      onChange={e => setSmartUrl(e.target.value)}
                      placeholder="Paste file or folder link (Dropbox / Google Drive)"
                      className="finput"
                      style={{ flex: 1, fontSize: "0.82rem" }}
                    />
                    <button
                      className="btn btn-gold"
                      onClick={handleSmartUrlFetch}
                      disabled={smartUrlLoading || !smartUrl.trim()}
                      style={{ whiteSpace: "nowrap", opacity: smartUrlLoading ? 0.7 : 1 }}
                    >
                      {smartUrlLoading ? "..." : "Fetch"}
                    </button>
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: 4 }}>
                    Supports folders too — subfolder names become vendor names automatically
                  </div>
                </div>
              )}

              {/* File list */}
              {smartFiles.length > 0 && smartResults.length === 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase" }}>
                    {smartFiles.length} files ready
                  </div>
                  <div style={{ maxHeight: 200, overflowY: "auto", borderRadius: 8, border: "1px solid var(--border)" }}>
                    {smartFiles.map((f, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "5px 10px",
                        borderBottom: i < smartFiles.length - 1 ? "1px solid var(--border)" : "none",
                        background: i % 2 === 0 ? "var(--surface)" : "#fff",
                      }}>
                        <span style={{ fontSize: "0.74rem" }}>&#128196;</span>
                        <span style={{ flex: 1, fontSize: "0.78rem", fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                        <span style={{ fontSize: "0.7rem", color: "var(--muted)", flexShrink: 0 }}>{(f.size / 1024).toFixed(0)} KB</span>
                        <button onClick={() => setSmartFiles(smartFiles.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", flexShrink: 0, fontSize: "0.8rem" }}>&#10005;</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Results */}
              {smartResults.length > 0 && (
                <div>
                  <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--gold)", textTransform: "uppercase", marginBottom: 8 }}>
                    Results — {smartResults.filter(r => r.data).length}/{smartResults.length} Parsed
                    {smartParsing && <span style={{ color: "var(--muted)", fontWeight: 600 }}> — Analyzing... {smartParseProgress}</span>}
                  </div>

                  {smartResults.map((r, ri) => (
                    <div key={ri} style={{
                      border: r.error ? "1.5px solid var(--border)" : "2px solid var(--gold)",
                      borderRadius: 10, padding: "10px 14px", marginBottom: 6,
                      background: r.error ? "var(--surface)" : "var(--gold-bg)",
                      opacity: r.error ? 0.6 : 1,
                    }}>
                      <div style={{ fontSize: "0.68rem", color: "var(--muted)", marginBottom: 3 }}>
                        {r.fileName}
                      </div>
                      {r.error ? (
                        <div style={{ fontSize: "0.82rem", color: "var(--muted)", fontWeight: 600 }}>Failed to parse</div>
                      ) : (
                        <>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <div style={{ fontWeight: 700, fontSize: "0.86rem", color: "var(--ink)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {r.data.vendor_name}
                            </div>
                            <select
                              value={r.data.matched_category_id || "__new__" + (r.data.suggested_new_category || "")}
                              onChange={e => {
                                const val = e.target.value;
                                const updated = [...smartResults];
                                if (val.startsWith("__new__")) {
                                  updated[ri] = { ...r, data: { ...r.data, matched_category_id: null, category_in_project: false, detected_category: null, suggested_new_category: val.replace("__new__", "") || null } };
                                } else {
                                  const cat = allCategories.find(c => c.id === val);
                                  updated[ri] = { ...r, data: { ...r.data, matched_category_id: val, category_in_project: true, detected_category: cat?.name || "", suggested_new_category: null } };
                                }
                                setSmartResults(updated);
                              }}
                              style={{
                                fontSize: "0.72rem", fontWeight: 700, padding: "3px 8px", borderRadius: 5,
                                border: "1.5px solid var(--gold)", background: r.data.matched_category_id ? "var(--gold-bg)" : "#fff3cd",
                                color: r.data.matched_category_id ? "var(--gold)" : "#856404",
                                cursor: "pointer", maxWidth: 200, flexShrink: 0,
                              }}
                            >
                              {r.data.suggested_new_category && !r.data.matched_category_id && (
                                <option value={"__new__" + r.data.suggested_new_category}>New: {r.data.suggested_new_category}</option>
                              )}
                              {allCategories.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                          {r.data.proposals.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {r.data.proposals.map((p: any, pi: number) => (
                                <span key={pi} style={{
                                  fontSize: "0.7rem", background: "var(--card)", border: "1px solid var(--border)",
                                  borderRadius: 5, padding: "2px 8px",
                                }}>
                                  {p.name} — <strong style={{ color: "var(--gold)" }}>${Number(p.price).toLocaleString()}</strong>
                                </span>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Smart filter — quick exclude by filename keywords */}
            {smartFiles.length > 5 && smartResults.length === 0 && (
              <div style={{ marginBottom: 10, flexShrink: 0 }}>
                <div
                  onClick={() => setShowSmartFilter(!showSmartFilter)}
                  style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--gold)", cursor: "pointer", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}
                >
                  <span style={{ transform: showSmartFilter ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s", display: "inline-block" }}>&#9654;</span>
                  Filter files before scanning
                  {smartExcludeKeywords.length > 0 && (
                    <span style={{ fontSize: "0.68rem", color: "var(--muted)", fontWeight: 600 }}> · {smartFiles.filter(f => !smartExcludeKeywords.some(k => f.name.toLowerCase().includes(k.toLowerCase()))).length} of {smartFiles.length} will be scanned</span>
                  )}
                </div>
                {showSmartFilter && (
                  <div style={{ background: "var(--surface)", borderRadius: 8, padding: "8px 12px", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginBottom: 6 }}>
                      Quick exclude by filename keyword:
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                      {["כתובת", "address", "תשלום", "payment", "חשבונית", "invoice", "ערבות", "guarantee", "ביטוח", "insurance", "רישיון", "license", "תעודה", "certificate"].map(kw => {
                        const active = smartExcludeKeywords.includes(kw);
                        const matchCount = smartFiles.filter(f => f.name.toLowerCase().includes(kw.toLowerCase())).length;
                        if (matchCount === 0) return null;
                        return (
                          <button
                            key={kw}
                            type="button"
                            onClick={() => {
                              setSmartExcludeKeywords(prev =>
                                active ? prev.filter(k => k !== kw) : [...prev, kw]
                              );
                            }}
                            style={{
                              fontSize: "0.7rem", fontWeight: 600, padding: "3px 8px", borderRadius: 5,
                              border: active ? "1.5px solid var(--gold)" : "1px solid var(--border)",
                              background: active ? "var(--gold-bg)" : "#fff",
                              color: active ? "var(--gold)" : "var(--ink2)",
                              cursor: "pointer", textDecoration: active ? "line-through" : "none",
                            }}
                          >
                            {kw} ({matchCount})
                          </button>
                        );
                      })}
                    </div>
                    {smartExcludeKeywords.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                          Excluding {smartFiles.filter(f => smartExcludeKeywords.some(k => f.name.toLowerCase().includes(k.toLowerCase()))).length} files
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSmartFiles(prev => prev.filter(f => !smartExcludeKeywords.some(k => f.name.toLowerCase().includes(k.toLowerCase()))));
                            setSmartExcludeKeywords([]);
                            showToast("Excluded files removed");
                          }}
                          className="btn btn-outline btn-xs"
                          style={{ fontSize: "0.68rem" }}
                        >
                          Remove excluded files
                        </button>
                        <button
                          type="button"
                          onClick={() => setSmartExcludeKeywords([])}
                          style={{ fontSize: "0.68rem", color: "var(--muted)", background: "none", border: "none", cursor: "pointer" }}
                        >
                          Clear filter
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Fixed footer with buttons */}
            <div style={{ padding: "16px 28px 24px 28px", flexShrink: 0, borderTop: smartFiles.length > 0 || smartResults.length > 0 ? "1px solid var(--border)" : "none" }}>
              {smartResults.length === 0 ? (
                <button
                  className="btn btn-gold"
                  onClick={handleSmartParse}
                  disabled={smartParsing || smartFiles.length === 0}
                  style={{ width: "100%", justifyContent: "center", opacity: smartParsing ? 0.7 : 1 }}
                >
                  {smartParsing ? `Analyzing... ${smartParseProgress}` : `Scan ${smartFiles.length} File${smartFiles.length > 1 ? "s" : ""} with AI`}
                </button>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-outline"
                    onClick={() => { setSmartResults([]); setSmartFiles([]); }}
                    style={{ flex: 1, justifyContent: "center" }}
                  >
                    Start Over
                  </button>
                  <button
                    className="btn btn-gold"
                    onClick={handleSmartSave}
                    disabled={smartSaving || smartParsing || !smartResults.some(r => r.data)}
                    style={{ flex: 1, justifyContent: "center" }}
                  >
                    {smartSaving ? "Saving..." : `Save ${smartResults.filter(r => r.data).length} Responses`}
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </>, document.body)}
  </>
  );
}
