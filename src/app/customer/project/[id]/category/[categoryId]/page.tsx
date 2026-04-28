"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
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
  vendor_name?: string;
  vendor_email?: string;
  status: string;
  sent_at: string;
  token?: string;
}
interface ProjectCategory {
  id: string;
  category_id: string;
  name: string;
  grp: string;
  budget?: number | null;
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
  const [categoryBudget, setCategoryBudget] = useState<number | null>(null);
  const [editingCatBudget, setEditingCatBudget] = useState(false);
  const [catBudgetInput, setCatBudgetInput] = useState("");
  const [categoryVendors, setCategoryVendors] = useState<Vendor[]>([]);
  const [allCategoryVendors, setAllCategoryVendors] = useState<Vendor[]>([]);
  const [allVendors, setAllVendors] = useState<Vendor[]>([]);
  const [vendorSearch, setVendorSearch] = useState("");
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
  const [bidMode, setBidMode] = useState<"structured" | "open">("structured");
  const [suggestedSpecs, setSuggestedSpecs] = useState<string[]>([]);
  const [newSpecField, setNewSpecField] = useState("");

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

  // Manual response modal
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualVendorName, setManualVendorName] = useState("");
  interface ManualProposal { name: string; price: string; specs: { key: string; value: string }[] }
  const [manualProposals, setManualProposals] = useState<ManualProposal[]>([
    { name: "", price: "", specs: [{ key: "", value: "" }] },
  ]);
  const [manualActiveP, setManualActiveP] = useState(0);
  const [manualSaving, setManualSaving] = useState(false);

  // Comparison filter — which proposals (columns) to show
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  // Merged spec rows: maps alias spec keys to their canonical/primary key
  const [mergedSpecs, setMergedSpecs] = useState<Record<string, string>>({});
  const [mergeSource, setMergeSource] = useState<string | null>(null);
  const [hiddenSpecRows, setHiddenSpecRows] = useState<Set<string>>(new Set());
  const [showColFilter, setShowColFilter] = useState(false);
  const [autoMerging, setAutoMerging] = useState(false);

  // AI Analysis
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [showAiAnalysis, setShowAiAnalysis] = useState(false);

  // AI bid creation from quote
  const [showAiBidCreate, setShowAiBidCreate] = useState(false);
  const [aiBidFile, setAiBidFile] = useState<File | null>(null);
  const [aiBidText, setAiBidText] = useState("");
  const [aiBidCreating, setAiBidCreating] = useState(false);

  // AI plan analysis (Pro+)
  const [showPlanAnalysis, setShowPlanAnalysis] = useState(false);
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [planText, setPlanText] = useState("");
  const [planUrl, setPlanUrl] = useState("");
  const [planAnalyzing, setPlanAnalyzing] = useState(false);
  const [planResult, setPlanResult] = useState<any>(null);
  const [planUpgradeNeeded, setPlanUpgradeNeeded] = useState(false);

  // AI parse (multi-file support)
  const [showAiParse, setShowAiParse] = useState(false);
  const [aiFiles, setAiFiles] = useState<File[]>([]);
  const [aiText, setAiText] = useState("");
  const [aiParsing, setAiParsing] = useState(false);
  const [aiResults, setAiResults] = useState<{ fileName: string; vendor_name: string; proposals: ManualProposal[] }[]>([]);
  // Legacy single result for backward compat
  const [aiResult, setAiResult] = useState<{ vendor_name: string; proposals: ManualProposal[] } | null>(null);
  // URL fetch for AI parse
  const [aiUrl, setAiUrl] = useState("");
  const [aiUrlLoading, setAiUrlLoading] = useState(false);

  // Bid results sub-view: "list" (vendor list) or "compare" (comparison table)
  const [resultsView, setResultsView] = useState<"list" | "compare">("list");

  // Templates for form tab
  interface BidTemplateItem { id: string; name: string; category_id: string | null; title: string; description: string; parameters: BidParam[]; checklist: CheckItem[]; bid_mode?: string; suggested_specs?: string[]; is_default?: boolean }
  const [bidFormTemplates, setBidFormTemplates] = useState<BidTemplateItem[]>([]);
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);
  const [templatePanelSearch, setTemplatePanelSearch] = useState("");

  // Vendor form preview
  const [showVendorPreview, setShowVendorPreview] = useState(false);

  // Resend after save dialog
  const [showResendDialog, setShowResendDialog] = useState(false);
  const [resendToAll, setResendToAll] = useState(true);
  const [resendSelectedIds, setResendSelectedIds] = useState<Set<string>>(new Set());
  const [resendMessage, setResendMessage] = useState("");
  const [resendSending, setResendSending] = useState(false);

  // Winner selection
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [winnerResp, setWinnerResp] = useState<any>(null);
  const [winnerProposalIdx, setWinnerProposalIdx] = useState(0);
  const [winnerNotes, setWinnerNotes] = useState("");
  const [winnerNotifyWinner, setWinnerNotifyWinner] = useState(true);
  const [winnerNotifyLosers, setWinnerNotifyLosers] = useState(true);
  const [winnerNotifyClerk, setWinnerNotifyClerk] = useState(false);
  const [winnerClerkEmail, setWinnerClerkEmail] = useState("");
  const [winnerClerkMsg, setWinnerClerkMsg] = useState("");
  const [winnerSaving, setWinnerSaving] = useState(false);
  const [bidWinner, setBidWinner] = useState<any>(null);

  // Move response to different category
  const [projectCategories, setProjectCategories] = useState<{ category_id: string; name: string }[]>([]);
  const [moveResponseId, setMoveResponseId] = useState<string | null>(null);

  // Edit response
  const [editResponseId, setEditResponseId] = useState<string | null>(null);

  // Spec completion request
  const [showSpecRequest, setShowSpecRequest] = useState(false);
  const [specRequestKeys, setSpecRequestKeys] = useState<string[]>([]);
  const [specRequestSelectedKeys, setSpecRequestSelectedKeys] = useState<Set<string>>(new Set());
  const [specRequestVendorIds, setSpecRequestVendorIds] = useState<Set<string>>(new Set());
  const [specRequestSending, setSpecRequestSending] = useState(false);

  // Notification settings (from user settings)
  const [notifSettings, setNotifSettings] = useState<Record<string, any>>({});

  useEffect(() => {
    // Load notification settings
    fetch("/api/auth/notification-settings").then(r => r.ok ? r.json() : {}).then((s: Record<string, any>) => {
      setNotifSettings(s || {});
      if (s?.clerk_email) setWinnerClerkEmail(s.clerk_email);
      if (s?.auto_notify_clerk) setWinnerNotifyClerk(true);
    }).catch(() => {});
  }, []);

  useEffect(() => { loadData(); }, [projectId, categoryId]);

  // Auto-save compare settings when they change
  const compareSettingsLoaded = useRef(false);
  useEffect(() => {
    if (!bid) return;
    // Skip saving on initial load
    if (!compareSettingsLoaded.current) {
      compareSettingsLoaded.current = true;
      return;
    }
    const settings = JSON.stringify({
      mergedSpecs,
      hiddenSpecRows: [...hiddenSpecRows],
      hiddenColumns: [...hiddenColumns],
    });
    fetch(`/api/bids/${bid.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ compare_settings: settings }),
    }).catch(() => {});
  }, [mergedSpecs, hiddenSpecRows, hiddenColumns]);

  async function compressImageFile(file: File, maxSizeMB: number = 3.5): Promise<File> {
    return new Promise((resolve) => {
      // If already small enough, return as-is
      if (file.size <= maxSizeMB * 1024 * 1024) { resolve(file); return; }
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        // Scale down if very large
        let { width, height } = img;
        const maxDim = 3000;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
          } else {
            resolve(file);
          }
        }, "image/jpeg", 0.75);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  }

  async function handlePlanAnalysis() {
    if (!planFile && !planText.trim() && !planUrl.trim()) { showToast("Upload a plan, paste a link, or paste text"); return; }
    setPlanAnalyzing(true);
    setPlanUpgradeNeeded(false);
    try {
      // Prefer URL over file when URL is provided
      const useUrl = !!planUrl.trim();
      let fileToSend = planFile;

      if (!useUrl && planFile) {
        const isImage = planFile.type.startsWith("image/");
        const isPdf = planFile.type === "application/pdf";

        if (planFile.size > 4 * 1024 * 1024) {
          if (isImage) {
            showToast("Compressing image...");
            fileToSend = await compressImageFile(planFile, 3.5);
            if (fileToSend.size > 4 * 1024 * 1024) {
              showToast("Image still too large after compression. Try a smaller file.");
              setPlanAnalyzing(false);
              return;
            }
          } else if (isPdf) {
            showToast("PDF too large for direct upload (max 4MB). Paste a Google Drive or Dropbox link instead — any size PDF will be auto-split and analyzed!");
            setPlanAnalyzing(false);
            return;
          }
        }
      }

      const formData = new FormData();
      if (fileToSend && !useUrl) formData.append("file", fileToSend);
      if (useUrl) formData.append("file_url", planUrl.trim());
      if (planText.trim()) formData.append("text", planText.trim());
      if (category?.name) formData.append("trade_category", category.name);

      const res = await fetch("/api/bids/ai-plan-analysis", {
        method: "POST",
        body: formData,
      });

      if (res.status === 403) {
        const data = await res.json();
        if (data.upgrade) {
          setPlanUpgradeNeeded(true);
          setPlanAnalyzing(false);
          return;
        }
      }

      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || "Analysis failed");
        setPlanAnalyzing(false);
        return;
      }

      const { data } = await res.json();
      setPlanResult(data);
    } catch { showToast("Plan analysis failed"); }
    finally { setPlanAnalyzing(false); }
  }

  function applyPlanToBidForm(data: any) {
    if (!data?.bid_form) return;
    const bf = data.bid_form;
    if (bf.title) setEditTitle(bf.title);
    if (bf.description) {
      // Append quantities to description
      let desc = bf.description;
      if (data.quantities?.length > 0) {
        desc += "\n\n--- Quantities (AI Extracted) ---\n";
        for (const q of data.quantities) {
          desc += `• ${q.item}: ${q.quantity} ${q.unit}${q.confidence !== "high" ? ` (${q.confidence})` : ""}${q.notes ? ` — ${q.notes}` : ""}\n`;
        }
      }
      if (data.materials?.length > 0) {
        desc += "\n--- Materials ---\n";
        for (const m of data.materials) {
          desc += `• ${m.material}: ${m.specification || ""}${m.estimated_quantity ? ` — ~${m.estimated_quantity} ${m.unit || ""}` : ""}\n`;
        }
      }
      setEditDesc(desc);
    }
    if (bf.bid_mode) setBidMode(bf.bid_mode);
    if (bf.parameters?.length > 0) {
      setEditParams(bf.parameters.map((p: any) => ({
        name: p.name || "", options: p.options || [], is_track: !!p.is_track,
      })));
    }
    if (bf.suggested_specs?.length > 0) setSuggestedSpecs(bf.suggested_specs);
    if (bf.checklist?.length > 0) {
      setEditChecklist(bf.checklist.map((c: any) => ({ text: c.text || "", required: c.required !== false })));
    }
    // Set deadline 14 days
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 14);
    setEditDeadline(deadline.toISOString().split("T")[0]);

    setShowPlanAnalysis(false);
    setPlanResult(null);
    setTab("form");
    showToast("Bid form created from plan analysis");
  }

  async function handleAiBidCreate() {
    if (!aiBidFile && !aiBidText.trim()) { showToast("Upload a file or paste text"); return; }
    setAiBidCreating(true);
    try {
      let fileToSend = aiBidFile;
      if (aiBidFile && aiBidFile.size > 4 * 1024 * 1024) {
        if (aiBidFile.type.startsWith("image/")) {
          fileToSend = await compressImageFile(aiBidFile, 3.5);
          if (fileToSend.size > 4 * 1024 * 1024) {
            showToast("Image still too large. Try a smaller file.");
            setAiBidCreating(false);
            return;
          }
        } else {
          showToast("PDF too large for direct upload (max 4MB). Use a Google Drive or Dropbox link instead!");
          setAiBidCreating(false);
          return;
        }
      }
      const formData = new FormData();
      if (fileToSend) formData.append("file", fileToSend);
      if (aiBidText.trim()) formData.append("text", aiBidText.trim());

      const res = await fetch("/api/bids/ai-create-from-quote", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || "AI failed");
        setAiBidCreating(false);
        return;
      }

      const { data } = await res.json();

      // Build form values from AI result
      const aiTitle = data.title || "New Bid";
      const aiDesc = data.description || "";
      const aiMode = data.bid_mode || "structured";
      const aiParams = (data.parameters || []).map((p: any) => ({
        name: p.name || "", options: p.options || [], is_track: !!p.is_track,
      }));
      const aiSpecs = data.suggested_specs || [];
      const aiChecklist = (data.checklist || []).map((c: any) => ({
        text: c.text || "", required: c.required !== false,
      }));
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + (data.deadline_days || 7));
      const aiDeadline = deadline.toISOString().split("T")[0];

      if (!bid) {
        // No existing bid — create one via API with AI data, then reload
        const createRes = await fetch("/api/bids", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: aiTitle,
            description: aiDesc,
            deadline: aiDeadline,
            project_id: projectId,
            trade_category_id: categoryId,
            parameters: aiParams.filter((p: any) => p.name.trim() && p.options.length > 0),
            checklist: aiChecklist,
            bid_mode: aiMode,
            suggested_specs: aiSpecs,
            status: "draft",
          }),
        });
        if (createRes.ok) {
          setShowAiBidCreate(false);
          setAiBidFile(null);
          setAiBidText("");
          showToast("AI created bid form from quote");
          await loadData();
        } else {
          showToast("Failed to create bid");
        }
        return;
      }

      // Existing bid — apply to edit form
      setEditTitle(aiTitle);
      setEditDesc(aiDesc);
      setBidMode(aiMode);
      setEditParams(aiParams);
      setSuggestedSpecs(aiSpecs);
      setEditChecklist(aiChecklist);
      setEditDeadline(aiDeadline);

      setShowAiBidCreate(false);
      setAiBidFile(null);
      setAiBidText("");
      setTab("form");
      showToast("AI created bid form from quote — review and save");
    } catch { showToast("AI bid creation failed"); }
    finally { setAiBidCreating(false); }
  }

  async function handleAiAnalysis() {
    if (!bid) return;
    setAiAnalyzing(true);
    try {
      // Step 1: Collect all spec keys for auto-merge
      const allKeys: string[] = [];
      for (const resp of responses as any[]) {
        if (resp.proposals) {
          for (const p of resp.proposals) {
            if (p.specs) {
              for (const s of p.specs) {
                const k = s.key || s.spec_key || "";
                if (k && !allKeys.includes(k)) allKeys.push(k);
              }
            }
          }
        }
      }

      // Step 2: Auto-merge similar spec rows via AI
      if (allKeys.length >= 2) {
        const mergeRes = await fetch(`/api/bids/${bid.id}/auto-merge-specs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ specKeys: allKeys }),
        });
        if (mergeRes.ok) {
          const mergeData = await mergeRes.json();
          if (mergeData.merges && Object.keys(mergeData.merges).length > 0) {
            setMergedSpecs(prev => ({ ...prev, ...mergeData.merges }));
          }
        }
      }

      // Step 3: Run full AI analysis
      const res = await fetch(`/api/bids/${bid.id}/ai-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setAiAnalysis(data.analysis);
        setShowAiAnalysis(true); // show inline in compare view
      }

      // Step 4: Switch to compare view
      setResultsView("compare");

      showToast("AI organized the comparison table");
    } catch { showToast("AI analysis failed"); }
    finally { setAiAnalyzing(false); }
  }

  async function handleAutoMergeSpecs(specKeys: string[]) {
    if (!bid || specKeys.length < 2) return;
    setAutoMerging(true);
    try {
      const res = await fetch(`/api/bids/${bid.id}/auto-merge-specs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specKeys }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.merges && Object.keys(data.merges).length > 0) {
          setMergedSpecs(prev => ({ ...prev, ...data.merges }));
          showToast(`AI merged ${Object.keys(data.merges).length} spec rows`);
        } else {
          showToast("AI found no specs to merge");
        }
      } else {
        showToast("AI merge failed");
      }
    } catch { showToast("AI merge failed"); }
    finally { setAutoMerging(false); }
  }

  async function loadData() {
    setLoading(true);
    // Load templates in background (no await needed)
    fetch("/api/bid-templates")
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => setBidFormTemplates(data.map(t => ({
        id: t.id, name: t.name, category_id: t.category_id || null,
        title: t.title, description: t.description,
        parameters: (t.parameters || []).map((p: any) => ({ name: p.name || "", options: p.options || [], is_track: !!p.is_track })),
        checklist: (t.checklist || []).map((c: any) => typeof c === "string" ? { text: c, required: true } : { text: c.text || "", required: c.required !== false }),
        bid_mode: t.bid_mode, suggested_specs: t.suggested_specs, is_default: t.is_default,
      }))))
      .catch(() => {});
    try {
      // Fetch project
      const projRes = await fetch(`/api/projects/${projectId}`);
      if (!projRes.ok) throw new Error();
      const projData = await projRes.json();
      setProjectName(projData.name);

      // Find category
      const cat = projData.categories.find((c: ProjectCategory) => c.category_id === categoryId);
      if (cat) {
        setCategory({ name: cat.name, grp: cat.grp });
        setCategoryBudget(cat.budget != null ? Number(cat.budget) : null);
      }
      // Store all project categories for "move" feature
      setProjectCategories(projData.categories.map((c: ProjectCategory) => ({ category_id: c.category_id, name: c.name })));

      // Find ALL bids for this category
      const currentBids = projData.bids.filter((b: Bid) => b.trade_category_id === categoryId);
      setBids(currentBids);
      const currentBid = currentBids[activeBidIndex] || currentBids[0] || null;
      setBid(currentBid);
      if (currentBid) {
        setEditTitle(currentBid.title);
        setEditDesc(currentBid.description);
        setEditDeadline(currentBid.deadline);
        // Auto-switch to form tab for draft bids (nothing to show in bid results yet)
        if (currentBid.status === "draft") setTab("form");

        // Fetch full bid data (includes vendor_responses), invitations, and winner
        const [bidFullRes, invRes, winnerRes] = await Promise.all([
          fetch(`/api/bids/${currentBid.id}`).then(r => r.ok ? r.json() : null),
          fetch(`/api/bids/${currentBid.id}/invite`).then(r => r.ok ? r.json() : []),
          fetch(`/api/bids/${currentBid.id}/winner`).then(r => r.ok ? r.json() : null),
        ]);
        if (winnerRes?.winner) setBidWinner(winnerRes.winner);
        else setBidWinner(null);
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
        // Load compare settings (merged specs, hidden rows)
        if (bidFullRes?.compare_settings) {
          try {
            const cs = typeof bidFullRes.compare_settings === "string" ? JSON.parse(bidFullRes.compare_settings) : bidFullRes.compare_settings;
            if (cs.mergedSpecs) setMergedSpecs(cs.mergedSpecs);
            if (cs.hiddenSpecRows) setHiddenSpecRows(new Set(cs.hiddenSpecRows));
            if (cs.hiddenColumns) setHiddenColumns(new Set(cs.hiddenColumns));
          } catch {}
        }
        if (bidFullRes?.bid_mode) {
          setBidMode(bidFullRes.bid_mode);
        }
        if (bidFullRes?.suggested_specs) {
          try {
            const ss = typeof bidFullRes.suggested_specs === "string" ? JSON.parse(bidFullRes.suggested_specs) : bidFullRes.suggested_specs;
            if (Array.isArray(ss)) setSuggestedSpecs(ss);
          } catch {}
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
        // Collect all vendors across all categories for cross-category adding
        const allVendorMap = new Map<string, Vendor>();
        for (const cat of allCats) {
          if (cat.vendors) {
            for (const v of cat.vendors) {
              if (!allVendorMap.has(v.id)) allVendorMap.set(v.id, v);
            }
          }
        }
        setAllVendors(Array.from(allVendorMap.values()));
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

  function applyBidTemplate(t: BidTemplateItem) {
    if (t.title) setEditTitle(t.title);
    if (t.description) setEditDesc(t.description);
    if (t.bid_mode) setBidMode(t.bid_mode as "structured" | "open");
    if (t.parameters?.length > 0) setEditParams(t.parameters.map(p => ({ ...p, options: [...p.options] })));
    if (t.suggested_specs?.length) setSuggestedSpecs(t.suggested_specs);
    if (t.checklist?.length) setEditChecklist(t.checklist.map(c => ({ ...c })));
    setShowTemplatePanel(false);
    setTemplatePanelSearch("");
    showToast(`Template "${t.name}" applied — review and save`);
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
          bid_mode: bidMode,
          suggested_specs: suggestedSpecs,
        }),
      });
      if (res.ok) {
        showToast("Bid updated");
        await loadData();
        // If bid is active and has invited vendors, ask whether to resend
        if (bid.status === "active" && invitations.length > 0) {
          setResendToAll(true);
          setResendSelectedIds(new Set());
          setResendMessage("");
          setShowResendDialog(true);
        }
      }
    } catch { showToast("Failed to save"); }
    finally { setSaving(false); }
  }

  async function handleResendBid() {
    if (!bid) return;
    setResendSending(true);
    try {
      const vendorIds = resendToAll
        ? invitations.filter(inv => inv.status !== "declined").map(inv => inv.vendor_id)
        : Array.from(resendSelectedIds);

      if (vendorIds.length === 0) { showToast("Select vendors"); setResendSending(false); return; }

      const res = await fetch(`/api/bids/${bid.id}/invite`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendor_ids: vendorIds, message: resendMessage || undefined }),
      });
      if (res.ok) {
        showToast(`Bid resent to ${vendorIds.length} vendor${vendorIds.length !== 1 ? "s" : ""}`);
        setShowResendDialog(false);
      }
    } catch { showToast("Failed to resend"); }
    finally { setResendSending(false); }
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

  async function handleManualSubmit() {
    if (!bid || !manualVendorName.trim()) return;
    setManualSaving(true);
    try {
      const validProposals = manualProposals.filter(p => p.name.trim() && p.price);
      const res = await fetch(`/api/bids/${bid.id}/manual-response`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor_name: manualVendorName.trim(),
          proposals: validProposals.map(p => ({
            name: p.name.trim(),
            price: parseFloat(p.price),
            specs: p.specs.filter(s => s.key.trim() && s.value.trim()),
          })),
        }),
      });
      if (res.ok) {
        showToast(`Response added for ${manualVendorName}`);
        setShowManualEntry(false);
        setManualVendorName("");
        setManualProposals([{ name: "", price: "", specs: [{ key: "", value: "" }] }]);
        setManualActiveP(0);
        await loadData();
      } else {
        const data = await res.json();
        showToast(data.error || "Failed");
      }
    } catch { showToast("Failed to save"); }
    finally { setManualSaving(false); }
  }

  async function handleAiUrlFetch() {
    if (!aiUrl.trim()) return;
    setAiUrlLoading(true);
    const urlStr = aiUrl.trim();
    const isFolder = urlStr.includes('drive.google.com/drive/folders') ||
      urlStr.includes('dropbox.com/sh') || urlStr.includes('dropbox.com/scl/fo');
    try {
      if (isFolder) {
        // Try folder API first, fall back to simple download
        let folderSuccess = false;
        try {
          const res = await fetch("/api/fetch-folder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: urlStr }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            const newFiles: File[] = [];
            if (data.type === "vendors" && data.vendors && data.vendors.length > 0) {
              for (const v of data.vendors) {
                for (const f of v.files) {
                  const bytes = Uint8Array.from(atob(f.base64), (c: string) => c.charCodeAt(0));
                  newFiles.push(new File([bytes], `[${v.vendorName}] ${f.filename}`, { type: f.contentType }));
                }
              }
            } else if (data.files && data.files.length > 0) {
              for (const f of data.files) {
                const bytes = Uint8Array.from(atob(f.base64), (c: string) => c.charCodeAt(0));
                newFiles.push(new File([bytes], f.filename, { type: f.contentType }));
              }
            }
            if (newFiles.length > 0) {
              setAiFiles(prev => [...prev, ...newFiles]);
              setAiUrl("");
              folderSuccess = true;
            }
          }
        } catch { /* folder parse failed, will fall back */ }

        // Fallback: download as single file (Dropbox serves folders as zip with dl=1)
        if (!folderSuccess) {
          const res = await fetch("/api/fetch-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: urlStr }),
          });
          const data = await res.json();
          if (res.ok && data.base64) {
            const bytes = Uint8Array.from(atob(data.base64), (c: string) => c.charCodeAt(0));
            const file = new File([bytes], data.filename, { type: data.contentType });
            setAiFiles(prev => [...prev, file]);
            setAiUrl("");
          } else {
            alert(data.error || "Failed to download");
          }
        }
      } else {
        const res = await fetch("/api/fetch-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: urlStr }),
        });
        const data = await res.json();
        if (res.ok && data.base64) {
          const bytes = Uint8Array.from(atob(data.base64), (c: string) => c.charCodeAt(0));
          const file = new File([bytes], data.filename, { type: data.contentType });
          setAiFiles(prev => [...prev, file]);
          setAiUrl("");
        } else {
          alert(data.error || "Failed to download");
        }
      }
    } catch { alert("Failed to download from URL"); }
    finally { setAiUrlLoading(false); }
  }

  async function handleAiParse() {
    if (!bid || (aiFiles.length === 0 && !aiText.trim())) return;
    setAiParsing(true);
    setAiResult(null);
    setAiResults([]);

    // If single file or text, use the existing parse-quote endpoint
    if (aiFiles.length <= 1) {
      try {
        const formData = new FormData();
        if (aiFiles[0]) formData.append("file", aiFiles[0]);
        if (aiText.trim()) formData.append("text", aiText.trim());
        const res = await fetch(`/api/bids/${bid.id}/parse-quote`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (res.ok && data.data) {
          const parsed = {
            vendor_name: data.data.vendor_name || "Unknown Vendor",
            proposals: (data.data.proposals || []).map((p: any) => ({
              name: p.name || "",
              price: String(p.price || ""),
              specs: (p.specs || []).map((s: any) => ({ key: s.key || "", value: s.value || "" })),
            })),
          };
          setAiResult(parsed);
          setAiResults([{ fileName: aiFiles[0]?.name || "Text", ...parsed }]);
          showToast("Document parsed successfully!");
        } else {
          showToast(data.error || "Failed to parse");
        }
      } catch { showToast("Parsing failed"); }
      finally { setAiParsing(false); }
      return;
    }

    // Multiple files — parse each sequentially
    const allResults: typeof aiResults = [];
    let successCount = 0;
    for (const file of aiFiles) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`/api/bids/${bid.id}/parse-quote`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (res.ok && data.data) {
          allResults.push({
            fileName: file.name,
            vendor_name: data.data.vendor_name || "Unknown Vendor",
            proposals: (data.data.proposals || []).map((p: any) => ({
              name: p.name || "",
              price: String(p.price || ""),
              specs: (p.specs || []).map((s: any) => ({ key: s.key || "", value: s.value || "" })),
            })),
          });
          successCount++;
        } else {
          allResults.push({ fileName: file.name, vendor_name: "Error", proposals: [] });
        }
      } catch {
        allResults.push({ fileName: file.name, vendor_name: "Error", proposals: [] });
      }
    }
    setAiResults(allResults);
    showToast(`Parsed ${successCount}/${aiFiles.length} files`);
    setAiParsing(false);
  }

  async function handleSelectWinner() {
    if (!bid || !winnerResp) return;
    setWinnerSaving(true);
    try {
      const proposal = winnerResp.proposals?.[winnerProposalIdx];
      const res = await fetch(`/api/bids/${bid.id}/winner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor_id: winnerResp.vendor_id || winnerResp.id,
          vendor_response_id: winnerResp.id,
          notes: winnerNotes || undefined,
          winning_proposal_name: proposal?.name || undefined,
          notify_winner: winnerNotifyWinner,
          notify_losers: winnerNotifyLosers,
          notify_clerk: winnerNotifyClerk,
          clerk_email: winnerNotifyClerk ? winnerClerkEmail : undefined,
          clerk_message: winnerNotifyClerk ? winnerClerkMsg : undefined,
        }),
      });
      if (res.ok) {
        showToast(`${winnerResp.vendor_name} selected as winner!`);
        setShowWinnerModal(false);
        setWinnerResp(null);
        setWinnerNotes("");
        setWinnerProposalIdx(0);
        await loadData();
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to select winner");
      }
    } catch { showToast("Failed"); }
    finally { setWinnerSaving(false); }
  }

  async function handleDeleteResponse(responseId: string, vendorName: string) {
    if (!bid) return;
    try {
      const res = await fetch(`/api/bids/${bid.id}/manual-response`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response_id: responseId }),
      });
      if (res.ok) {
        showToast(`Removed ${vendorName}'s response`);
        await loadData();
      }
    } catch { showToast("Failed"); }
  }

  async function handleMoveResponse(responseId: string, targetCategoryId: string) {
    if (!bid) return;
    try {
      const res = await fetch(`/api/bids/${bid.id}/move-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response_id: responseId, target_category_id: targetCategoryId, project_id: projectId }),
      });
      if (res.ok) {
        const targetCat = projectCategories.find(c => c.category_id === targetCategoryId);
        showToast(`Moved to ${targetCat?.name || "category"}`);
        setMoveResponseId(null);
        await loadData();
      } else {
        showToast("Failed to move");
      }
    } catch { showToast("Failed to move"); }
  }

  function openEditResponse(resp: any) {
    setEditResponseId(resp.id);
    setManualVendorName(resp.vendor_name);
    if (resp.proposals?.length > 0) {
      setManualProposals(resp.proposals.map((p: any) => ({
        name: p.name || "",
        price: String(p.price || ""),
        specs: p.specs?.length > 0
          ? p.specs.map((s: any) => ({ key: s.key || s.spec_key || "", value: s.value || s.spec_value || "" }))
          : [{ key: "", value: "" }],
      })));
    } else {
      setManualProposals([{ name: "", price: "", specs: [{ key: "", value: "" }] }]);
    }
    setManualActiveP(0);
    setShowManualEntry(true);
  }

  async function handleSaveEditedResponse() {
    if (!bid || !editResponseId || !manualVendorName.trim()) return;
    setManualSaving(true);
    try {
      const validProposals = manualProposals.filter(p => p.name.trim() && p.price);
      const res = await fetch(`/api/bids/${bid.id}/manual-response`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response_id: editResponseId,
          vendor_name: manualVendorName.trim(),
          proposals: validProposals.map(p => ({
            name: p.name.trim(),
            price: parseFloat(p.price),
            specs: p.specs.filter(s => s.key.trim() && s.value.trim()),
          })),
        }),
      });
      if (res.ok) {
        showToast(`Updated ${manualVendorName}'s response`);
        setShowManualEntry(false);
        setEditResponseId(null);
        setManualVendorName("");
        setManualProposals([{ name: "", price: "", specs: [{ key: "", value: "" }] }]);
        setManualActiveP(0);
        await loadData();
      } else {
        const data = await res.json();
        showToast(data.error || "Failed");
      }
    } catch { showToast("Failed to save"); }
    finally { setManualSaving(false); }
  }

  function applyAiResult(result?: { vendor_name: string; proposals: ManualProposal[] }) {
    const r = result || aiResult;
    if (!r) return;
    setEditResponseId(null);
    setManualVendorName(r.vendor_name);
    setManualProposals(r.proposals.length > 0 ? r.proposals : [{ name: "", price: "", specs: [{ key: "", value: "" }] }]);
    setManualActiveP(0);
    setShowAiParse(false);
    setShowManualEntry(true);
    setAiResult(null);
    setAiFiles([]);
    setAiText("");
  }

  async function saveAllAiResults() {
    if (!bid || aiResults.length === 0) return;
    setAiParsing(true);
    let saved = 0;
    for (const r of aiResults) {
      if (r.vendor_name === "Error" || r.proposals.length === 0) continue;
      try {
        const validProposals = r.proposals.filter(p => p.name.trim() && p.price);
        const res = await fetch(`/api/bids/${bid.id}/manual-response`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vendor_name: r.vendor_name,
            proposals: validProposals.map(p => ({
              name: p.name.trim(),
              price: parseFloat(p.price),
              specs: p.specs.filter(s => s.key.trim() && s.value.trim()),
            })),
          }),
        });
        if (res.ok) saved++;
      } catch {}
    }
    showToast(`Saved ${saved} vendor responses`);
    setShowAiParse(false);
    setAiResults([]);
    setAiFiles([]);
    setAiText("");
    setAiParsing(false);
    await loadData();
  }

  // Spec completion: collect all unique spec keys across all vendors, build gap matrix
  function openSpecRequestModal() {
    if (!responses || responses.length === 0) return;
    // Collect all unique spec keys across all responses
    const allKeys: string[] = [];
    for (const resp of responses as any[]) {
      if (resp.proposals) {
        for (const p of resp.proposals) {
          if (p.specs) {
            for (const s of p.specs) {
              const k = s.key || s.spec_key || "";
              if (k && !allKeys.includes(k)) allKeys.push(k);
            }
          }
        }
      }
    }
    setSpecRequestKeys(allKeys);
    setSpecRequestSelectedKeys(new Set(allKeys));
    setSpecRequestVendorIds(new Set(responses.map((r: any) => r.id)));
    setShowSpecRequest(true);
  }

  async function handleSendSpecRequest() {
    if (!bid || specRequestSelectedKeys.size === 0) return;
    setSpecRequestSending(true);
    try {
      const res = await fetch(`/api/bids/${bid.id}/request-specs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spec_keys: Array.from(specRequestSelectedKeys),
          vendor_response_ids: Array.from(specRequestVendorIds),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Spec request sent to ${data.sent} vendor${data.sent !== 1 ? "s" : ""}`);
        setShowSpecRequest(false);
      } else {
        showToast(data.error || "Failed to send");
      }
    } catch { showToast("Failed to send spec request"); }
    finally { setSpecRequestSending(false); }
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

  const availableSameCategory = allCategoryVendors.filter(v => !categoryVendors.find(cv => cv.id === v.id));
  const availableOtherCategory = allVendors.filter(v => !categoryVendors.find(cv => cv.id === v.id) && !allCategoryVendors.find(cv => cv.id === v.id));
  const searchLower = vendorSearch.toLowerCase();
  const filteredSame = searchLower ? availableSameCategory.filter(v => v.name.toLowerCase().includes(searchLower) || v.email.toLowerCase().includes(searchLower)) : availableSameCategory;
  const filteredOther = searchLower ? availableOtherCategory.filter(v => v.name.toLowerCase().includes(searchLower) || v.email.toLowerCase().includes(searchLower)) : availableOtherCategory;
  const availableToAdd = [...filteredSame, ...filteredOther];
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

      {/* Category Budget Bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "6px 20px",
        background: "var(--surface)", borderBottom: "1px solid var(--border)",
        fontSize: "0.76rem",
      }}>
        <span style={{ fontWeight: 700, color: "var(--ink)", fontSize: "0.72rem" }}>Budget:</span>
        {editingCatBudget ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "var(--muted)" }}>$</span>
            <input
              className="finput"
              type="number"
              value={catBudgetInput}
              onChange={e => setCatBudgetInput(e.target.value)}
              placeholder="e.g. 50000"
              style={{ width: 120, padding: "4px 8px", fontSize: "0.78rem" }}
              autoFocus
              onKeyDown={e => {
                if (e.key === "Enter") {
                  const val = catBudgetInput ? Number(catBudgetInput) : null;
                  fetch(`/api/projects/${projectId}/categories`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ category_id: categoryId, budget: val }),
                  }).then(() => {
                    setCategoryBudget(val);
                    setEditingCatBudget(false);
                    showToast(val ? "Category budget updated" : "Category budget removed");
                  });
                }
                if (e.key === "Escape") setEditingCatBudget(false);
              }}
            />
            <button className="btn btn-xs btn-gold" onClick={() => {
              const val = catBudgetInput ? Number(catBudgetInput) : null;
              fetch(`/api/projects/${projectId}/categories`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ category_id: categoryId, budget: val }),
              }).then(() => {
                setCategoryBudget(val);
                setEditingCatBudget(false);
                showToast(val ? "Category budget updated" : "Category budget removed");
              });
            }}>Save</button>
            <button className="btn btn-xs btn-outline" onClick={() => setEditingCatBudget(false)}>Cancel</button>
          </div>
        ) : categoryBudget != null && categoryBudget > 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 700, color: "var(--ink)" }}>${categoryBudget.toLocaleString()}</span>
            <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.7rem", color: "var(--muted)" }}
              onClick={() => { setCatBudgetInput(String(categoryBudget)); setEditingCatBudget(true); }}>
              Edit
            </button>
          </div>
        ) : (
          <button
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.72rem", color: "var(--gold)", fontWeight: 600 }}
            onClick={() => { setCatBudgetInput(""); setEditingCatBudget(true); }}
          >
            + Set Budget
          </button>
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
        {/* Vendor sidebar - hidden in comparison view */}
        <div style={{
          width: 240, flexShrink: 0, borderRight: "1px solid var(--border)",
          background: "var(--surface)", display: resultsView === "compare" ? "none" : "flex", flexDirection: "column",
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
          {showAddVendor && (
            <div style={{
              borderBottom: "1px solid var(--border)",
              background: "var(--bg)",
            }}>
              <div style={{ padding: "6px 8px" }}>
                <input
                  type="text"
                  value={vendorSearch}
                  onChange={e => setVendorSearch(e.target.value)}
                  placeholder="Search vendors..."
                  style={{
                    width: "100%", padding: "5px 8px", fontSize: "0.76rem",
                    border: "1px solid var(--border)", borderRadius: 5,
                    background: "var(--surface)", color: "var(--ink)", outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ maxHeight: 200, overflowY: "auto", padding: "0 4px 4px" }}>
                {filteredSame.length > 0 && (
                  <>
                    <div style={{ padding: "4px 8px", fontSize: "0.65rem", fontWeight: 700, color: "var(--gold)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      Same Category
                    </div>
                    {filteredSame.map(v => (
                      <div
                        key={v.id}
                        onClick={() => { addVendorToProject(v); setVendorSearch(""); }}
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
                  </>
                )}
                {filteredOther.length > 0 && (
                  <>
                    <div style={{ padding: "4px 8px", fontSize: "0.65rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginTop: filteredSame.length > 0 ? 6 : 0 }}>
                      Other Categories
                    </div>
                    {filteredOther.map(v => (
                      <div
                        key={v.id}
                        onClick={() => { addVendorToProject(v); setVendorSearch(""); }}
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
                  </>
                )}
                {availableToAdd.length === 0 && (
                  <div style={{ padding: "10px 8px", fontSize: "0.78rem", color: "var(--muted)", textAlign: "center" }}>
                    {vendorSearch ? "No vendors match search" : "No more vendors available"}
                  </div>
                )}
              </div>
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
                          // Ask to resend notification
                          if (confirm(`${vendor.name} resumed. Send them a notification?`)) {
                            await fetch(`/api/bids/${bid.id}/invite`, {
                              method: "POST", headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ vendor_ids: [vendor.id] }),
                            });
                            showToast(`${vendor.name} resumed & notified`);
                          } else {
                            showToast(`${vendor.name} resumed`);
                          }
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
                <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                  <Link
                    href={`/customer/create?project=${projectId}&category=${categoryId}`}
                    style={{ color: "var(--gold)", fontWeight: 700, fontSize: "0.88rem" }}
                  >
                    Create Bid Form
                  </Link>
                  <span style={{ color: "var(--border)" }}>|</span>
                  <button
                    onClick={() => setShowAiBidCreate(true)}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: "var(--gold)", fontWeight: 700, fontSize: "0.88rem",
                      display: "flex", alignItems: "center", gap: 4, padding: 0,
                    }}
                  >
                    🤖 Create from Quote (AI)
                  </button>
                  <span style={{ color: "var(--border)" }}>|</span>
                  <button
                    onClick={() => setShowPlanAnalysis(true)}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: "#7c3aed", fontWeight: 700, fontSize: "0.88rem",
                      display: "flex", alignItems: "center", gap: 4, padding: 0,
                    }}
                  >
                    📐 Analyze Plans (Pro+)
                  </button>
                </div>
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

                {/* Responses */}
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
                ) : resultsView === "list" ? (
                  /* ===== VENDOR RESPONSES LIST VIEW ===== */
                  <div>
                    {/* Header with view toggle */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{
                        fontSize: "0.72rem", fontWeight: 800, color: "var(--muted)",
                        textTransform: "uppercase", letterSpacing: "0.04em",
                      }}>
                        Vendor Responses ({responses.length})
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {responses.length >= 2 && responses.some((r: any) => r.proposals?.some((p: any) => p.specs?.length > 0)) && (
                          <button
                            onClick={openSpecRequestModal}
                            style={{
                              background: "var(--surface)", border: "1.5px solid var(--border)",
                              borderRadius: 7, padding: "5px 12px", fontSize: "0.74rem", fontWeight: 700,
                              cursor: "pointer", color: "var(--gold)", display: "flex", alignItems: "center", gap: 5,
                            }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                            Request Specs
                          </button>
                        )}
                        {responses.some((r: any) => r.proposals?.length > 0) && (
                          <button
                            onClick={() => setResultsView("compare")}
                            style={{
                              background: "var(--surface)", border: "1.5px solid var(--border)",
                              borderRadius: 7, padding: "5px 12px", fontSize: "0.74rem", fontWeight: 700,
                              cursor: "pointer", color: "var(--ink)", display: "flex", alignItems: "center", gap: 5,
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                            Compare
                          </button>
                        )}
                        {responses.length >= 1 && (
                          <button
                            onClick={handleAiAnalysis}
                            disabled={aiAnalyzing}
                            style={{
                              background: aiAnalyzing ? "var(--surface)" : "#1a1a1a",
                              border: "none", borderRadius: 7, padding: "5px 12px",
                              fontSize: "0.74rem", fontWeight: 700,
                              cursor: aiAnalyzing ? "wait" : "pointer",
                              color: aiAnalyzing ? "var(--muted)" : "var(--gold)",
                              display: "flex", alignItems: "center", gap: 5,
                            }}
                          >
                            {aiAnalyzing ? (
                              <>
                                <span style={{ display: "inline-block", width: 13, height: 13, borderRadius: "50%", border: "2px solid var(--gold-b)", borderTopColor: "var(--gold)", animation: "spin 0.8s linear infinite" }} />
                                Analyzing...
                              </>
                            ) : (
                              <>🤖 AI Analysis</>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Winner banner */}
                    {bidWinner && (
                      <div style={{
                        background: "var(--gold-bg)", border: "2px solid var(--gold)",
                        borderRadius: 10, padding: "12px 16px", marginBottom: 12,
                        display: "flex", alignItems: "center", gap: 10,
                      }}>
                        <span style={{ fontSize: "1.2rem" }}>&#127942;</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, fontSize: "0.84rem", color: "var(--ink)" }}>
                            Winner: {bidWinner.vendor_name}
                          </div>
                          {bidWinner.winning_combination && (
                            <div style={{ fontSize: "0.74rem", color: "var(--gold)", fontWeight: 600 }}>
                              {bidWinner.winning_combination}
                            </div>
                          )}
                        </div>
                        <span className="tag tag-active" style={{ fontSize: "0.68rem" }}>Awarded</span>
                        <button
                          onClick={async () => {
                            if (!confirm("Cancel winner selection? The bid will return to active status.")) return;
                            try {
                              const res = await fetch(`/api/bids/${bid.id}/winner`, { method: "DELETE" });
                              if (res.ok) {
                                setBidWinner(null);
                                setBid({ ...bid, status: "active" });
                                showToast("Winner cancelled — bid is active again");
                              } else {
                                showToast("Failed to cancel winner");
                              }
                            } catch { showToast("Failed to cancel winner"); }
                          }}
                          style={{
                            background: "none", border: "1px solid var(--border)", borderRadius: 6,
                            padding: "4px 10px", fontSize: "0.7rem", fontWeight: 600,
                            color: "var(--muted)", cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {/* Vendor response cards */}
                    {responses.map((resp: any) => {
                      const isWinner = bidWinner?.vendor_id === (resp.vendor_id || resp.id);
                      const proposals = resp.proposals || [];
                      const priceRange = proposals.length > 0
                        ? proposals.map((p: any) => Number(p.price)).sort((a: number, b: number) => a - b)
                        : [resp.base_price].filter(Boolean);
                      const lowestPrice = priceRange[0];
                      const highestPrice = priceRange[priceRange.length - 1];

                      return (
                        <div key={resp.id} style={{
                          background: isWinner ? "var(--gold-bg)" : "var(--card)",
                          border: isWinner ? "2px solid var(--gold)" : "1.5px solid var(--border)",
                          borderRadius: 10, padding: "14px 16px", marginBottom: 8,
                          transition: "all 0.15s",
                        }}>
                          {/* Top row: avatar + name + price + actions */}
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{
                              width: 36, height: 36, borderRadius: "50%",
                              background: isWinner ? "var(--gold)" : "var(--gold-bg)",
                              border: `2px solid ${isWinner ? "var(--gold)" : "var(--gold-b)"}`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontWeight: 800, fontSize: "0.72rem",
                              color: isWinner ? "#fff" : "var(--gold)", flexShrink: 0,
                            }}>
                              {resp.vendor_name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--ink)" }}>
                                  {resp.vendor_name}
                                </span>
                                {isWinner && (
                                  <span style={{
                                    background: "var(--gold)", color: "#fff", fontSize: "0.62rem",
                                    fontWeight: 800, padding: "2px 8px", borderRadius: 4,
                                  }}>WINNER</span>
                                )}
                              </div>
                              <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 1 }}>
                                {new Date(resp.submitted_at).toLocaleDateString()} &middot; {proposals.length || 1} option{proposals.length !== 1 ? "s" : ""}
                              </div>
                            </div>
                            {/* Price */}
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              {lowestPrice != null && (
                                <>
                                  <div style={{
                                    fontWeight: 800, fontSize: "1rem", color: "var(--gold)",
                                    fontFamily: "'Bricolage Grotesque', sans-serif",
                                  }}>
                                    ${lowestPrice.toLocaleString()}
                                    {highestPrice && highestPrice !== lowestPrice && (
                                      <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--muted)" }}>
                                        {" "}&ndash; ${highestPrice.toLocaleString()}
                                      </span>
                                    )}
                                  </div>
                                  {categoryBudget != null && categoryBudget > 0 && (
                                    <div style={{
                                      fontSize: "0.66rem", fontWeight: 700, marginTop: 2,
                                      color: lowestPrice <= categoryBudget ? "#16a34a" : "#dc2626",
                                    }}>
                                      {lowestPrice <= categoryBudget
                                        ? `↓ $${(categoryBudget - lowestPrice).toLocaleString()} under budget`
                                        : `↑ $${(lowestPrice - categoryBudget).toLocaleString()} over budget`}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>

                          {/* Proposals summary (if open proposal with multiple options) */}
                          {proposals.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                              {proposals.map((p: any, pi: number) => (
                                <div key={pi} style={{
                                  background: "var(--surface)", border: "1px solid var(--border)",
                                  borderRadius: 6, padding: "6px 10px", fontSize: "0.76rem",
                                }}>
                                  <span style={{ fontWeight: 600, color: "var(--ink)" }}>{p.name || `Option ${pi + 1}`}</span>
                                  <span style={{ color: "var(--gold)", fontWeight: 700, marginLeft: 6 }}>
                                    ${Number(p.price).toLocaleString()}
                                  </span>
                                  {categoryBudget != null && categoryBudget > 0 && (
                                    <span style={{
                                      marginLeft: 6, fontSize: "0.68rem", fontWeight: 700,
                                      color: Number(p.price) <= categoryBudget ? "#16a34a" : "#dc2626",
                                    }}>
                                      {Number(p.price) <= categoryBudget
                                        ? `↓$${(categoryBudget - Number(p.price)).toLocaleString()}`
                                        : `↑$${(Number(p.price) - categoryBudget).toLocaleString()}`}
                                    </span>
                                  )}
                                  {p.specs?.length > 0 && (
                                    <span style={{ color: "var(--muted)", marginLeft: 4 }}>
                                      ({p.specs.length} specs)
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Action buttons */}
                          <div style={{ display: "flex", gap: 6, marginTop: 10, justifyContent: "flex-end", flexWrap: "wrap", alignItems: "center" }}>
                            <button
                              onClick={() => openEditResponse(resp)}
                              style={{
                                background: "none", border: "1px solid var(--border)", borderRadius: 6,
                                padding: "4px 12px", fontSize: "0.72rem", fontWeight: 600,
                                color: "var(--ink)", cursor: "pointer",
                              }}
                            >
                              Edit
                            </button>
                            {/* Move to category */}
                            <div style={{ position: "relative" }}>
                              <button
                                onClick={() => setMoveResponseId(moveResponseId === resp.id ? null : resp.id)}
                                style={{
                                  background: "none", border: "1px solid var(--border)", borderRadius: 6,
                                  padding: "4px 12px", fontSize: "0.72rem", fontWeight: 600,
                                  color: "var(--muted)", cursor: "pointer",
                                }}
                              >
                                Move
                              </button>
                              {moveResponseId === resp.id && (
                                <div style={{
                                  position: "absolute", top: "100%", right: 0, marginTop: 4,
                                  background: "#fff", border: "1.5px solid var(--border)", borderRadius: 8,
                                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 50, minWidth: 200,
                                  maxHeight: 240, overflowY: "auto",
                                }}>
                                  <div style={{ padding: "8px 12px", fontSize: "0.68rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>
                                    Move to category
                                  </div>
                                  {projectCategories.filter(c => c.category_id !== categoryId).map(c => (
                                    <button
                                      key={c.category_id}
                                      onClick={() => handleMoveResponse(resp.id, c.category_id)}
                                      style={{
                                        display: "block", width: "100%", textAlign: "left",
                                        padding: "8px 12px", fontSize: "0.78rem", fontWeight: 600,
                                        color: "var(--ink)", background: "none", border: "none",
                                        cursor: "pointer", borderBottom: "1px solid var(--border)",
                                      }}
                                      onMouseOver={e => { e.currentTarget.style.background = "var(--gold-bg)"; }}
                                      onMouseOut={e => { e.currentTarget.style.background = "none"; }}
                                    >
                                      {c.name}
                                    </button>
                                  ))}
                                  {projectCategories.filter(c => c.category_id !== categoryId).length === 0 && (
                                    <div style={{ padding: "8px 12px", fontSize: "0.76rem", color: "var(--muted)" }}>No other categories</div>
                                  )}
                                </div>
                              )}
                            </div>
                            {!bidWinner && bid.status !== "awarded" && (
                              <button
                                onClick={() => {
                                  setWinnerResp(resp);
                                  setWinnerProposalIdx(0);
                                  setWinnerNotes("");
                                  setShowWinnerModal(true);
                                }}
                                style={{
                                  background: "var(--gold)", border: "none", borderRadius: 6,
                                  padding: "4px 14px", fontSize: "0.72rem", fontWeight: 700,
                                  color: "#fff", cursor: "pointer",
                                }}
                              >
                                Select Winner
                              </button>
                            )}
                            <button
                              onClick={() => { if (confirm(`Remove ${resp.vendor_name}'s response?`)) handleDeleteResponse(resp.id, resp.vendor_name); }}
                              style={{
                                background: "none", border: "1px solid var(--border)", borderRadius: 6,
                                padding: "4px 10px", fontSize: "0.72rem", fontWeight: 600,
                                color: "var(--muted)", cursor: "pointer",
                              }}
                            >
                              &#10005;
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Vendors who haven't responded */}
                    {(() => {
                      const respondedVendorIds = new Set(responses.map((r: any) => r.vendor_id));
                      const nonResponding = invitations.filter(inv => inv.status === "sent" && !respondedVendorIds.has(inv.vendor_id));
                      if (nonResponding.length === 0) return null;
                      return (
                        <div style={{ marginTop: 16 }}>
                          <div style={{
                            fontSize: "0.72rem", fontWeight: 800, color: "var(--muted)",
                            textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8,
                          }}>
                            Awaiting Response ({nonResponding.length})
                          </div>
                          {nonResponding.map(inv => (
                            <div key={inv.id} style={{
                              display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                              background: "var(--bg)", border: "1px dashed var(--border)",
                              borderRadius: 8, marginBottom: 6,
                            }}>
                              <div style={{
                                width: 32, height: 32, borderRadius: "50%", background: "var(--bg)",
                                border: "2px solid var(--border)", display: "flex", alignItems: "center",
                                justifyContent: "center", fontWeight: 800, fontSize: "0.68rem",
                                color: "var(--muted)", flexShrink: 0,
                              }}>
                                {(inv.vendor_name || "?").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: "0.82rem", color: "var(--muted)" }}>
                                  {inv.vendor_name || "Unknown Vendor"}
                                </div>
                                <div style={{ fontSize: "0.7rem", color: "var(--faint)" }}>
                                  {inv.vendor_email || ""} &middot; Sent {new Date(inv.sent_at).toLocaleDateString()}
                                </div>
                              </div>
                              {inv.token && (
                                <button
                                  onClick={() => {
                                    const url = `${window.location.origin}/vendor-submit/${inv.token}`;
                                    navigator.clipboard.writeText(url);
                                    showToast("Link copied");
                                  }}
                                  style={{
                                    background: "none", border: "1px solid var(--border)", borderRadius: 6,
                                    padding: "4px 10px", fontSize: "0.7rem", fontWeight: 600,
                                    color: "var(--muted)", cursor: "pointer",
                                  }}
                                  title="Copy vendor submit link"
                                >
                                  Copy Link
                                </button>
                              )}
                              <button
                                onClick={async () => {
                                  try {
                                    await fetch(`/api/bids/${bid.id}/invite`, {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ vendor_ids: [inv.vendor_id] }),
                                    });
                                    showToast(`Reminder sent to ${inv.vendor_name || "vendor"}`);
                                  } catch { showToast("Failed to send reminder"); }
                                }}
                                style={{
                                  background: "var(--gold-bg)", border: "1px solid var(--gold-b)", borderRadius: 6,
                                  padding: "4px 10px", fontSize: "0.7rem", fontWeight: 700,
                                  color: "var(--gold)", cursor: "pointer",
                                }}
                              >
                                Send Reminder
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                ) : resultsView === "compare" && responses.some((r: any) => r.proposals?.length > 0) ? (
                  /* ===== OPEN PROPOSAL COMPARISON TABLE ===== */
                  (() => {
                    // Back to list button
                    const backBtn = (
                      <button
                        onClick={() => setResultsView("list")}
                        style={{
                          background: "none", border: "1px solid var(--border)", borderRadius: 7,
                          padding: "5px 12px", fontSize: "0.74rem", fontWeight: 700,
                          cursor: "pointer", color: "var(--ink)", display: "flex", alignItems: "center", gap: 5,
                        }}
                      >
                        &#8592; Back to Vendors
                      </button>
                    );

                    // Collect all proposals from all responses
                    const allColumns: { key: string; vendorName: string; proposalName: string; price: number; specs: Record<string, string> }[] = [];
                    const allSpecKeys: string[] = [];

                    for (const resp of responses as any[]) {
                      if (resp.proposals && resp.proposals.length > 0) {
                        for (const prop of resp.proposals) {
                          const specMap: Record<string, string> = {};
                          if (prop.specs) {
                            for (const s of prop.specs) {
                              specMap[s.key] = s.value;
                              if (!allSpecKeys.includes(s.key)) allSpecKeys.push(s.key);
                            }
                          }
                          allColumns.push({
                            key: `${resp.vendor_name}::${prop.name}`,
                            vendorName: resp.vendor_name,
                            proposalName: prop.name,
                            price: Number(prop.price),
                            specs: specMap,
                          });
                        }
                      }
                    }

                    // Apply merged specs: resolve canonical keys
                    // Build display spec keys: remove aliases, keep only canonical keys
                    const canonicalSpecKeys: string[] = [];
                    const aliasMap: Record<string, string[]> = {}; // canonical -> [alias1, alias2, ...]
                    for (const key of allSpecKeys) {
                      const canonical = mergedSpecs[key] || key;
                      if (!canonicalSpecKeys.includes(canonical)) canonicalSpecKeys.push(canonical);
                      if (!aliasMap[canonical]) aliasMap[canonical] = [];
                      if (key !== canonical) aliasMap[canonical].push(key);
                    }

                    // Filter visible columns
                    const visibleColumns = allColumns.filter(c => !hiddenColumns.has(c.key));
                    const minPrice = visibleColumns.length > 0 ? Math.min(...visibleColumns.map(c => c.price)) : 0;

                    // Group by vendor for the filter panel
                    const vendorGroups: Record<string, typeof allColumns> = {};
                    for (const col of allColumns) {
                      if (!vendorGroups[col.vendorName]) vendorGroups[col.vendorName] = [];
                      vendorGroups[col.vendorName].push(col);
                    }

                    return (
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                          {backBtn}
                          <div style={{ flex: 1 }} />
                          <button
                            onClick={handleAiAnalysis}
                            disabled={aiAnalyzing}
                            style={{
                              display: "flex", alignItems: "center", gap: 5,
                              background: aiAnalyzing ? "var(--surface)" : "#1a1a1a",
                              color: aiAnalyzing ? "var(--muted)" : "var(--gold)",
                              border: "none", borderRadius: 7, padding: "6px 14px",
                              fontSize: "0.76rem", fontWeight: 700, cursor: aiAnalyzing ? "wait" : "pointer",
                            }}
                          >
                            {aiAnalyzing ? (
                              <>
                                <span style={{ display: "inline-block", width: 13, height: 13, borderRadius: "50%", border: "2px solid var(--gold-b)", borderTopColor: "var(--gold)", animation: "spin 0.8s linear infinite" }} />
                                Analyzing...
                              </>
                            ) : (
                              <>🤖 AI Organize &amp; Analyze</>
                            )}
                          </button>
                          {aiAnalysis && (
                            <button
                              onClick={() => setShowAiAnalysis(!showAiAnalysis)}
                              style={{
                                display: "flex", alignItems: "center", gap: 4,
                                background: showAiAnalysis ? "var(--gold)" : "var(--gold-bg)",
                                color: showAiAnalysis ? "#fff" : "var(--gold)",
                                border: "1.5px solid var(--gold-b)", borderRadius: 7, padding: "5px 12px",
                                fontSize: "0.72rem", fontWeight: 700, cursor: "pointer",
                              }}
                            >
                              📊 {showAiAnalysis ? "Hide" : "Show"} Analysis
                            </button>
                          )}
                        </div>

                        {/* Inline AI Analysis Panel */}
                        {showAiAnalysis && aiAnalysis && (
                          <div style={{
                            background: "var(--surface)", border: "1.5px solid var(--gold-b)", borderRadius: 10,
                            padding: "16px", marginBottom: 12, fontSize: "0.82rem", lineHeight: 1.5,
                          }}>
                            {/* Summary */}
                            {aiAnalysis.summary && (
                              <div style={{ background: "var(--gold-bg)", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
                                <span style={{ fontWeight: 800, color: "var(--gold)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Summary: </span>
                                <span style={{ color: "var(--ink)" }}>{aiAnalysis.summary}</span>
                              </div>
                            )}

                            {/* Price + Recommendation side by side */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                              {aiAnalysis.price_comparison && (
                                <div style={{ padding: "10px 12px", background: "var(--bg)", borderRadius: 8, border: "1px solid var(--border)" }}>
                                  <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", marginBottom: 6 }}>Price</div>
                                  <div style={{ fontSize: "0.78rem" }}>
                                    <span style={{ color: "#16a34a", fontWeight: 700 }}>{aiAnalysis.price_comparison.cheapest}</span>
                                    <span style={{ color: "var(--muted)" }}> cheapest</span>
                                  </div>
                                  {aiAnalysis.price_comparison.price_range && (
                                    <div style={{ fontSize: "0.74rem", color: "var(--muted)", marginTop: 4 }}>{aiAnalysis.price_comparison.price_range}</div>
                                  )}
                                </div>
                              )}
                              {aiAnalysis.recommendation && (
                                <div style={{ padding: "10px 12px", background: "var(--gold-bg)", borderRadius: 8, border: "1px solid var(--gold-b)" }}>
                                  <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "var(--gold)", textTransform: "uppercase", marginBottom: 6 }}>Recommendation</div>
                                  <div style={{ fontSize: "0.78rem", color: "var(--ink)" }}>{aiAnalysis.recommendation}</div>
                                </div>
                              )}
                            </div>

                            {/* Per vendor: concerns + missing + questions in compact cards */}
                            {aiAnalysis.vendor_analyses && aiAnalysis.vendor_analyses.length > 0 && (
                              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(aiAnalysis.vendor_analyses.length, 3)}, 1fr)`, gap: 8, marginBottom: 12 }}>
                                {aiAnalysis.vendor_analyses.map((va: any, vi: number) => (
                                  <div key={vi} style={{ padding: "10px 12px", background: "var(--bg)", borderRadius: 8, border: "1px solid var(--border)" }}>
                                    <div style={{ fontWeight: 800, fontSize: "0.8rem", color: "var(--ink)", marginBottom: 6, borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>{va.vendor_name}</div>
                                    {va.concerns?.length > 0 && (
                                      <div style={{ marginBottom: 6 }}>
                                        {va.concerns.map((c: string, ci: number) => (
                                          <div key={ci} style={{ fontSize: "0.74rem", color: "#dc2626", marginBottom: 2, display: "flex", gap: 4 }}>
                                            <span style={{ flexShrink: 0 }}>⚠</span> {c}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {va.missing_info?.length > 0 && (
                                      <div style={{ marginBottom: 6 }}>
                                        {va.missing_info.map((m: string, mi: number) => (
                                          <div key={mi} style={{ fontSize: "0.74rem", color: "#d97706", marginBottom: 2, display: "flex", gap: 4 }}>
                                            <span style={{ flexShrink: 0 }}>?</span> {m}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {va.questions_to_ask?.length > 0 && (
                                      <div style={{ background: "#fffbf0", borderRadius: 6, padding: "6px 8px", marginTop: 4 }}>
                                        <div style={{ fontSize: "0.66rem", fontWeight: 700, color: "#92400e", marginBottom: 3 }}>QUESTIONS</div>
                                        {va.questions_to_ask.map((q: string, qi: number) => (
                                          <div key={qi} style={{ fontSize: "0.72rem", color: "#78350f", marginBottom: 2 }}>
                                            {qi + 1}. {q}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Risk flags */}
                            {aiAnalysis.risk_flags?.length > 0 && (
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {aiAnalysis.risk_flags.map((r: string, ri: number) => (
                                  <div key={ri} style={{ fontSize: "0.72rem", color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "4px 10px" }}>
                                    ⚠ {r}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Header row with title + filter toggle */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                          <div style={{
                            fontSize: "0.72rem", fontWeight: 800, color: "var(--muted)",
                            textTransform: "uppercase", letterSpacing: "0.04em",
                          }}>
                            Comparison Table — {visibleColumns.length}/{allColumns.length} options from {responses.length} vendors
                          </div>
                          <button
                            onClick={() => setShowColFilter(!showColFilter)}
                            style={{
                              background: showColFilter ? "var(--gold)" : "var(--surface)",
                              color: showColFilter ? "#fff" : "var(--ink)",
                              border: "1.5px solid " + (showColFilter ? "var(--gold)" : "var(--border)"),
                              borderRadius: 7, padding: "5px 12px", fontSize: "0.74rem", fontWeight: 700,
                              cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
                              transition: "all 0.15s",
                            }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></svg>
                            Filter
                            {hiddenColumns.size > 0 && (
                              <span style={{
                                background: showColFilter ? "rgba(255,255,255,0.3)" : "var(--gold)",
                                color: showColFilter ? "#fff" : "#fff",
                                borderRadius: 10, padding: "1px 6px", fontSize: "0.66rem", fontWeight: 800,
                              }}>
                                {hiddenColumns.size}
                              </span>
                            )}
                          </button>
                        </div>

                        {/* Filter panel */}
                        {showColFilter && (
                          <div style={{
                            background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 10,
                            padding: "14px 16px", marginBottom: 12,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                              <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--ink)" }}>
                                Select proposals to compare
                              </span>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button
                                  onClick={() => setHiddenColumns(new Set())}
                                  style={{
                                    background: "none", border: "1px solid var(--border)", borderRadius: 5,
                                    padding: "3px 10px", fontSize: "0.68rem", fontWeight: 600,
                                    color: "var(--muted)", cursor: "pointer",
                                  }}
                                >
                                  Show All
                                </button>
                                <button
                                  onClick={() => setHiddenColumns(new Set(allColumns.map(c => c.key)))}
                                  style={{
                                    background: "none", border: "1px solid var(--border)", borderRadius: 5,
                                    padding: "3px 10px", fontSize: "0.68rem", fontWeight: 600,
                                    color: "var(--muted)", cursor: "pointer",
                                  }}
                                >
                                  Hide All
                                </button>
                              </div>
                            </div>
                            {Object.entries(vendorGroups).map(([vendor, cols]) => (
                              <div key={vendor} style={{ marginBottom: 8 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                  <label style={{
                                    display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                                    fontSize: "0.76rem", fontWeight: 700, color: "var(--ink)",
                                  }}>
                                    <input
                                      type="checkbox"
                                      checked={cols.every(c => !hiddenColumns.has(c.key))}
                                      ref={el => {
                                        if (el) el.indeterminate = cols.some(c => hiddenColumns.has(c.key)) && cols.some(c => !hiddenColumns.has(c.key));
                                      }}
                                      onChange={() => {
                                        const allVisible = cols.every(c => !hiddenColumns.has(c.key));
                                        setHiddenColumns(prev => {
                                          const next = new Set(prev);
                                          cols.forEach(c => allVisible ? next.add(c.key) : next.delete(c.key));
                                          return next;
                                        });
                                      }}
                                      style={{ accentColor: "var(--gold)", width: 15, height: 15 }}
                                    />
                                    {vendor}
                                  </label>
                                  <span style={{ fontSize: "0.66rem", color: "var(--muted)" }}>
                                    ({cols.filter(c => !hiddenColumns.has(c.key)).length}/{cols.length})
                                  </span>
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingLeft: 23 }}>
                                  {cols.map(col => {
                                    const visible = !hiddenColumns.has(col.key);
                                    return (
                                      <label
                                        key={col.key}
                                        style={{
                                          display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
                                          background: visible ? "var(--gold-bg)" : "var(--card)",
                                          border: "1px solid " + (visible ? "var(--gold-b)" : "var(--border)"),
                                          borderRadius: 6, padding: "4px 10px",
                                          fontSize: "0.72rem", fontWeight: 600,
                                          color: visible ? "var(--gold)" : "var(--muted)",
                                          transition: "all 0.15s",
                                        }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={visible}
                                          onChange={() => {
                                            setHiddenColumns(prev => {
                                              const next = new Set(prev);
                                              visible ? next.add(col.key) : next.delete(col.key);
                                              return next;
                                            });
                                          }}
                                          style={{ accentColor: "var(--gold)", width: 13, height: 13 }}
                                        />
                                        {col.proposalName || "Option"} — ${col.price.toLocaleString()}
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Merge controls */}
                        {mergeSource && (
                          <div style={{
                            background: "var(--gold-bg)", border: "1.5px solid var(--gold-b)", borderRadius: 8,
                            padding: "8px 14px", marginBottom: 10, display: "flex", alignItems: "center", gap: 10,
                            fontSize: "0.78rem",
                          }}>
                            <span style={{ fontWeight: 700, color: "var(--gold)" }}>Merging:</span>
                            <span style={{ fontWeight: 600, color: "var(--ink)" }}>&quot;{mergeSource}&quot;</span>
                            <span style={{ color: "var(--muted)" }}>— click the target row to merge into</span>
                            <button
                              onClick={() => setMergeSource(null)}
                              style={{ marginLeft: "auto", background: "none", border: "1px solid var(--border)", borderRadius: 5, padding: "2px 10px", fontSize: "0.72rem", cursor: "pointer", color: "var(--muted)" }}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                        {/* AI Auto-merge + manual merge stats */}
                        {!mergeSource && (
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                            {canonicalSpecKeys.length >= 2 && (
                              <button
                                onClick={() => handleAutoMergeSpecs(allSpecKeys)}
                                disabled={autoMerging}
                                style={{
                                  display: "flex", alignItems: "center", gap: 5,
                                  background: autoMerging ? "var(--surface)" : "#1a1a1a",
                                  color: autoMerging ? "var(--muted)" : "var(--gold)",
                                  border: "none", borderRadius: 7, padding: "5px 12px",
                                  fontSize: "0.72rem", fontWeight: 700, cursor: autoMerging ? "wait" : "pointer",
                                }}
                              >
                                {autoMerging ? (
                                  <>
                                    <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", border: "2px solid var(--gold-b)", borderTopColor: "var(--gold)", animation: "spin 0.8s linear infinite" }} />
                                    Analyzing...
                                  </>
                                ) : (
                                  <>🤖 Auto-merge (AI)</>
                                )}
                              </button>
                            )}
                            {Object.keys(mergedSpecs).length > 0 && (
                              <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                                {Object.keys(mergedSpecs).length} merged
                              </span>
                            )}
                            {hiddenSpecRows.size > 0 && (
                              <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                                {hiddenSpecRows.size} hidden
                              </span>
                            )}
                            {Object.keys(mergedSpecs).length > 0 && (
                              <button
                                onClick={() => setMergedSpecs({})}
                                style={{ fontSize: "0.7rem", color: "var(--gold)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                              >
                                Undo all merges
                              </button>
                            )}
                            {hiddenSpecRows.size > 0 && (
                              <button
                                onClick={() => setHiddenSpecRows(new Set())}
                                style={{ fontSize: "0.7rem", color: "var(--gold)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                              >
                                Show all rows
                              </button>
                            )}

                            {/* Request Missing Info button */}
                            {(() => {
                              // Count missing cells per vendor
                              const missingPerVendor: Record<string, string[]> = {};
                              for (const col of visibleColumns) {
                                const vendorKey = col.vendorName;
                                if (!missingPerVendor[vendorKey]) missingPerVendor[vendorKey] = [];
                                for (const specKey of canonicalSpecKeys.filter(k => !hiddenSpecRows.has(k))) {
                                  const specAliases = aliasMap[specKey] || [];
                                  const allKeysForRow = [specKey, ...specAliases];
                                  const vals = allKeysForRow.map(k => col.specs[k]).filter(Boolean);
                                  if (vals.length === 0) {
                                    missingPerVendor[vendorKey].push(specKey);
                                  }
                                }
                              }
                              const totalMissing = Object.values(missingPerVendor).reduce((sum, arr) => sum + arr.length, 0);
                              if (totalMissing === 0) return null;
                              return (
                                <button
                                  onClick={() => {
                                    // Pre-fill spec request with missing specs
                                    const allMissingKeys = [...new Set(Object.values(missingPerVendor).flat())];
                                    setSpecRequestKeys(allMissingKeys);
                                    setSpecRequestSelectedKeys(new Set(allMissingKeys));
                                    // Select only vendors that have missing data
                                    const vendorsWithMissing = new Set<string>();
                                    for (const resp of responses as any[]) {
                                      if (missingPerVendor[resp.vendor_name]?.length > 0) {
                                        vendorsWithMissing.add(resp.id);
                                      }
                                    }
                                    setSpecRequestVendorIds(vendorsWithMissing);
                                    setShowSpecRequest(true);
                                  }}
                                  style={{
                                    display: "flex", alignItems: "center", gap: 5,
                                    background: "#fef2f2", color: "#dc2626",
                                    border: "1.5px solid #fecaca", borderRadius: 7, padding: "5px 12px",
                                    fontSize: "0.72rem", fontWeight: 700, cursor: "pointer",
                                  }}
                                >
                                  <span>📋</span> Request Missing Info ({totalMissing} cells)
                                </button>
                              );
                            })()}
                          </div>
                        )}

                        {/* Table */}
                        {visibleColumns.length === 0 ? (
                          <div style={{
                            textAlign: "center", padding: "28px 20px", color: "var(--muted)",
                            background: "var(--surface)", borderRadius: 10, border: "1.5px solid var(--border)",
                            fontSize: "0.82rem",
                          }}>
                            No proposals selected. Use the filter above to choose which proposals to compare.
                          </div>
                        ) : (
                        <div style={{ overflowX: "auto", borderRadius: 10, border: "1.5px solid var(--border)" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: visibleColumns.length * 160 + 140, fontSize: "0.8rem" }}>
                            <thead>
                              <tr>
                                <th style={{
                                  position: "sticky", left: 0, background: "var(--surface)", zIndex: 2,
                                  padding: "10px 14px", textAlign: "left", borderBottom: "2px solid var(--border)",
                                  fontSize: "0.72rem", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase",
                                  minWidth: 130,
                                }}>
                                  Spec
                                  <div style={{ fontSize: "0.58rem", fontWeight: 500, color: "var(--muted)", textTransform: "none", marginTop: 2 }}>
                                    Click a row to merge similar specs
                                  </div>
                                </th>
                                {visibleColumns.map((col, ci) => (
                                  <th key={ci} style={{
                                    padding: "10px 14px", textAlign: "center",
                                    borderBottom: "2px solid var(--border)",
                                    borderLeft: "1px solid var(--border)",
                                    background: col.price === minPrice ? "var(--gold-bg)" : "var(--surface)",
                                    minWidth: 140,
                                  }}>
                                    <div style={{ fontWeight: 800, fontSize: "0.78rem", color: "var(--ink)", marginBottom: 2 }}>
                                      {col.vendorName}
                                    </div>
                                    <div style={{
                                      fontSize: "0.7rem", color: "var(--gold)", fontWeight: 600,
                                      maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                    }}>
                                      {col.proposalName}
                                    </div>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {canonicalSpecKeys.filter(k => !hiddenSpecRows.has(k)).map((specKey, si) => {
                                const aliases = aliasMap[specKey] || [];
                                const isMergeCandidate = mergeSource !== null && mergeSource !== specKey;
                                const isMergeSelected = mergeSource === specKey;
                                return (
                                <tr key={si}>
                                  <td style={{
                                    position: "sticky", left: 0, background: isMergeSelected ? "var(--gold-bg)" : "var(--card)", zIndex: 1,
                                    padding: "6px 8px", fontWeight: 700, fontSize: "0.76rem",
                                    color: "var(--ink)", borderBottom: "1px solid var(--border)",
                                  }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                      {/* Merge click area */}
                                      <div
                                        style={{ flex: 1, cursor: "pointer", minWidth: 0 }}
                                        onClick={() => {
                                          if (mergeSource === null) {
                                            setMergeSource(specKey);
                                          } else if (mergeSource === specKey) {
                                            setMergeSource(null);
                                          } else {
                                            if (!confirm(`Merge "${mergeSource}" into "${specKey}"?`)) {
                                              setMergeSource(null);
                                              return;
                                            }
                                            setMergedSpecs(prev => {
                                              const next = { ...prev };
                                              const srcAliases = aliasMap[mergeSource!] || [];
                                              next[mergeSource!] = specKey;
                                              for (const a of srcAliases) next[a] = specKey;
                                              return next;
                                            });
                                            setMergeSource(null);
                                          }
                                        }}
                                      >
                                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                          {isMergeSelected ? (
                                            <span style={{ fontSize: "0.68rem", color: "var(--gold)", fontWeight: 800 }}>&#10003;</span>
                                          ) : isMergeCandidate ? (
                                            <span style={{ fontSize: "0.68rem", color: "var(--gold)", fontWeight: 800 }}>&#8594;</span>
                                          ) : null}
                                          <span>{specKey}</span>
                                          {aliases.length > 0 && (
                                            <span style={{ fontSize: "0.62rem", color: "var(--muted)", fontWeight: 500 }}>
                                              (+{aliases.length})
                                            </span>
                                          )}
                                        </div>
                                        {aliases.length > 0 && (
                                          <div style={{ fontSize: "0.62rem", color: "var(--muted)", fontWeight: 500, marginTop: 1 }}>
                                            = {aliases.join(", ")}
                                          </div>
                                        )}
                                      </div>
                                      {/* Action buttons */}
                                      <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                                        {aliases.length > 0 && (
                                          <button
                                            title="Unmerge"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setMergedSpecs(prev => {
                                                const next = { ...prev };
                                                for (const a of aliases) delete next[a];
                                                return next;
                                              });
                                            }}
                                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.64rem", color: "var(--gold)", padding: "2px 4px", fontWeight: 700 }}
                                          >
                                            ↩
                                          </button>
                                        )}
                                        <button
                                          title="Hide row"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setHiddenSpecRows(prev => new Set([...prev, specKey]));
                                          }}
                                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.64rem", color: "var(--muted)", padding: "2px 4px" }}
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    </div>
                                  </td>
                                  {visibleColumns.map((col, ci) => {
                                    // Collect all values from canonical + aliases
                                    const allKeysForRow = [specKey, ...aliases];
                                    const vals = allKeysForRow.map(k => col.specs[k]).filter(Boolean);
                                    // Deduplicate
                                    const uniqueVals = [...new Set(vals)];
                                    const displayVal = uniqueVals.length > 0 ? uniqueVals : [];
                                    const primaryVal = displayVal[0] || "";
                                    // For highlight comparison: use primary value
                                    const allPrimary = visibleColumns.map(c => {
                                      const cv = allKeysForRow.map(k => c.specs[k]).filter(Boolean);
                                      return [...new Set(cv)][0] || "";
                                    });
                                    const isUnique = primaryVal && new Set(allPrimary.filter(Boolean)).size > 1;
                                    return (
                                      <td key={ci} style={{
                                        padding: "6px 10px", textAlign: "center",
                                        borderBottom: "1px solid var(--border)",
                                        borderLeft: "1px solid var(--border)",
                                        color: primaryVal ? (isUnique ? "var(--ink)" : "var(--ink2)") : "#dc2626",
                                        fontWeight: isUnique ? 600 : 400,
                                        fontSize: "0.8rem",
                                        background: isMergeCandidate ? "rgba(217,119,6,0.06)" : displayVal.length === 0 ? "rgba(220,38,38,0.05)" : col.price === minPrice ? "rgba(217,119,6,0.03)" : "transparent",
                                        verticalAlign: "top",
                                      }}>
                                        {displayVal.length === 0 ? <span style={{ fontSize: "0.72rem", fontStyle: "italic" }}>Missing</span> : displayVal.length === 1 ? displayVal[0] : (
                                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                            {displayVal.map((v, vi) => (
                                              <div key={vi} style={{
                                                fontSize: vi === 0 ? "0.8rem" : "0.72rem",
                                                color: vi === 0 ? undefined : "var(--muted)",
                                                borderTop: vi > 0 ? "1px dashed var(--border)" : "none",
                                                paddingTop: vi > 0 ? 2 : 0,
                                              }}>
                                                {v}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                                );
                              })}
                              {/* Price row */}
                              <tr>
                                <td style={{
                                  position: "sticky", left: 0, background: "#1a1a1a", zIndex: 1,
                                  padding: "12px 14px", fontWeight: 800, fontSize: "0.78rem",
                                  color: "#fff", borderTop: "2px solid var(--gold)",
                                }}>
                                  Price
                                </td>
                                {visibleColumns.map((col, ci) => (
                                  <td key={ci} style={{
                                    padding: "12px 14px", textAlign: "center",
                                    background: col.price === minPrice ? "var(--gold)" : "#1a1a1a",
                                    color: col.price === minPrice ? "#fff" : "var(--gold)",
                                    fontWeight: 800, fontSize: "0.92rem",
                                    borderTop: "2px solid var(--gold)",
                                    borderLeft: "1px solid rgba(255,255,255,0.1)",
                                    fontFamily: "'Bricolage Grotesque', sans-serif",
                                  }}>
                                    ${col.price.toLocaleString()}
                                    {col.price === minPrice && (
                                      <div style={{ fontSize: "0.62rem", fontWeight: 600, marginTop: 2, opacity: 0.85 }}>
                                        Lowest
                                      </div>
                                    )}
                                    {categoryBudget != null && categoryBudget > 0 && (
                                      <div style={{
                                        fontSize: "0.6rem", fontWeight: 700, marginTop: 2,
                                        color: col.price <= categoryBudget
                                          ? (col.price === minPrice ? "rgba(255,255,255,0.85)" : "#16a34a")
                                          : "#dc2626",
                                      }}>
                                        {col.price <= categoryBudget
                                          ? `↓$${(categoryBudget - col.price).toLocaleString()}`
                                          : `↑$${(col.price - categoryBudget).toLocaleString()}`}
                                      </div>
                                    )}
                                  </td>
                                ))}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <div style={{ textAlign: "center", padding: "20px", color: "var(--muted)", fontSize: "0.82rem" }}>
                    <button onClick={() => setResultsView("list")} className="btn btn-outline btn-xs">
                      &#8592; Back to Vendors
                    </button>
                  </div>
                )}

                {/* Manual entry buttons */}
                {bid && (
                  <div style={{
                    display: "flex", gap: 8, marginTop: 16, padding: "14px",
                    background: "var(--bg)", borderRadius: 10, border: "1px solid var(--border)",
                  }}>
                    <button
                      className="btn btn-outline btn-xs"
                      onClick={() => {
                        setEditResponseId(null);
                        setManualProposals([{ name: "", price: "", specs: [{ key: "", value: "" }] }]);
                        setManualVendorName("");
                        setManualActiveP(0);
                        setShowManualEntry(true);
                      }}
                      style={{ flex: 1, justifyContent: "center" }}
                    >
                      ✏️ Add Manual Response
                    </button>
                    <button
                      className="btn btn-gold btn-xs"
                      onClick={() => {
                        setAiFiles([]);
                        setAiText("");
                        setAiResult(null);
                        setAiResults([]);
                        setShowAiParse(true);
                      }}
                      style={{ flex: 1, justifyContent: "center" }}
                    >
                      🤖 Scan Document (AI)
                    </button>
                    <button
                      className="btn btn-outline btn-xs"
                      onClick={() => setShowAiBidCreate(true)}
                      style={{ flex: 1, justifyContent: "center", color: "var(--gold)", borderColor: "var(--gold-b)" }}
                    >
                      🤖 Create Bid from Quote
                    </button>
                    <button
                      className="btn btn-outline btn-xs"
                      onClick={() => setShowPlanAnalysis(true)}
                      style={{ flex: 1, justifyContent: "center", color: "#7c3aed", borderColor: "#c4b5fd" }}
                    >
                      📐 Analyze Plans (Pro+)
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Bid Form tab */
              <div>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12,
                  flexWrap: "wrap", gap: 6,
                }}>
                  <div style={{
                    fontSize: "0.72rem", fontWeight: 800, color: "var(--muted)",
                    textTransform: "uppercase", letterSpacing: "0.04em",
                  }}>
                    Edit Bid Form
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      onClick={() => setShowTemplatePanel(v => !v)}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        background: showTemplatePanel ? "var(--gold-bg)" : "var(--surface)",
                        color: showTemplatePanel ? "var(--gold)" : "var(--ink2)",
                        border: `1.5px solid ${showTemplatePanel ? "var(--gold-b)" : "var(--border)"}`,
                        borderRadius: 7, padding: "5px 12px",
                        fontSize: "0.74rem", fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      📋 Load Template {bidFormTemplates.length > 0 ? `(${bidFormTemplates.length})` : ""}
                    </button>
                    <button
                      onClick={() => setShowAiBidCreate(true)}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        background: "#1a1a1a", color: "var(--gold)",
                        border: "none", borderRadius: 7, padding: "5px 12px",
                        fontSize: "0.74rem", fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      🤖 AI from Quote
                    </button>
                  </div>
                </div>

                {/* Template panel */}
                {showTemplatePanel && (
                  <div style={{
                    background: "var(--gold-bg)", border: "1.5px solid var(--gold-b)", borderRadius: 10,
                    padding: "12px 14px", marginBottom: 14, maxHeight: 320, overflowY: "auto",
                  }}>
                    <input
                      value={templatePanelSearch}
                      onChange={e => setTemplatePanelSearch(e.target.value)}
                      placeholder="Search templates..."
                      style={{ ...inputStyle, marginBottom: 10, fontSize: "0.8rem" }}
                      autoFocus
                    />
                    {(() => {
                      const search = templatePanelSearch.toLowerCase();
                      const catId = categoryId as string;
                      const allFiltered = bidFormTemplates.filter(t =>
                        !search || t.name.toLowerCase().includes(search) || t.title.toLowerCase().includes(search)
                      );
                      const thisCat = allFiltered.filter(t => t.category_id === catId);
                      const others = allFiltered.filter(t => t.category_id !== catId);
                      const sortG = (arr: BidTemplateItem[]) => [...arr.filter(t => t.is_default), ...arr.filter(t => !t.is_default)];
                      const renderRow = (t: BidTemplateItem) => (
                        <div key={t.id} onClick={() => applyBidTemplate(t)} style={{
                          padding: "8px 12px", background: "var(--card)", borderRadius: 8,
                          border: "1px solid var(--border)", marginBottom: 4, cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 8,
                        }}
                          onMouseOver={e => { e.currentTarget.style.borderColor = "var(--gold-b)"; e.currentTarget.style.background = "var(--surface)"; }}
                          onMouseOut={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--card)"; }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--ink)" }}>{t.name}</span>
                              {t.is_default && <span style={{ fontSize: "0.56rem", fontWeight: 800, color: "var(--gold)", background: "rgba(217,119,6,0.1)", borderRadius: 3, padding: "0 4px" }}>DEFAULT</span>}
                            </div>
                            <div style={{ fontSize: "0.7rem", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                          </div>
                          <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--gold)", flexShrink: 0 }}>Apply →</span>
                        </div>
                      );
                      if (allFiltered.length === 0) return <div style={{ textAlign: "center", color: "var(--muted)", fontSize: "0.82rem", padding: "12px 0" }}>No templates found</div>;
                      return (
                        <>
                          {thisCat.length > 0 && (
                            <>
                              <div style={{ fontSize: "0.62rem", fontWeight: 800, color: "var(--gold)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                                ⭐ This Category ({thisCat.length})
                              </div>
                              {sortG(thisCat).map(renderRow)}
                            </>
                          )}
                          {others.length > 0 && (
                            <>
                              <div style={{ fontSize: "0.62rem", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6, marginTop: thisCat.length ? 10 : 0 }}>
                                {thisCat.length ? "Other Categories" : "All Templates"} ({others.length})
                              </div>
                              {sortG(others).map(renderRow)}
                            </>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
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

                  {/* Bid Mode Toggle */}
                  <div style={{
                    padding: "14px", background: "var(--bg)", borderRadius: 10,
                    border: `2px solid ${bidMode === "open" ? "var(--gold)" : "var(--border)"}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--ink)" }}>
                          Bid Mode: {bidMode === "open" ? "Open Proposal" : "Structured"}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: 2 }}>
                          {bidMode === "open"
                            ? "Vendors define their own specs, options & prices — best for complex items"
                            : "You define parameters — vendors price each combination"}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 0, border: "1.5px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
                        <button
                          type="button"
                          onClick={() => setBidMode("structured")}
                          style={{
                            padding: "6px 12px", border: "none", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer",
                            background: bidMode === "structured" ? "var(--ink)" : "var(--surface)",
                            color: bidMode === "structured" ? "#fff" : "var(--muted)",
                          }}
                        >
                          Structured
                        </button>
                        <button
                          type="button"
                          onClick={() => setBidMode("open")}
                          style={{
                            padding: "6px 12px", border: "none", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer",
                            background: bidMode === "open" ? "var(--gold)" : "var(--surface)",
                            color: bidMode === "open" ? "#fff" : "var(--muted)",
                          }}
                        >
                          Open Proposal
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Suggested Specs (Open Proposal mode) */}
                  {bidMode === "open" && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                        Suggested Spec Fields
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginBottom: 8 }}>
                        Define fields that vendors should fill in (e.g. Brand, Model, Warranty, Capacity)
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                        {suggestedSpecs.map((spec, i) => (
                          <div key={i} style={{
                            display: "flex", alignItems: "center", gap: 4,
                            background: "var(--gold-bg)", border: "1px solid var(--gold-b)",
                            borderRadius: 6, padding: "4px 8px", fontSize: "0.76rem", fontWeight: 600, color: "var(--ink)",
                          }}>
                            {spec}
                            <button
                              type="button"
                              onClick={() => setSuggestedSpecs(prev => prev.filter((_, j) => j !== i))}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "0.7rem", padding: 0, marginLeft: 2 }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          type="text"
                          value={newSpecField}
                          onChange={e => setNewSpecField(e.target.value)}
                          placeholder="e.g. Brand, Model, Warranty..."
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const val = newSpecField.trim();
                              if (val && !suggestedSpecs.includes(val)) {
                                setSuggestedSpecs(prev => [...prev, val]);
                                setNewSpecField("");
                              }
                            }
                          }}
                          style={{ ...inputStyle, flex: 1 }}
                        />
                        <button
                          type="button"
                          className="btn btn-outline btn-xs"
                          onClick={() => {
                            const val = newSpecField.trim();
                            if (val && !suggestedSpecs.includes(val)) {
                              setSuggestedSpecs(prev => [...prev, val]);
                              setNewSpecField("");
                            }
                          }}
                        >
                          + Add
                        </button>
                      </div>
                    </div>
                  )}

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

                  <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                    <button className="btn btn-gold btn-sm" onClick={handleSaveBidForm} disabled={saving}>
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                    <Link href={`/customer/${bid.id}`} style={{ textDecoration: "none" }}>
                      <button className="btn btn-outline btn-sm" type="button">
                        Full Bid Page
                      </button>
                    </Link>
                    {/* Vendor preview — inline modal */}
                    <button
                      className="btn btn-outline btn-sm"
                      type="button"
                      style={{ color: "#7c3aed", borderColor: "#c4b5fd" }}
                      onClick={() => setShowVendorPreview(true)}
                    >
                      👁 Vendor Preview
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODALS — portaled to body to avoid overflow/layout issues */}
      {typeof document !== "undefined" && createPortal(<>
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

      {/* ===== Manual Entry Modal ===== */}
      {showManualEntry && (
        <div className="modal" onClick={() => setShowManualEntry(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 640, maxHeight: "90vh", overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "var(--ink)" }}>
                {editResponseId ? "✏️ Edit Response" : "✏️ Add Manual Response"}
              </h3>
              <button onClick={() => { setShowManualEntry(false); setEditResponseId(null); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.2rem", color: "var(--muted)" }}>✕</button>
            </div>

            {/* Vendor name */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase" }}>Vendor Name *</div>
              <input
                className="finput"
                value={manualVendorName}
                onChange={e => setManualVendorName(e.target.value)}
                placeholder="e.g. Otis Elevator Co."
              />
            </div>

            {/* Proposal tabs */}
            <div style={{ display: "flex", gap: 0, borderBottom: "2px solid var(--border)", marginBottom: 14 }}>
              {manualProposals.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setManualActiveP(i)}
                  style={{
                    padding: "8px 16px", border: "none", background: "none",
                    fontSize: "0.8rem", fontWeight: manualActiveP === i ? 700 : 500,
                    color: manualActiveP === i ? "var(--gold)" : "var(--muted)",
                    borderBottom: manualActiveP === i ? "2px solid var(--gold)" : "2px solid transparent",
                    cursor: "pointer",
                  }}
                >
                  {p.name || `Option ${i + 1}`}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setManualProposals([...manualProposals, { name: "", price: "", specs: [{ key: "", value: "" }] }]);
                  setManualActiveP(manualProposals.length);
                }}
                style={{ padding: "8px 12px", border: "none", background: "none", color: "var(--gold)", fontWeight: 700, cursor: "pointer" }}
              >
                +
              </button>
            </div>

            {/* Active proposal form */}
            {manualProposals[manualActiveP] && (
              <div>
                <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  <div style={{ flex: 2 }}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase" }}>Option Name</div>
                    <input
                      className="finput"
                      value={manualProposals[manualActiveP].name}
                      onChange={e => {
                        const u = [...manualProposals];
                        u[manualActiveP] = { ...u[manualActiveP], name: e.target.value };
                        setManualProposals(u);
                      }}
                      placeholder="e.g. Gen2 Comfort - Premium"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--gold)", marginBottom: 4, textTransform: "uppercase" }}>Price ($)</div>
                    <input
                      className="finput"
                      type="number"
                      step="0.01"
                      value={manualProposals[manualActiveP].price}
                      onChange={e => {
                        const u = [...manualProposals];
                        u[manualActiveP] = { ...u[manualActiveP], price: e.target.value };
                        setManualProposals(u);
                      }}
                      placeholder="0.00"
                      style={{ borderColor: "var(--gold)", background: "var(--gold-bg)" }}
                    />
                  </div>
                </div>

                {/* Specs */}
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase" }}>
                  Technical Specs
                </div>
                {manualProposals[manualActiveP].specs.map((spec, si) => (
                  <div key={si} style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }}>
                    <input
                      className="finput"
                      value={spec.key}
                      onChange={e => {
                        const u = [...manualProposals];
                        const specs = [...u[manualActiveP].specs];
                        specs[si] = { ...specs[si], key: e.target.value };
                        u[manualActiveP] = { ...u[manualActiveP], specs };
                        setManualProposals(u);
                      }}
                      placeholder="Spec (e.g. Brand)"
                      style={{ flex: 1, fontSize: "0.82rem" }}
                    />
                    <input
                      className="finput"
                      value={spec.value}
                      onChange={e => {
                        const u = [...manualProposals];
                        const specs = [...u[manualActiveP].specs];
                        specs[si] = { ...specs[si], value: e.target.value };
                        u[manualActiveP] = { ...u[manualActiveP], specs };
                        setManualProposals(u);
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const u = [...manualProposals];
                          const specs = [...u[manualActiveP].specs, { key: "", value: "" }];
                          u[manualActiveP] = { ...u[manualActiveP], specs };
                          setManualProposals(u);
                        }
                      }}
                      placeholder="Value (e.g. Otis)"
                      style={{ flex: 1.5, fontSize: "0.82rem" }}
                    />
                    {manualProposals[manualActiveP].specs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const u = [...manualProposals];
                          const specs = u[manualActiveP].specs.filter((_, j) => j !== si);
                          u[manualActiveP] = { ...u[manualActiveP], specs };
                          setManualProposals(u);
                        }}
                        style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const u = [...manualProposals];
                    const specs = [...u[manualActiveP].specs, { key: "", value: "" }];
                    u[manualActiveP] = { ...u[manualActiveP], specs };
                    setManualProposals(u);
                  }}
                  style={{ background: "none", border: "1px dashed var(--border)", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: "0.74rem", color: "var(--gold)", fontWeight: 600, marginTop: 4 }}
                >
                  + Add Spec
                </button>

                {manualProposals.length > 1 && (
                  <div style={{ textAlign: "right", marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        const u = manualProposals.filter((_, i) => i !== manualActiveP);
                        setManualProposals(u);
                        setManualActiveP(Math.max(0, manualActiveP - 1));
                      }}
                      style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: "0.74rem", fontWeight: 600 }}
                    >
                      Remove option
                    </button>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button className="btn btn-outline btn-xs" onClick={() => { setShowManualEntry(false); setEditResponseId(null); }}>Cancel</button>
              <button
                className="btn btn-gold btn-xs"
                onClick={editResponseId ? handleSaveEditedResponse : handleManualSubmit}
                disabled={manualSaving || !manualVendorName.trim()}
              >
                {manualSaving ? "Saving..." : editResponseId ? "Update Response" : "Save Response"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== AI Parse Modal (Multi-file) ===== */}
      {showAiParse && (
        <div className="modal" onClick={() => setShowAiParse(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "var(--ink)" }}>
                Scan Vendor Quotes
              </h3>
              <button onClick={() => setShowAiParse(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.2rem", color: "var(--muted)" }}>&#10005;</button>
            </div>

            <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 16 }}>
              Upload one or more vendor quote files. AI will extract vendor names, options, specs and prices from each.
            </p>

            {/* File upload — multiple */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase" }}>
                Upload Documents (PDF / Image) — Multiple allowed
              </div>
              <input
                type="file"
                accept=".pdf,image/*"
                multiple
                onChange={e => {
                  const files = Array.from(e.target.files || []);
                  setAiFiles(files);
                }}
                style={{ fontSize: "0.82rem" }}
              />
              {aiFiles.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  {aiFiles.map((f, i) => (
                    <div key={i} style={{ fontSize: "0.76rem", color: "var(--gold)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span>&#128196;</span> {f.name} ({(f.size / 1024).toFixed(0)} KB)
                      <button onClick={() => setAiFiles(aiFiles.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "0.8rem" }}>&#10005;</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Paste link */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                <span style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase" }}>or paste a link</span>
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="url"
                  value={aiUrl}
                  onChange={e => setAiUrl(e.target.value)}
                  placeholder="https://dropbox.com/... or Google Drive link"
                  className="finput"
                  style={{ flex: 1, fontSize: "0.82rem" }}
                />
                <button
                  className="btn btn-gold"
                  onClick={handleAiUrlFetch}
                  disabled={aiUrlLoading || !aiUrl.trim()}
                  style={{ whiteSpace: "nowrap", opacity: aiUrlLoading ? 0.7 : 1 }}
                >
                  {aiUrlLoading ? "..." : "Fetch"}
                </button>
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: 4 }}>
                Dropbox, Google Drive, or any public file link
              </div>
            </div>

            {/* Paste text (only when no files) */}
            {aiFiles.length === 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase" }}>
                  Or Paste Quote Text
                </div>
                <textarea
                  className="finput"
                  value={aiText}
                  onChange={e => setAiText(e.target.value)}
                  placeholder="Paste the vendor's quote text here..."
                  style={{ minHeight: 100, resize: "vertical", fontSize: "0.82rem" }}
                />
              </div>
            )}

            {/* Parse button */}
            <button
              className="btn btn-gold"
              onClick={handleAiParse}
              disabled={aiParsing || (aiFiles.length === 0 && !aiText.trim())}
              style={{ width: "100%", justifyContent: "center", marginBottom: 14, opacity: aiParsing ? 0.7 : 1 }}
            >
              {aiParsing
                ? `Analyzing${aiFiles.length > 1 ? ` (${aiFiles.length} files)` : ""}...`
                : `Parse${aiFiles.length > 1 ? ` ${aiFiles.length} Files` : ""} with AI`
              }
            </button>

            {/* Multi-file results */}
            {aiResults.length > 1 && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--gold)", textTransform: "uppercase" }}>
                    Parsed {aiResults.filter(r => r.vendor_name !== "Error").length}/{aiResults.length} Files
                  </div>
                  <button
                    className="btn btn-gold btn-xs"
                    onClick={saveAllAiResults}
                    disabled={aiParsing}
                    style={{ fontSize: "0.74rem" }}
                  >
                    Save All Responses
                  </button>
                </div>
                {aiResults.map((r, ri) => (
                  <div key={ri} style={{
                    border: r.vendor_name === "Error" ? "1.5px solid var(--border)" : "2px solid var(--gold)",
                    borderRadius: 10, padding: "12px 14px", marginBottom: 8,
                    background: r.vendor_name === "Error" ? "var(--surface)" : "var(--gold-bg)",
                    opacity: r.vendor_name === "Error" ? 0.6 : 1,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: "0.68rem", color: "var(--muted)", marginBottom: 2 }}>{r.fileName}</div>
                        <div style={{ fontWeight: 700, fontSize: "0.86rem", color: r.vendor_name === "Error" ? "var(--muted)" : "var(--ink)" }}>
                          {r.vendor_name === "Error" ? "Failed to parse" : r.vendor_name}
                        </div>
                      </div>
                      {r.vendor_name !== "Error" && (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            className="btn btn-outline btn-xs"
                            onClick={() => applyAiResult(r)}
                            style={{ fontSize: "0.7rem", padding: "3px 8px" }}
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </div>
                    {r.proposals.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                        {r.proposals.map((p, pi) => (
                          <span key={pi} style={{
                            fontSize: "0.72rem", background: "var(--card)", border: "1px solid var(--border)",
                            borderRadius: 5, padding: "2px 8px",
                          }}>
                            {p.name} — <strong style={{ color: "var(--gold)" }}>${Number(p.price).toLocaleString()}</strong>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Single file result */}
            {aiResults.length === 1 && aiResult && (
              <div style={{
                border: "2px solid var(--gold)", borderRadius: 10,
                padding: 16, background: "var(--gold-bg)",
              }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--gold)", textTransform: "uppercase", marginBottom: 8 }}>
                  Parsed Results
                </div>
                <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>
                  Vendor: {aiResult.vendor_name}
                </div>
                {aiResult.proposals.map((p, i) => (
                  <div key={i} style={{
                    background: "var(--card)", borderRadius: 8, padding: "10px 12px",
                    border: "1px solid var(--border)", marginBottom: 6,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 700, fontSize: "0.84rem", color: "var(--ink)" }}>{p.name}</span>
                      <span style={{ fontWeight: 800, fontSize: "0.9rem", color: "var(--gold)" }}>${Number(p.price).toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 4 }}>
                      {p.specs.length} specs: {p.specs.slice(0, 3).map(s => `${s.key}: ${s.value}`).join(", ")}
                      {p.specs.length > 3 && ` +${p.specs.length - 3} more`}
                    </div>
                  </div>
                ))}

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button className="btn btn-outline btn-xs" onClick={() => { setAiResult(null); setAiResults([]); }} style={{ flex: 1, justifyContent: "center" }}>
                    Re-parse
                  </button>
                  <button className="btn btn-gold btn-xs" onClick={() => applyAiResult()} style={{ flex: 1, justifyContent: "center" }}>
                    Use & Edit
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== Spec Completion Request Modal ===== */}
      {showSpecRequest && specRequestKeys.length > 0 && (
        <div className="modal" onClick={() => setShowSpecRequest(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 620, maxHeight: "90vh", overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "var(--ink)" }}>
                Request Spec Completion
              </h3>
              <button onClick={() => setShowSpecRequest(false)} style={{ background: "none", border: "none", fontSize: "1.2rem", cursor: "pointer", color: "var(--muted)" }}>&times;</button>
            </div>

            <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 16, lineHeight: 1.5 }}>
              Select specs to request from vendors. Each vendor will only receive specs they haven't provided yet.
            </p>

            {/* Spec keys list with gap analysis */}
            <div style={{ border: "1.5px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                <thead>
                  <tr style={{ background: "var(--bg)" }}>
                    <th style={{ padding: "8px 12px", textAlign: "left", borderBottom: "2px solid var(--border)", width: 30 }}>
                      <input
                        type="checkbox"
                        checked={specRequestSelectedKeys.size === specRequestKeys.length}
                        onChange={() => {
                          if (specRequestSelectedKeys.size === specRequestKeys.length) {
                            setSpecRequestSelectedKeys(new Set());
                          } else {
                            setSpecRequestSelectedKeys(new Set(specRequestKeys));
                          }
                        }}
                        style={{ accentColor: "var(--gold)", width: 14, height: 14 }}
                      />
                    </th>
                    <th style={{ padding: "8px 12px", textAlign: "left", borderBottom: "2px solid var(--border)", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontSize: "0.68rem" }}>
                      Specification
                    </th>
                    {(responses as any[]).map((resp: any) => (
                      <th key={resp.id} style={{
                        padding: "8px 8px", textAlign: "center", borderBottom: "2px solid var(--border)",
                        fontWeight: 700, fontSize: "0.68rem", color: "var(--ink)", maxWidth: 100,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {resp.vendor_name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {specRequestKeys.map(key => {
                    const selected = specRequestSelectedKeys.has(key);
                    return (
                      <tr key={key} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "6px 12px" }}>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => {
                              setSpecRequestSelectedKeys(prev => {
                                const next = new Set(prev);
                                selected ? next.delete(key) : next.add(key);
                                return next;
                              });
                            }}
                            style={{ accentColor: "var(--gold)", width: 14, height: 14 }}
                          />
                        </td>
                        <td style={{ padding: "6px 12px", fontWeight: 600, color: "var(--ink)" }}>
                          {key}
                        </td>
                        {(responses as any[]).map((resp: any) => {
                          // Check if vendor has this spec
                          let hasSpec = false;
                          let specVal = "";
                          if (resp.proposals) {
                            for (const p of resp.proposals) {
                              if (p.specs) {
                                const found = p.specs.find((s: any) => (s.key || s.spec_key || "").toLowerCase() === key.toLowerCase());
                                if (found) { hasSpec = true; specVal = found.value || found.spec_value || ""; break; }
                              }
                            }
                          }
                          return (
                            <td key={resp.id} style={{
                              padding: "6px 8px", textAlign: "center",
                              color: hasSpec ? "var(--ink2)" : "var(--muted)",
                              fontSize: "0.74rem",
                            }}>
                              {hasSpec ? (
                                <span title={specVal} style={{ maxWidth: 80, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {specVal || "—"}
                                </span>
                              ) : (
                                <span style={{ color: "#c00", fontWeight: 700, fontSize: "0.68rem" }}>MISSING</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Vendor selection */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Send to vendors
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(responses as any[]).map((resp: any) => {
                  const isSelected = specRequestVendorIds.has(resp.id);
                  return (
                    <label key={resp.id} style={{
                      display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                      background: isSelected ? "var(--gold-bg)" : "var(--bg)",
                      border: `1.5px solid ${isSelected ? "var(--gold-b)" : "var(--border)"}`,
                      borderRadius: 7, padding: "6px 12px",
                      fontSize: "0.78rem", fontWeight: 600,
                      color: isSelected ? "var(--gold)" : "var(--muted)",
                    }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          setSpecRequestVendorIds(prev => {
                            const next = new Set(prev);
                            isSelected ? next.delete(resp.id) : next.add(resp.id);
                            return next;
                          });
                        }}
                        style={{ accentColor: "var(--gold)", width: 13, height: 13 }}
                      />
                      {resp.vendor_name}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Summary + actions */}
            <div style={{
              background: "var(--bg)", borderRadius: 8, padding: "10px 14px", marginBottom: 16,
              fontSize: "0.78rem", color: "var(--muted)",
            }}>
              {specRequestSelectedKeys.size} spec{specRequestSelectedKeys.size !== 1 ? "s" : ""} selected &middot; {specRequestVendorIds.size} vendor{specRequestVendorIds.size !== 1 ? "s" : ""} will be emailed
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline btn-xs" onClick={() => setShowSpecRequest(false)}>Cancel</button>
              <button
                className="btn btn-gold btn-xs"
                onClick={handleSendSpecRequest}
                disabled={specRequestSending || specRequestSelectedKeys.size === 0 || specRequestVendorIds.size === 0}
              >
                {specRequestSending ? "Sending..." : "Send Spec Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Winner Selection Modal ===== */}
      {showWinnerModal && winnerResp && (
        <div className="modal" onClick={() => setShowWinnerModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, maxHeight: "90vh", overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "var(--ink)" }}>
                Select Winner
              </h3>
              <button onClick={() => setShowWinnerModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.2rem", color: "var(--muted)" }}>&#10005;</button>
            </div>

            {/* Vendor info */}
            <div style={{
              background: "var(--gold-bg)", border: "2px solid var(--gold)", borderRadius: 10,
              padding: "14px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: "50%", background: "var(--gold)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: "0.8rem", color: "#fff", flexShrink: 0,
              }}>
                {winnerResp.vendor_name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: "0.92rem", color: "var(--ink)" }}>
                  {winnerResp.vendor_name}
                </div>
                <div style={{ fontSize: "0.74rem", color: "var(--muted)" }}>
                  {winnerResp.proposals?.length || 1} option{(winnerResp.proposals?.length || 1) !== 1 ? "s" : ""}
                </div>
              </div>
            </div>

            {/* Select proposal if multiple */}
            {winnerResp.proposals?.length > 1 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase" }}>
                  Select Winning Option
                </div>
                {winnerResp.proposals.map((p: any, i: number) => (
                  <label key={i} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px", marginBottom: 4, borderRadius: 8, cursor: "pointer",
                    background: winnerProposalIdx === i ? "var(--gold-bg)" : "var(--surface)",
                    border: winnerProposalIdx === i ? "2px solid var(--gold)" : "1.5px solid var(--border)",
                  }}>
                    <input
                      type="radio"
                      checked={winnerProposalIdx === i}
                      onChange={() => setWinnerProposalIdx(i)}
                      style={{ accentColor: "var(--gold)" }}
                    />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 600, fontSize: "0.84rem", color: "var(--ink)" }}>
                        {p.name || `Option ${i + 1}`}
                      </span>
                    </div>
                    <span style={{ fontWeight: 800, fontSize: "0.9rem", color: "var(--gold)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>
                      ${Number(p.price).toLocaleString()}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {/* Single proposal summary */}
            {winnerResp.proposals?.length === 1 && (
              <div style={{
                padding: "10px 14px", marginBottom: 16, borderRadius: 8,
                background: "var(--surface)", border: "1.5px solid var(--border)",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span style={{ fontWeight: 600, fontSize: "0.84rem", color: "var(--ink)" }}>
                  {winnerResp.proposals[0].name}
                </span>
                <span style={{ fontWeight: 800, fontSize: "0.92rem", color: "var(--gold)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>
                  ${Number(winnerResp.proposals[0].price).toLocaleString()}
                </span>
              </div>
            )}

            {/* Notes */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase" }}>
                Notes (optional)
              </div>
              <textarea
                className="finput"
                value={winnerNotes}
                onChange={e => setWinnerNotes(e.target.value)}
                placeholder="Notes for the winner..."
                style={{ minHeight: 60, resize: "vertical", fontSize: "0.82rem" }}
              />
            </div>

            {/* Notification options */}
            <div style={{
              background: "var(--surface)", border: "1.5px solid var(--border)",
              borderRadius: 10, padding: "14px 16px", marginBottom: 16,
            }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--muted)", marginBottom: 10, textTransform: "uppercase" }}>
                Email Notifications
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={winnerNotifyWinner} onChange={e => setWinnerNotifyWinner(e.target.checked)} style={{ accentColor: "var(--gold)", width: 15, height: 15 }} />
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--ink)" }}>
                  Notify winning vendor
                </span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={winnerNotifyLosers} onChange={e => setWinnerNotifyLosers(e.target.checked)} style={{ accentColor: "var(--gold)", width: 15, height: 15 }} />
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--ink)" }}>
                  Notify other vendors (not selected)
                </span>
              </label>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 6 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer" }}>
                  <input type="checkbox" checked={winnerNotifyClerk} onChange={e => setWinnerNotifyClerk(e.target.checked)} style={{ accentColor: "var(--gold)", width: 15, height: 15 }} />
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--ink)" }}>
                    Send to office / clerk
                  </span>
                </label>
                {winnerNotifyClerk && (
                  <div style={{ paddingLeft: 23 }}>
                    <input
                      className="finput"
                      type="email"
                      value={winnerClerkEmail}
                      onChange={e => setWinnerClerkEmail(e.target.value)}
                      placeholder="clerk@company.com"
                      style={{ fontSize: "0.82rem", marginBottom: 6 }}
                    />
                    <textarea
                      className="finput"
                      value={winnerClerkMsg}
                      onChange={e => setWinnerClerkMsg(e.target.value)}
                      placeholder="Message to clerk (optional)..."
                      style={{ minHeight: 50, resize: "vertical", fontSize: "0.8rem" }}
                    />
                    {!notifSettings.clerk_email && winnerClerkEmail && (
                      <div style={{ fontSize: "0.7rem", color: "var(--gold)", marginTop: 4, fontWeight: 600 }}>
                        Tip: Save this email in Settings to auto-fill next time
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline btn-xs" onClick={() => setShowWinnerModal(false)}>Cancel</button>
              <button
                className="btn btn-gold btn-xs"
                onClick={handleSelectWinner}
                disabled={winnerSaving || (winnerNotifyClerk && !winnerClerkEmail)}
              >
                {winnerSaving ? "Processing..." : "Confirm Winner"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI PLAN ANALYSIS (Pro+) */}
      {showPlanAnalysis && (
        <div className="modal-overlay open" onClick={() => !planAnalyzing && setShowPlanAnalysis(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: planResult ? 700 : 500, maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <span>📐</span> AI Plan Analysis
                <span style={{ fontSize: "0.6rem", background: "#7c3aed", color: "#fff", padding: "2px 8px", borderRadius: 10, fontWeight: 800 }}>PRO+</span>
              </h3>
              <button onClick={() => { setShowPlanAnalysis(false); setPlanResult(null); setPlanUpgradeNeeded(false); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.2rem", color: "var(--muted)" }}>×</button>
            </div>

            {planUpgradeNeeded ? (
              <div style={{ textAlign: "center", padding: "28px 20px" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🔒</div>
                <p style={{ fontWeight: 700, fontSize: "1rem", color: "var(--ink)", marginBottom: 8 }}>Pro+ Feature</p>
                <p style={{ color: "var(--muted)", fontSize: "0.88rem", marginBottom: 20 }}>
                  AI Plan Analysis requires a Pro+ subscription. Upgrade to extract quantities, materials, and scope from construction plans automatically.
                </p>
                <a href="/customer/billing" className="btn btn-gold btn-xs" style={{ textDecoration: "none", padding: "10px 28px", fontSize: "0.88rem" }}>
                  Upgrade to Pro+
                </a>
              </div>
            ) : planResult ? (
              <div style={{ flex: 1, overflowY: "auto", fontSize: "0.82rem" }}>
                {/* Summary */}
                {planResult.project_summary && (
                  <div style={{ background: "#f5f3ff", border: "1.5px solid #c4b5fd", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                    <div style={{ fontWeight: 800, fontSize: "0.68rem", textTransform: "uppercase", color: "#7c3aed", marginBottom: 4 }}>Project Summary</div>
                    <div style={{ color: "var(--ink)" }}>{planResult.project_summary}</div>
                  </div>
                )}

                {/* Quantities table */}
                {planResult.quantities?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 800, fontSize: "0.68rem", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
                      Quantities ({planResult.quantities.length} items)
                    </div>
                    <div style={{ border: "1.5px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                        <thead>
                          <tr style={{ background: "var(--bg)" }}>
                            <th style={{ padding: "6px 10px", textAlign: "left", borderBottom: "1px solid var(--border)", fontWeight: 700, color: "var(--muted)", fontSize: "0.68rem" }}>Item</th>
                            <th style={{ padding: "6px 10px", textAlign: "right", borderBottom: "1px solid var(--border)", fontWeight: 700, color: "var(--muted)", fontSize: "0.68rem" }}>Qty</th>
                            <th style={{ padding: "6px 10px", textAlign: "left", borderBottom: "1px solid var(--border)", fontWeight: 700, color: "var(--muted)", fontSize: "0.68rem" }}>Unit</th>
                            <th style={{ padding: "6px 10px", textAlign: "center", borderBottom: "1px solid var(--border)", fontWeight: 700, color: "var(--muted)", fontSize: "0.68rem" }}>Conf.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {planResult.quantities.map((q: any, i: number) => (
                            <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                              <td style={{ padding: "6px 10px", color: "var(--ink)", fontWeight: 500 }}>
                                {q.item}
                                {q.notes && <div style={{ fontSize: "0.68rem", color: "var(--muted)" }}>{q.notes}</div>}
                              </td>
                              <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, color: "var(--ink)" }}>{q.quantity}</td>
                              <td style={{ padding: "6px 10px", color: "var(--muted)" }}>{q.unit}</td>
                              <td style={{ padding: "6px 10px", textAlign: "center" }}>
                                <span style={{
                                  fontSize: "0.62rem", fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                                  background: q.confidence === "high" ? "#dcfce7" : q.confidence === "medium" ? "#fef3c7" : "#fee2e2",
                                  color: q.confidence === "high" ? "#166534" : q.confidence === "medium" ? "#92400e" : "#991b1b",
                                }}>{q.confidence}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Materials */}
                {planResult.materials?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 800, fontSize: "0.68rem", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>Materials</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {planResult.materials.map((m: any, i: number) => (
                        <div key={i} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontSize: "0.76rem" }}>
                          <span style={{ fontWeight: 700 }}>{m.material}</span>
                          {m.specification && <span style={{ color: "var(--muted)" }}> — {m.specification}</span>}
                          {m.estimated_quantity && <span style={{ color: "#7c3aed", fontWeight: 600, marginLeft: 4 }}>~{m.estimated_quantity} {m.unit || ""}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {planResult.warnings?.length > 0 && (
                  <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
                    {planResult.warnings.map((w: string, i: number) => (
                      <div key={i} style={{ fontSize: "0.76rem", color: "#92400e", marginBottom: 2 }}>⚠ {w}</div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                  <button className="btn btn-outline btn-xs" onClick={() => setPlanResult(null)}>Back</button>
                  <button className="btn btn-gold btn-xs" onClick={() => applyPlanToBidForm(planResult)} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    ✓ Apply to Bid Form
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 16 }}>
                  Upload construction plans, drawings, or specifications. AI will extract quantities, materials, and create a bid form.
                </p>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase" }}>Upload Plan (PDF up to 4MB / Image — auto-compressed)</div>
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.tiff" onChange={e => setPlanFile(e.target.files?.[0] || null)} style={{ fontSize: "0.82rem" }} />
                  {planFile && (
                    <div style={{ fontSize: "0.76rem", fontWeight: 600, marginTop: 4, color: planFile.size > 4 * 1024 * 1024 && planFile.type === "application/pdf" ? "#dc2626" : "#7c3aed" }}>
                      {planFile.name} ({(planFile.size / (1024 * 1024)).toFixed(1)} MB)
                      {planFile.size > 4 * 1024 * 1024 && planFile.type === "application/pdf" && <span style={{ display: "block", color: "#dc2626", fontSize: "0.72rem" }}>⚠ PDF too large for direct upload. Use a Dropbox/Drive link below instead!</span>}
                      {planFile.size > 4 * 1024 * 1024 && planFile.type.startsWith("image/") && <span style={{ display: "block", color: "#7c3aed", fontSize: "0.72rem" }}>Image will be auto-compressed before upload.</span>}
                    </div>
                  )}
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase" }}>
                    Or Paste Dropbox / Google Drive Link
                    <span style={{ fontSize: "0.62rem", fontWeight: 500, color: "#7c3aed", marginLeft: 6 }}>Supports large files up to 32MB!</span>
                  </div>
                  <input
                    type="url"
                    value={planUrl}
                    onChange={e => setPlanUrl(e.target.value)}
                    placeholder="https://www.dropbox.com/... or https://drive.google.com/..."
                    style={{ width: "100%", padding: "8px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: "0.82rem", boxSizing: "border-box" }}
                  />
                  {planUrl.trim() && (
                    <div style={{ fontSize: "0.72rem", color: "#7c3aed", marginTop: 4 }}>
                      {planUrl.includes("dropbox") ? "📦 Dropbox link detected" : planUrl.includes("drive.google") ? "📁 Google Drive link detected" : "🔗 Direct URL"}
                      {" — file will be downloaded server-side (no size limit)"}
                    </div>
                  )}
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase" }}>Or Paste Specifications</div>
                  <textarea value={planText} onChange={e => setPlanText(e.target.value)} placeholder="Paste BOQ, specifications, or scope description..." style={{ width: "100%", minHeight: 80, padding: "10px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: "0.82rem", resize: "vertical", boxSizing: "border-box", fontFamily: "'Plus Jakarta Sans', sans-serif" }} />
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button className="btn btn-outline btn-xs" onClick={() => { setShowPlanAnalysis(false); setPlanUrl(""); }} disabled={planAnalyzing}>Cancel</button>
                  <button className="btn btn-gold btn-xs" onClick={handlePlanAnalysis} disabled={planAnalyzing || (!planFile && !planText.trim() && !planUrl.trim())} style={{ display: "flex", alignItems: "center", gap: 5, background: "#7c3aed" }}>
                    {planAnalyzing ? (<><span style={{ display: "inline-block", width: 13, height: 13, borderRadius: "50%", border: "2px solid #c4b5fd", borderTopColor: "#fff", animation: "spin 0.8s linear infinite" }} />Analyzing...</>) : (<>📐 Analyze Plan</>)}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* AI BID CREATION FROM QUOTE */}
      {showAiBidCreate && (
        <div className="modal-overlay open" onClick={() => !aiBidCreating && setShowAiBidCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <span>🤖</span> Create Bid from Quote
            </h3>
            <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 16 }}>
              Upload a vendor quote or paste its content. AI will create a bid form you can send to other vendors for comparison.
            </p>

            {/* File upload */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Upload Quote (PDF / Image)
              </div>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                onChange={e => setAiBidFile(e.target.files?.[0] || null)}
                style={{ fontSize: "0.82rem" }}
              />
              {aiBidFile && (
                <div style={{ fontSize: "0.76rem", color: "var(--gold)", fontWeight: 600, marginTop: 4 }}>
                  {aiBidFile.name} ({(aiBidFile.size / 1024).toFixed(0)} KB)
                </div>
              )}
            </div>

            {/* Or paste text */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Or Paste Quote Text
              </div>
              <textarea
                value={aiBidText}
                onChange={e => setAiBidText(e.target.value)}
                placeholder="Paste the content of a vendor quote here..."
                style={{
                  width: "100%", minHeight: 120, padding: "10px 12px",
                  border: "1.5px solid var(--border)", borderRadius: 8,
                  fontSize: "0.82rem", resize: "vertical", boxSizing: "border-box",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline btn-xs" onClick={() => setShowAiBidCreate(false)} disabled={aiBidCreating}>
                Cancel
              </button>
              <button
                className="btn btn-gold btn-xs"
                onClick={handleAiBidCreate}
                disabled={aiBidCreating || (!aiBidFile && !aiBidText.trim())}
                style={{ display: "flex", alignItems: "center", gap: 5 }}
              >
                {aiBidCreating ? (
                  <>
                    <span style={{ display: "inline-block", width: 13, height: 13, borderRadius: "50%", border: "2px solid var(--gold-b)", borderTopColor: "#fff", animation: "spin 0.8s linear infinite" }} />
                    Creating...
                  </>
                ) : (
                  <>🤖 Create Bid Form</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Analysis is now inline in comparison view - no modal needed */}

      {/* ===== Vendor Preview Modal ===== */}
      {showVendorPreview && bid && (
        <div className="modal-overlay open" onClick={() => setShowVendorPreview(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500, maxHeight: "88vh", overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <span>👁</span> Vendor Preview
              </h3>
              <button onClick={() => setShowVendorPreview(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.2rem", color: "var(--muted)" }}>×</button>
            </div>
            <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: 14 }}>This is how vendors will see this bid form</p>

            <div style={{ background: "#fafaf8", border: "1.5px solid #e5e5e0", borderRadius: 12, padding: "20px", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#1a1a1a", marginBottom: 4 }}>{editTitle || bid.title}</div>
              <div style={{ fontSize: "0.82rem", color: "#666", marginBottom: 16, whiteSpace: "pre-wrap" }}>{editDesc || bid.description || "No description"}</div>

              {bidMode === "open" ? (
                <div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#d97706", marginBottom: 8, textTransform: "uppercase" }}>Open Proposal Mode</div>
                  <div style={{ background: "#fff", border: "1px solid #e5e5e0", borderRadius: 8, padding: 14, marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                      <div style={{ flex: 2 }}>
                        <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#888", marginBottom: 3 }}>Option Name *</div>
                        <div style={{ padding: "8px", background: "#f5f5f5", borderRadius: 6, fontSize: "0.82rem", color: "#aaa" }}>e.g. Premium Package</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#d97706", marginBottom: 3 }}>Price ($) *</div>
                        <div style={{ padding: "8px", background: "#fffbf0", borderRadius: 6, fontSize: "0.82rem", color: "#aaa", border: "1px solid #fde68a" }}>0.00</div>
                      </div>
                    </div>
                    {suggestedSpecs.length > 0 && (
                      <div>
                        <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#888", marginBottom: 6 }}>Specifications</div>
                        {suggestedSpecs.map((s, i) => (
                          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                            <div style={{ width: 120, padding: "6px 8px", background: "#f5f5f5", borderRadius: 5, fontSize: "0.78rem", fontWeight: 600 }}>{s}</div>
                            <div style={{ flex: 1, padding: "6px 8px", background: "#f5f5f5", borderRadius: 5, fontSize: "0.78rem", color: "#aaa" }}>Enter value...</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  {editParams.filter(p => p.name && p.options.length > 0).map((p, pi) => (
                    <div key={pi} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: "0.74rem", fontWeight: 700, marginBottom: 6, color: p.is_track ? "#d97706" : "#1a1a1a" }}>
                        {p.is_track ? `⚡ ${p.name} (Track)` : p.name}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {p.options.map((opt, oi) => (
                          <div key={oi} style={{ padding: "6px 12px", background: "#fff", border: "1.5px solid #e5e5e0", borderRadius: 8, fontSize: "0.8rem", color: "#1a1a1a" }}>
                            {opt}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {editParams.filter(p => p.name && p.options.length > 0).length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "#d97706", marginBottom: 6 }}>Price per combination ($)</div>
                      <div style={{ padding: "8px", background: "#fffbf0", borderRadius: 6, fontSize: "0.82rem", color: "#aaa", border: "1px solid #fde68a" }}>
                        Vendors fill prices for each combination...
                      </div>
                    </div>
                  )}
                </div>
              )}

              {editChecklist.length > 0 && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #e5e5e0" }}>
                  <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "#1a1a1a", marginBottom: 8 }}>Required Documents & Conditions</div>
                  {editChecklist.map((c, ci) => (
                    <div key={ci} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <div style={{ width: 16, height: 16, borderRadius: 3, border: `1.5px solid ${c.required ? "#d97706" : "#ccc"}`, background: "transparent", flexShrink: 0 }} />
                      <span style={{ fontSize: "0.8rem", color: "#1a1a1a" }}>{c.text}</span>
                      {!c.required && <span style={{ fontSize: "0.6rem", color: "#999", fontWeight: 600 }}>Optional</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: 14, fontSize: "0.72rem", color: "var(--muted)", textAlign: "center" }}>
              Preview only — unsaved changes are shown
            </div>
          </div>
        </div>
      )}

      {/* Resend to vendors dialog */}
      {showResendDialog && typeof window !== "undefined" && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 12, padding: 28, width: 480, maxWidth: "90vw" }}>
            <h3 style={{ margin: "0 0 6px", color: "#f5c842" }}>Resend Bid to Vendors?</h3>
            <p style={{ margin: "0 0 20px", color: "#aaa", fontSize: 13 }}>The bid form was updated. Would you like to notify vendors and resend their submission link?</p>

            {/* Who to send to */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 8, color: "#ddd", fontSize: 13 }}>
                <input type="radio" checked={resendToAll} onChange={() => setResendToAll(true)} style={{ accentColor: "#f5c842" }} />
                All invited vendors ({invitations.filter(inv => inv.status !== "declined").length})
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "#ddd", fontSize: 13 }}>
                <input type="radio" checked={!resendToAll} onChange={() => setResendToAll(false)} style={{ accentColor: "#f5c842" }} />
                Select specific vendors
              </label>
            </div>

            {/* Specific vendor selection */}
            {!resendToAll && (
              <div style={{ background: "#111", border: "1px solid #333", borderRadius: 8, padding: 12, marginBottom: 16, maxHeight: 180, overflowY: "auto" }}>
                {invitations.filter(inv => inv.status !== "declined").map(inv => (
                  <label key={inv.vendor_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer", color: "#ddd", fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={resendSelectedIds.has(inv.vendor_id)}
                      onChange={() => {
                        setResendSelectedIds(prev => {
                          const next = new Set(prev);
                          if (next.has(inv.vendor_id)) next.delete(inv.vendor_id); else next.add(inv.vendor_id);
                          return next;
                        });
                      }}
                      style={{ accentColor: "#f5c842" }}
                    />
                    <span>{inv.vendor_name || inv.vendor_id}</span>
                    <span style={{ color: "#666", fontSize: 11 }}>{inv.status}</span>
                  </label>
                ))}
              </div>
            )}

            {/* Optional message */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", color: "#aaa", fontSize: 12, marginBottom: 4 }}>Custom message (optional)</label>
              <textarea
                value={resendMessage}
                onChange={e => setResendMessage(e.target.value)}
                placeholder="e.g. Updated specifications — please review and resubmit your pricing"
                rows={2}
                style={{ width: "100%", background: "#111", border: "1px solid #333", borderRadius: 6, color: "#fff", padding: "8px 10px", fontSize: 13, resize: "none", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-gold" onClick={handleResendBid} disabled={resendSending} style={{ flex: 1 }}>
                {resendSending ? "Sending..." : "Resend Bid"}
              </button>
              <button className="btn btn-secondary" onClick={() => setShowResendDialog(false)} style={{ flex: 1 }}>
                Skip
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      </>, document.body)}
    </div>
  );
}
