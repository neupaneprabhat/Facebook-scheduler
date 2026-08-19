"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Calendar,
  Clock,
  Globe,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
  Edit3,
  ExternalLink,
  ChevronDown,
  Sparkles,
  Send,
  Facebook,
  Info,
  ShieldCheck,
  Check,
  Video,
  Film,
  Play,
  Image as ImageIcon,
} from "lucide-react";
import { getUtcDateFromLocal, formatInTimezone } from "@/lib/time";

interface FacebookPageItem {
  id: string;
  pageId: string;
  pageName: string;
  category?: string | null;
  pictureUrl?: string | null;
  isConnected: boolean;
  isSimulated?: boolean;
}

interface ScheduledPost {
  id: string;
  facebookPageId: string;
  facebookPage: {
    id: string;
    pageId: string;
    pageName: string;
    pictureUrl?: string | null;
    category?: string | null;
  };
  caption?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  mediaUrls?: string | null;
  mediaType?: "NONE" | "IMAGE" | "VIDEO" | "MULTI_IMAGE";
  scheduledAt: string;
  timezone: string;
  status: "SCHEDULED" | "PUBLISHING" | "PUBLISHED" | "FAILED";
  facebookPostId?: string | null;
  errorMessage?: string | null;
  publishedAt?: string | null;
  createdAt: string;
}

const COMMON_TIMEZONES = [
  { value: "Asia/Kathmandu", label: "Asia/Kathmandu (Nepal Time UTC +05:45)" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata (India Standard Time UTC +05:30)" },
  { value: "Asia/Dhaka", label: "Asia/Dhaka (Bangladesh Time UTC +06:00)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (Gulf Standard Time UTC +04:00)" },
  { value: "Asia/Bangkok", label: "Asia/Bangkok (Indochina Time UTC +07:00)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT UTC +08:00)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (Japan Standard Time UTC +09:00)" },
  { value: "Europe/London", label: "Europe/London (UTC +00:00 / BST)" },
  { value: "Europe/Paris", label: "Europe/Paris (UTC +01:00 / CEST)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (UTC +01:00 / CEST)" },
  { value: "America/New_York", label: "America/New_York (UTC -05:00 / EDT)" },
  { value: "America/Chicago", label: "America/Chicago (UTC -06:00 / CDT)" },
  { value: "America/Denver", label: "America/Denver (UTC -07:00 / MDT)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (UTC -08:00 / PDT)" },
  { value: "America/Toronto", label: "America/Toronto (UTC -05:00)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (UTC +10:00)" },
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
];

export default function FacebookSchedulerPage() {
  // Config & State
  const [isRealMetaConfigured, setIsRealMetaConfigured] = useState(false);
  const [pages, setPages] = useState<FacebookPageItem[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>("");
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [isMultiPageMode, setIsMultiPageMode] = useState(false);
  const [previewPageId, setPreviewPageId] = useState<string>("");
  const [isLoadingPages, setIsLoadingPages] = useState(true);

  // Form State
  const [caption, setCaption] = useState<string>("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"NONE" | "IMAGE" | "VIDEO" | "MULTI_IMAGE">("NONE");
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  
  // Schedule timing
  const [publishDate, setPublishDate] = useState<string>("");
  const [publishTime, setPublishTime] = useState<string>("20:30");
  const [timezone, setTimezone] = useState<string>("Asia/Kathmandu");

  // Post List & Execution
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterPageId, setFilterPageId] = useState<string>("ALL");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);

  // Modals & Feedback
  const [showAddPageModal, setShowAddPageModal] = useState(false);
  const [isAddingPage, setIsAddingPage] = useState(false);
  const [confirmationModal, setConfirmationModal] = useState<{
    pageName: string;
    dateFormatted: string;
    timeFormatted: string;
    timezone: string;
    utcString: string;
  } | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scheduledPostsSectionRef = useRef<HTMLDivElement>(null);

  // 1. Initial Load: Detect Timezone, Fetch Config & Pages & Posts, Load Draft
  useEffect(() => {
    // Check URL parameters for OAuth messages
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const authError = urlParams.get("auth_error");
      const authWarning = urlParams.get("auth_warning");
      const connected = urlParams.get("connected");

      if (authError) {
        showToast("error", `Facebook Login Error: ${authError}`);
      } else if (authWarning) {
        showToast("info", authWarning);
      } else if (connected === "success") {
        showToast("success", "Facebook Page(s) connected successfully!");
      }
    }

    // Detect user's timezone if valid
    try {
      const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (localTz) {
        setTimezone(localTz);
      }
    } catch {
      setTimezone("Asia/Kathmandu");
    }

    // Set default publish date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];
    setPublishDate(tomorrowStr);

    // Restore caption draft from localStorage
    const savedDraft = localStorage.getItem("fb_caption_draft");
    if (savedDraft) {
      setCaption(savedDraft);
    }

    // Fetch config & initial data
    fetchConfig();
    fetchPages();
    fetchPosts();

    // Auto-refresh posts list every 5 seconds
    const interval = setInterval(() => {
      fetchPosts(true);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Autosave draft
  useEffect(() => {
    if (caption) {
      localStorage.setItem("fb_caption_draft", caption);
    }
  }, [caption]);

  // Show temporary toast
  const showToast = (type: "success" | "error" | "info", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      setIsRealMetaConfigured(Boolean(data.isRealMetaConfigured));
    } catch (e) {
      console.error("Config fetch error:", e);
    }
  };

  const fetchPages = async () => {
    setIsLoadingPages(true);
    try {
      const res = await fetch("/api/facebook/pages");
      const data = await res.json();
      if (data.success && data.pages) {
        setPages(data.pages);
        if (data.pages.length > 0 && !selectedPageId) {
          setSelectedPageId(data.pages[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load pages:", err);
    } finally {
      setIsLoadingPages(false);
    }
  };

  const fetchPosts = async (silent = false) => {
    try {
      const res = await fetch("/api/posts");
      const data = await res.json();
      if (data.success && data.posts) {
        setPosts(data.posts);
      }
    } catch (err) {
      if (!silent) console.error("Failed to load posts:", err);
    }
  };

  // Connect Mock/Demo Facebook Pages
  const handleConnectMockFacebook = async () => {
    setIsLoadingPages(true);
    try {
      const res = await fetch("/api/facebook/mock-connect", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setPages(data.pages);
        setSelectedPageId(data.selectedPageId || data.pages[0]?.id);
        showToast("success", "Connected Facebook Pages successfully (Dev/Demo Mode)!");
      } else {
        showToast("error", data.error || "Failed to connect Facebook account");
      }
    } catch (err: any) {
      showToast("error", err.message || "Connection failed");
    } finally {
      setIsLoadingPages(false);
    }
  };

  // Official Meta Facebook Login Redirect
  const handleConnectLiveFacebook = () => {
    window.location.href = "/api/facebook/auth?action=login";
  };

  // Disconnect Page
  const handleDisconnectPage = async (pageDbId: string) => {
    if (!confirm("Are you sure you want to disconnect this Facebook Page?")) return;
    try {
      const res = await fetch(`/api/facebook/pages?id=${pageDbId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        const remaining = pages.filter((p) => p.id !== pageDbId);
        setPages(remaining);
        setSelectedPageId(remaining.length > 0 ? remaining[0].id : "");
        showToast("info", "Facebook Page disconnected.");
      }
    } catch (err: any) {
      showToast("error", err.message || "Failed to disconnect");
    }
  };

  // Media (Single Video or Multiple Images) Upload handler
  const handleMediaFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Check if any video is included
    const hasVideo = files.some((f) =>
      ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo", "video/mpeg"].includes(f.type.toLowerCase())
    );

    if (hasVideo && files.length > 1) {
      showToast("error", "Videos must be uploaded individually. Please select only 1 video or multiple photos.");
      return;
    }

    setIsUploadingMedia(true);
    const formData = new FormData();
    for (const f of files) {
      formData.append("files", f);
    }

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        if (data.mediaType === "VIDEO") {
          setMediaUrls([]);
          setMediaPreviewUrl(data.url);
          setMediaType("VIDEO");
          showToast("success", "Video uploaded and ready!");
        } else {
          // Images: append to existing mediaUrls if any
          const newUrls = (data.urls || [data.url]) as string[];
          const combined = [...mediaUrls, ...newUrls];
          setMediaUrls(combined);
          setMediaPreviewUrl(combined[0]);
          setMediaType(combined.length > 1 ? "MULTI_IMAGE" : "IMAGE");
          showToast("success", `${newUrls.length} image(s) uploaded successfully!`);
        }
      } else {
        showToast("error", data.error || "Failed to upload files.");
      }
    } catch (err: any) {
      showToast("error", err.message || "Upload failed");
    } finally {
      setIsUploadingMedia(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveSingleMedia = (indexToRemove: number) => {
    const updated = mediaUrls.filter((_, idx) => idx !== indexToRemove);
    setMediaUrls(updated);
    if (updated.length === 0) {
      setMediaPreviewUrl(null);
      setMediaType("NONE");
    } else {
      setMediaPreviewUrl(updated[0]);
      setMediaType(updated.length > 1 ? "MULTI_IMAGE" : "IMAGE");
    }
  };

  const handleRemoveAllMedia = () => {
    setMediaUrls([]);
    setMediaPreviewUrl(null);
    setMediaType("NONE");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClearCaption = () => {
    if (caption.trim() && confirm("Clear draft caption?")) {
      setCaption("");
      localStorage.removeItem("fb_caption_draft");
      showToast("info", "Caption cleared.");
    }
  };

  const handleClearAll = () => {
    const hasContent = caption.trim() || mediaUrls.length > 0 || mediaPreviewUrl || publishDate || editingPostId;
    if (!hasContent) {
      showToast("info", "Composer is already empty.");
      return;
    }

    setCaption("");
    handleRemoveAllMedia();
    setPublishDate("");
    setPublishTime("20:30");
    setEditingPostId(null);
    setValidationErrors([]);
    try {
      localStorage.removeItem("fb_caption_draft");
      localStorage.removeItem("fb_scheduler_draft_v2");
    } catch (e) {}
    showToast("info", "All fields have been cleared!");
  };

  // Compute UTC Scheduled Date correctly from selected date, time, AND timezone
  const calculateScheduledUtc = (): Date | null => {
    if (!publishDate || !publishTime) return null;
    try {
      // Use the proper timezone-aware conversion (not browser-local)
      return getUtcDateFromLocal(publishDate, publishTime, timezone);
    } catch {
      return null;
    }
  };

  // Toggle Page selection in multi-page mode
  const handleTogglePageSelection = (pageId: string) => {
    if (selectedPageIds.includes(pageId)) {
      setSelectedPageIds(selectedPageIds.filter((id) => id !== pageId));
    } else {
      setSelectedPageIds([...selectedPageIds, pageId]);
    }
  };

  // Form Validation & Submit
  const handleSchedulePost = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: string[] = [];

    const effectivePageIds = isMultiPageMode
      ? selectedPageIds
      : selectedPageId
      ? [selectedPageId]
      : [];

    if (effectivePageIds.length === 0) {
      errors.push("Please select at least one Facebook Page.");
    }

    if (!caption.trim() && !mediaPreviewUrl && mediaUrls.length === 0) {
      errors.push("Please provide either a post caption, image(s), or a video.");
    }

    if (!publishDate) {
      errors.push("Please select a publish date.");
    }

    if (!publishTime) {
      errors.push("Please select a publish time.");
    }

    const scheduledUtcDate = calculateScheduledUtc();
    if (!scheduledUtcDate || isNaN(scheduledUtcDate.getTime())) {
      errors.push("Invalid date or time specified.");
    } else {
      // Validate future date/time (with 30s buffer)
      const now = new Date();
      if (scheduledUtcDate.getTime() < now.getTime() - 30000) {
        errors.push("Publish date and time must be in the future.");
      }
    }

    setValidationErrors(errors);
    if (errors.length > 0) {
      showToast("error", errors[0]);
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        facebookPageId: effectivePageIds[0],
        facebookPageIds: effectivePageIds,
        caption: caption.trim() || null,
        imageUrl: mediaType === "IMAGE" ? mediaPreviewUrl : mediaUrls[0] || null,
        videoUrl: mediaType === "VIDEO" ? mediaPreviewUrl : null,
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : mediaPreviewUrl ? [mediaPreviewUrl] : [],
        mediaType: mediaUrls.length > 1 ? "MULTI_IMAGE" : mediaType,
        scheduledAt: scheduledUtcDate!.toISOString(),
        timezone,
      };

      let res: Response;
      if (editingPostId) {
        res = await fetch(`/api/posts/${editingPostId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();

      if (data.success && (data.post || data.posts)) {
        const targetPageNames = pages
          .filter((p) => effectivePageIds.includes(p.id))
          .map((p) => p.pageName)
          .join(", ");
        
        // Format confirmation
        const dateObj = new Date(publishDate + "T12:00:00");
        const formattedDate = dateObj.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });

        const [hours, minutes] = publishTime.split(":");
        const hourNum = parseInt(hours, 10);
        const ampm = hourNum >= 12 ? "PM" : "AM";
        const hour12 = hourNum % 12 || 12;
        const formattedTime = `${hour12}:${minutes} ${ampm}`;

        setConfirmationModal({
          pageName: targetPageNames || "Facebook Page",
          dateFormatted: formattedDate,
          timeFormatted: formattedTime,
          timezone: timezone,
          utcString: scheduledUtcDate!.toUTCString(),
        });

        // Reset form
        setCaption("");
        localStorage.removeItem("fb_caption_draft");
        handleRemoveAllMedia();
        setEditingPostId(null);
        showToast("success", data.message || "Post scheduled successfully!");
        fetchPosts();
      } else {
        showToast("error", data.error || "Failed to schedule post.");
      }
    } catch (err: any) {
      showToast("error", err.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Immediate Publish Trigger / Retry
  const handlePublishNow = async (postId: string) => {
    setActionLoadingId(postId);
    try {
      const res = await fetch(`/api/posts/${postId}/publish`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", "Post published to Facebook successfully!");
        fetchPosts();
      } else {
        showToast("error", data.error || "Failed to publish post to Facebook");
        fetchPosts();
      }
    } catch (err: any) {
      showToast("error", err.message || "Publishing failed");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Cancel / Delete Scheduled Post
  const handleDeletePost = async (postId: string) => {
    if (!confirm("Are you sure you want to cancel and delete this scheduled post?")) return;
    setActionLoadingId(postId);
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        showToast("info", "Scheduled post cancelled.");
        setPosts((prev) => prev.filter((p) => p.id !== postId));
      } else {
        showToast("error", data.error || "Failed to cancel post.");
      }
    } catch (err: any) {
      showToast("error", err.message || "Delete failed");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Bulk Clear All Filtered / Scheduled Posts
  const handleClearAllPosts = async () => {
    const count = filteredPosts.length;
    if (count === 0) {
      showToast("info", "No posts to clear.");
      return;
    }

    const targetDesc =
      filterStatus === "ALL" && filterPageId === "ALL"
        ? `all ${count} post(s)`
        : `${count} post(s) currently filtered`;

    if (!confirm(`Are you sure you want to delete ${targetDesc}? This action cannot be undone.`)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const url = new URL("/api/posts", window.location.origin);
      if (filterStatus !== "ALL") url.searchParams.set("status", filterStatus);
      if (filterPageId !== "ALL") url.searchParams.set("pageId", filterPageId);

      const res = await fetch(url.toString(), {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", `Cleared ${data.count ?? count} post(s) successfully!`);
        fetchPosts();
      } else {
        showToast("error", data.error || "Failed to clear posts.");
      }
    } catch (err: any) {
      showToast("error", err.message || "Delete failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Edit Post (Loads back into form)
  const handleEditPost = (post: ScheduledPost) => {
    setEditingPostId(post.id);
    setSelectedPageId(post.facebookPageId);
    setCaption(post.caption || "");
    let parsedUrls: string[] = [];
    if (post.mediaUrls) {
      try {
        parsedUrls = JSON.parse(post.mediaUrls);
      } catch {
        parsedUrls = post.mediaUrls.split(",").map((s) => s.trim()).filter(Boolean);
      }
    }

    if (parsedUrls.length > 1) {
      setMediaUrls(parsedUrls);
      setMediaPreviewUrl(parsedUrls[0]);
      setMediaType("MULTI_IMAGE");
    } else if (post.videoUrl) {
      setMediaUrls([]);
      setMediaPreviewUrl(post.videoUrl);
      setMediaType("VIDEO");
    } else if (post.imageUrl || parsedUrls.length === 1) {
      const img = post.imageUrl || parsedUrls[0];
      setMediaUrls([img]);
      setMediaPreviewUrl(img);
      setMediaType("IMAGE");
    } else {
      setMediaUrls([]);
      setMediaPreviewUrl(null);
      setMediaType("NONE");
    }
    
    // Parse scheduled date
    const d = new Date(post.scheduledAt);
    const dateStr = d.toISOString().split("T")[0];
    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    setPublishDate(dateStr);
    setPublishTime(`${hours}:${mins}`);
    if (post.timezone) setTimezone(post.timezone);

    window.scrollTo({ top: 0, behavior: "smooth" });
    showToast("info", `Editing scheduled post. Update details and click "Update Scheduled Post".`);
  };

  const selectedPage = pages.find((p) => p.id === selectedPageId) || pages[0];

  // List of accounts targeted for multi-account preview
  const previewTargetPages = isMultiPageMode && selectedPageIds.length > 0
    ? pages.filter((p) => selectedPageIds.includes(p.id))
    : pages;

  // Active page currently displayed in the live post preview
  const activePreviewPage = (previewPageId ? pages.find((p) => p.id === previewPageId) : null)
    || (isMultiPageMode && previewTargetPages.length > 0 ? previewTargetPages[0] : null)
    || selectedPage;

  const filteredPosts = posts.filter((p) => {
    const matchesStatus = filterStatus === "ALL" || p.status === filterStatus;
    const matchesPage = filterPageId === "ALL" || p.facebookPageId === filterPageId;
    return matchesStatus && matchesPage;
  });

  const getStatusBadge = (status: ScheduledPost["status"]) => {
    switch (status) {
      case "SCHEDULED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3.5 h-3.5" /> Scheduled
          </span>
        );
      case "PUBLISHING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Publishing...
          </span>
        );
      case "PUBLISHED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> Published
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3.5 h-3.5" /> Failed
          </span>
        );
    }
  };

  const formatScheduledDisplay = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return isoString;
    }
  };

  const getTodayDateString = () => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5] pb-24">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl transition-all duration-300 border ${
            toast.type === "success"
              ? "bg-emerald-900 text-white border-emerald-700"
              : toast.type === "error"
              ? "bg-rose-900 text-white border-rose-700"
              : "bg-slate-900 text-white border-slate-700"
          }`}
        >
          {toast.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          {toast.type === "error" && <AlertCircle className="w-5 h-5 text-rose-400" />}
          {toast.type === "info" && <Info className="w-5 h-5 text-sky-400" />}
          <span className="text-sm font-medium">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="text-white/70 hover:text-white ml-2 text-sm font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Minimalist Calendar & Clock Logo */}
            <div className="relative w-10 h-10 rounded-xl bg-[#1877F2] flex items-center justify-center text-white shadow-sm ring-1 ring-blue-600/20">
              <Calendar className="w-5 h-5 stroke-[2.2]" />
              <div className="absolute -bottom-0.5 -right-0.5 w-4.5 h-4.5 rounded-full bg-white flex items-center justify-center shadow-xs">
                <Clock className="w-3.5 h-3.5 text-[#1877F2] stroke-[2.5]" />
              </div>
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight leading-tight">
                Facebook Post Scheduler
              </h1>
              <p className="text-[11px] text-slate-400 font-medium">Automated Post Publishing</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Mode Badge */}
            {isRealMetaConfigured ? (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Meta Graph API v21.0
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold" title="Simulated mode active - Add FACEBOOK_APP_ID in .env for live Meta Graph API">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                Dev / Demo Mode
              </div>
            )}

            <button
              onClick={() => {
                scheduledPostsSectionRef.current?.scrollIntoView({ behavior: "smooth" });
              }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
            >
              Queue ({posts.filter((p) => p.status === "SCHEDULED").length})
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        
        {/* Error Callout Banner if Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="mb-6 bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-rose-800">Please correct the following:</h3>
              <ul className="mt-1 list-disc list-inside text-xs text-rose-700 space-y-1">
                {validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Two Column Grid on Desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT COLUMN: CREATE POST FORM (7 Cols) */}
          <div className="lg:col-span-7 space-y-6">
            
            <div className="bg-white rounded-2xl p-6 shadow-card border border-slate-200">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#1877F2]"></span>
                  <h2 className="text-lg font-bold text-slate-900">
                    {editingPostId ? "Edit Scheduled Post" : "Create Facebook Post"}
                  </h2>
                </div>
                {editingPostId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPostId(null);
                      setCaption("");
                      handleRemoveAllMedia();
                    }}
                    className="text-xs text-slate-500 hover:text-slate-800 underline"
                  >
                    Cancel Editing
                  </button>
                )}
              </div>

              <form onSubmit={handleSchedulePost} className="mt-5 space-y-6">
                
                {/* 1. FACEBOOK PAGE SELECTION */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-semibold text-slate-800">
                      1. Facebook Page
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowAddPageModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#1877F2] hover:bg-blue-50 bg-white border border-blue-200 rounded-lg shadow-xs transition active:scale-95"
                    >
                      <span>+</span> Add Facebook Page
                    </button>
                  </div>

                  {isLoadingPages ? (
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center gap-2 text-slate-500 text-sm">
                      <RefreshCw className="w-4 h-4 animate-spin" /> Loading Facebook Pages...
                    </div>
                  ) : pages.length === 0 ? (
                    /* No Connected Pages State */
                    <div className="p-5 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-center space-y-3">
                      <div className="w-12 h-12 mx-auto rounded-full bg-blue-100 flex items-center justify-center text-[#1877F2]">
                        <Facebook className="w-6 h-6 fill-current" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800">No Facebook Page Connected</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Connect one or multiple Facebook Pages you want to schedule posts for.
                        </p>
                      </div>
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => setShowAddPageModal(true)}
                          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1877F2] hover:bg-[#166fe5] text-white text-xs font-bold rounded-xl shadow-sm transition"
                        >
                          <Facebook className="w-4 h-4 fill-current" /> + Connect / Add Facebook Page
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Multi-Page Selector Cards */
                    <div className="space-y-3">
                      {/* Mode Toggle: Single Page vs Multi-Page */}
                      {pages.length > 1 && (
                        <div className="flex items-center justify-between p-2 rounded-xl bg-slate-100/70 border border-slate-200">
                          <span className="text-xs font-semibold text-slate-700 pl-1">
                            Publishing Destination:
                          </span>
                          <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200 shadow-xs">
                            <button
                              type="button"
                              onClick={() => {
                                setIsMultiPageMode(false);
                                if (!selectedPageId && pages.length > 0) setSelectedPageId(pages[0].id);
                              }}
                              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition ${
                                !isMultiPageMode ? "bg-[#1877F2] text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                              }`}
                            >
                              Single Page
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsMultiPageMode(true);
                                if (selectedPageIds.length === 0) setSelectedPageIds(pages.map((p) => p.id));
                              }}
                              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition ${
                                isMultiPageMode ? "bg-[#1877F2] text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                              }`}
                            >
                              Cross-Post to Multiple Pages ({pages.length})
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Multi-Page Checkbox List */}
                      {isMultiPageMode && pages.length > 1 ? (
                        <div className="space-y-2 p-3.5 rounded-xl border border-blue-200 bg-blue-50/40">
                          <div className="flex items-center justify-between pb-2 border-b border-blue-100">
                            <span className="text-xs font-bold text-slate-800">
                              Selected Pages ({selectedPageIds.length}/{pages.length}):
                            </span>
                            <div className="flex items-center gap-2 text-[11px]">
                              <button
                                type="button"
                                onClick={() => setSelectedPageIds(pages.map((p) => p.id))}
                                className="text-[#1877F2] font-semibold hover:underline"
                              >
                                Select All
                              </button>
                              <span className="text-slate-300">|</span>
                              <button
                                type="button"
                                onClick={() => setSelectedPageIds([])}
                                className="text-slate-500 hover:text-slate-800"
                              >
                                Clear
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                            {pages.map((p) => {
                              const isChecked = selectedPageIds.includes(p.id);
                              return (
                                <div
                                  key={p.id}
                                  onClick={() => handleTogglePageSelection(p.id)}
                                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition select-none ${
                                    isChecked
                                      ? "bg-white border-[#1877F2] ring-1 ring-[#1877F2] shadow-xs"
                                      : "bg-white/60 border-slate-200 opacity-60 hover:opacity-100"
                                  }`}
                                >
                                  <div
                                    className={`w-4 h-4 rounded flex items-center justify-center text-white text-[10px] shrink-0 font-bold transition ${
                                      isChecked ? "bg-[#1877F2]" : "border border-slate-300 bg-white"
                                    }`}
                                  >
                                    {isChecked && "✓"}
                                  </div>
                                  <img
                                    src={p.pictureUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80"}
                                    alt={p.pageName}
                                    className="w-6 h-6 rounded-full object-cover shrink-0"
                                  />
                                  <span className="text-xs font-semibold text-slate-800 truncate">{p.pageName}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        /* Single Page Selector */
                        <div className="space-y-2">
                          {pages.length > 1 && (
                            <div className="flex flex-wrap gap-2">
                              {pages.map((p) => {
                                const isSelected = p.id === selectedPageId;
                                return (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => setSelectedPageId(p.id)}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                                      isSelected
                                        ? "bg-blue-50 border-[#1877F2] text-[#1877F2] shadow-xs ring-1 ring-[#1877F2]"
                                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                                    }`}
                                  >
                                    <img
                                      src={p.pictureUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80"}
                                      alt={p.pageName}
                                      className="w-5 h-5 rounded-full object-cover"
                                    />
                                    <span>{p.pageName}</span>
                                    {isSelected && <Check className="w-3.5 h-3.5 text-[#1877F2]" />}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/60 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <img
                                src={selectedPage?.pictureUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80"}
                                alt={selectedPage?.pageName || "Facebook Page"}
                                className="w-12 h-12 rounded-full object-cover border border-white shadow-xs"
                              />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900 text-sm">{selectedPage?.pageName}</span>
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                    <Check className="w-2.5 h-2.5" /> Active Target
                                  </span>
                                </div>
                                <p className="text-xs text-slate-500">{selectedPage?.category || "Facebook Page"}</p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleDisconnectPage(selectedPage?.id)}
                              className="text-xs text-slate-400 hover:text-rose-600 px-2 py-1 transition"
                              title="Disconnect Page"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                        <span className="flex items-center gap-1 text-slate-500">
                          <ShieldCheck className="w-3.5 h-3.5 text-blue-600" /> Token encrypted with AES-256-GCM
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowAddPageModal(true)}
                          className="text-[#1877F2] hover:underline font-semibold"
                        >
                          + Add another Facebook page
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. POST CAPTION */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="caption-input" className="block text-sm font-semibold text-slate-800">
                      2. Post Caption
                    </label>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-slate-500">
                        Characters: <strong className="text-slate-800">{caption.length}</strong>
                      </span>
                      {caption.length > 0 && (
                        <button
                          type="button"
                          onClick={handleClearCaption}
                          className="text-xs font-medium text-slate-400 hover:text-rose-600 transition"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  <textarea
                    id="caption-input"
                    rows={4}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Write your Facebook caption here..."
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 placeholder-slate-400 text-sm focus:outline-hidden focus:ring-2 focus:ring-[#1877F2] focus:border-transparent transition resize-y"
                  />
                  <p className="text-[11px] text-slate-400">
                    Draft is automatically autosaved in your browser.
                  </p>
                </div>

                {/* 3. UPLOAD MEDIA (MULTIPLE IMAGES OR VIDEO) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <label className="block text-sm font-semibold text-slate-800">
                        3. Attach Media
                      </label>
                      {mediaUrls.length > 1 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-blue-100 text-[#1877F2] px-2 py-0.5 rounded-full">
                          <ImageIcon className="w-3 h-3" /> Multi-Photo Album ({mediaUrls.length} photos)
                        </span>
                      )}
                      {mediaType === "VIDEO" && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                          <Film className="w-3 h-3" /> Video Attached
                        </span>
                      )}
                    </div>
                    {(mediaUrls.length > 0 || mediaPreviewUrl) && (
                      <button
                        type="button"
                        onClick={handleRemoveAllMedia}
                        className="text-xs text-rose-500 hover:text-rose-700 font-semibold"
                      >
                        Remove All
                      </button>
                    )}
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleMediaFileChange}
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                    multiple
                    className="hidden"
                    id="media-upload"
                  />

                  {/* Video Attachment View */}
                  {mediaType === "VIDEO" && mediaPreviewUrl ? (
                    <div className="relative rounded-xl border border-purple-200 p-3 bg-purple-50/50 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="relative w-16 h-16 rounded-lg bg-slate-900 overflow-hidden shrink-0 flex items-center justify-center border border-slate-300">
                          <video src={mediaPreviewUrl} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <Play className="w-5 h-5 text-white fill-white" />
                          </div>
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-bold text-slate-800 truncate">Video attached</p>
                          <p className="text-[11px] text-purple-700 font-medium">Ready for scheduled publish</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleRemoveAllMedia}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ) : mediaUrls.length > 0 ? (
                    /* Multi-Image Gallery Grid in Composer */
                    <div className="space-y-3 p-3.5 rounded-2xl border border-slate-200 bg-slate-50">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700">
                          {mediaUrls.length} Photo{mediaUrls.length > 1 ? "s" : ""} Attached
                        </span>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-1 text-xs font-bold text-[#1877F2] hover:bg-blue-50 px-2 py-1 rounded-lg transition"
                        >
                          + Add More Photos
                        </button>
                      </div>

                      {/* Photo Thumbnail Grid */}
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                        {mediaUrls.map((url, idx) => (
                          <div
                            key={idx}
                            className="relative group aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-200 shadow-xs"
                          >
                            <img src={url} alt={`Upload ${idx + 1}`} className="w-full h-full object-cover" />
                            
                            {/* Remove single image button */}
                            <button
                              type="button"
                              onClick={() => handleRemoveSingleMedia(idx)}
                              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 hover:bg-rose-600 text-white flex items-center justify-center text-[10px] transition shadow-xs"
                              title="Remove photo"
                            >
                              ✕
                            </button>

                            {/* Badge order */}
                            <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                              #{idx + 1}
                            </div>
                          </div>
                        ))}

                        {/* Add More Photos Box */}
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="aspect-square rounded-xl border-2 border-dashed border-slate-300 hover:border-[#1877F2] hover:bg-blue-50/50 flex flex-col items-center justify-center text-slate-400 hover:text-[#1877F2] cursor-pointer transition"
                        >
                          <span className="text-xl font-bold">+</span>
                          <span className="text-[10px] font-bold mt-0.5">Add</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Empty Upload Dropzone */
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-200 hover:border-[#1877F2] rounded-xl p-5 bg-slate-50/50 hover:bg-blue-50/20 text-center cursor-pointer transition flex flex-col items-center justify-center gap-1.5"
                    >
                      {isUploadingMedia ? (
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                          <RefreshCw className="w-4 h-4 animate-spin text-[#1877F2]" /> Uploading media files...
                        </div>
                      ) : (
                        <>
                          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-[#1877F2]">
                            <Upload className="w-5 h-5" />
                          </div>
                          <p className="text-xs font-bold text-slate-800">
                            Upload Photos (Multi-Select) or Video
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Select multiple images to create a multi-photo post · Supports JPG, PNG, WEBP, MP4
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* 4 & 5. SCHEDULE DATE & TIME & TIMEZONE */}
                <div className="space-y-4 pt-2 border-t border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-800">
                    4. Schedule Date & Time
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Date Picker */}
                    <div className="space-y-1.5">
                      <label htmlFor="publish-date" className="block text-xs font-semibold text-slate-700">
                        Publish Date
                      </label>
                      <div className="relative">
                        <input
                          type="date"
                          id="publish-date"
                          min={getTodayDateString()}
                          value={publishDate}
                          onChange={(e) => setPublishDate(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-hidden focus:ring-2 focus:ring-[#1877F2]"
                          required
                        />
                      </div>
                    </div>

                    {/* Time Picker */}
                    <div className="space-y-1.5">
                      <label htmlFor="publish-time" className="block text-xs font-semibold text-slate-700">
                        Publish Time
                      </label>
                      <div className="relative">
                        <input
                          type="time"
                          id="publish-time"
                          value={publishTime}
                          onChange={(e) => setPublishTime(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-hidden focus:ring-2 focus:ring-[#1877F2]"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Timezone Selector */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label htmlFor="timezone-select" className="block text-xs font-semibold text-slate-700">
                        Timezone
                      </label>
                      <span className="text-[11px] text-slate-400">Stored internally in UTC</span>
                    </div>
                    <div className="relative">
                      <select
                        id="timezone-select"
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="w-full appearance-none px-3.5 py-2.5 bg-white rounded-xl border border-slate-200 text-slate-800 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-[#1877F2]"
                      >
                        {COMMON_TIMEZONES.map((tz) => (
                          <option key={tz.value} value={tz.value}>
                            {tz.label}
                          </option>
                        ))}
                      </select>
                      <Globe className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* 6. SCHEDULE BUTTON */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting || pages.length === 0}
                    className={`w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold text-sm shadow-md transition ${
                      isSubmitting || pages.length === 0
                        ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                        : "bg-[#1877F2] hover:bg-[#166fe5] text-white active:scale-[0.99]"
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Scheduling Facebook Post...
                      </>
                    ) : editingPostId ? (
                      <>
                        <Edit3 className="w-4 h-4" /> Update Scheduled Post
                      </>
                    ) : (
                      <>
                        <Calendar className="w-4 h-4" /> Schedule Facebook Post
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* RIGHT COLUMN: REAL-TIME FACEBOOK POST PREVIEW (5 Cols) */}
          <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">

            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Post Preview
              </span>
              <span className="text-[11px] text-slate-400">
                {pages.length > 1 ? `${pages.length} accounts` : "Live simulated feed render"}
              </span>
            </div>

            {/* One full Facebook post preview card per account */}
            {(pages.length > 0 ? pages : [null]).map((p) => {
              const pageName = p?.pageName || "Facebook Page Name";
              const pictureUrl = p?.pictureUrl || null;
              const isTarget = p
                ? (isMultiPageMode ? selectedPageIds.includes(p.id) : selectedPageId === p.id)
                : false;

              return (
                <div key={p?.id || "default"} className="space-y-0">
                  {/* Account label bar — only shown when multiple accounts */}
                  {pages.length > 1 && (
                    <div className={`flex items-center justify-between px-4 py-2 rounded-t-2xl border border-b-0 ${isTarget ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-slate-200"}`}>
                      <div className="flex items-center gap-2">
                        {pictureUrl ? (
                          <img src={pictureUrl} alt={pageName} className="w-5 h-5 rounded-full object-cover border border-slate-200" />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-[#1877F2] to-blue-400 text-white flex items-center justify-center text-[9px] font-bold">
                            {pageName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="text-[11px] font-bold text-slate-700">{pageName}</span>
                      </div>
                      {isTarget ? (
                        <span className="text-[10px] font-bold text-[#1877F2] bg-blue-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                          Will Post
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Not selected</span>
                      )}
                    </div>
                  )}

                  {/* Facebook Post Card */}
                  <div className={`bg-white border border-slate-200 shadow-card overflow-hidden ${pages.length > 1 ? "rounded-b-2xl" : "rounded-2xl"}`}>
                    {/* Post Header */}
                    <div className="p-3.5 sm:p-4 flex items-center justify-between border-b border-slate-100">
                      <div className="flex items-center gap-2.5">
                        {pictureUrl ? (
                          <img src={pictureUrl} alt="Page Profile" className="w-10 h-10 rounded-full object-cover border border-slate-200 shadow-xs" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#1877F2] to-blue-400 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                            {pageName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <h4 className="font-bold text-[#050505] text-[14px] leading-tight hover:underline cursor-pointer">{pageName}</h4>
                          <div className="flex items-center gap-1 text-[12px] text-[#65676B] mt-0.5 font-normal">
                            <span>Just now</span>
                            <span>·</span>
                            <svg className="w-3 h-3 text-[#65676B] fill-current" viewBox="0 0 16 16">
                              <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm5.93 7H11.9a12.3 12.3 0 00-.97-4.14A6.02 6.02 0 0113.93 7zM8 1.96c.72 1.34 1.25 3.12 1.45 5.04H6.55C6.75 5.08 7.28 3.3 8 1.96zM2.07 9h2.03c.18 1.92.71 3.7 1.43 5.04A6.02 6.02 0 012.07 9zm2.03-2H2.07A6.02 6.02 0 015.07 2.86 12.3 12.3 0 004.1 7zm3.9 7.04c-.72-1.34-1.25-3.12-1.45-5.04h2.9c-.2 1.92-.73 3.7-1.45 5.04zM9.45 9H6.55c.2-1.92.73-3.7 1.45-5.04.72 1.34 1.25 3.12 1.45 5.04zm1.48 4.14c.42-.92.75-2.22.97-4.14h2.03a6.02 6.02 0 01-3 4.14z"/>
                            </svg>
                            <span>Public</span>
                          </div>
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-[#65676B] cursor-pointer transition">
                        <svg className="w-5 h-5 fill-current" viewBox="0 0 20 20">
                          <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                        </svg>
                      </div>
                    </div>

                    {/* Caption — only shown for selected accounts */}
                    <div className="px-4 py-3">
                      {!isTarget && pages.length > 1 ? (
                        <p className="text-sm text-slate-300 italic select-none">Select this account to preview post here...</p>
                      ) : caption ? (
                        <p className="text-[14px] text-[#050505] whitespace-pre-line leading-relaxed break-words">{caption}</p>
                      ) : (
                        <p className="text-sm text-slate-400 italic">Caption text appears here...</p>
                      )}
                    </div>

                    {/* Media — only shown for selected accounts */}
                    {isTarget && mediaType === "VIDEO" && mediaPreviewUrl ? (
                      <div className="w-full max-h-[320px] bg-slate-900 overflow-hidden flex items-center justify-center border-t border-b border-slate-100">
                        <video src={mediaPreviewUrl} controls playsInline className="w-full max-h-[320px] object-contain bg-black" />
                      </div>
                    ) : isTarget && mediaUrls.length > 1 ? (
                      <div className="w-full border-t border-b border-slate-100 bg-slate-900 overflow-hidden">
                        {mediaUrls.length === 2 ? (
                          <div className="grid grid-cols-2 gap-1 h-[240px]">
                            <img src={mediaUrls[0]} alt="Post 1" className="w-full h-full object-cover" />
                            <img src={mediaUrls[1]} alt="Post 2" className="w-full h-full object-cover" />
                          </div>
                        ) : mediaUrls.length === 3 ? (
                          <div className="grid grid-cols-2 gap-1 h-[280px]">
                            <div className="h-full"><img src={mediaUrls[0]} alt="Post 1" className="w-full h-full object-cover" /></div>
                            <div className="grid grid-rows-2 gap-1 h-full">
                              <img src={mediaUrls[1]} alt="Post 2" className="w-full h-full object-cover" />
                              <img src={mediaUrls[2]} alt="Post 3" className="w-full h-full object-cover" />
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 grid-rows-2 gap-1 h-[280px]">
                            <img src={mediaUrls[0]} alt="Post 1" className="w-full h-full object-cover" />
                            <img src={mediaUrls[1]} alt="Post 2" className="w-full h-full object-cover" />
                            <img src={mediaUrls[2]} alt="Post 3" className="w-full h-full object-cover" />
                            <div className="relative w-full h-full">
                              <img src={mediaUrls[3]} alt="Post 4" className="w-full h-full object-cover" />
                              {mediaUrls.length > 4 && (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-2xl font-bold">+{mediaUrls.length - 4}</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : isTarget && (mediaPreviewUrl || mediaUrls.length === 1) ? (
                      <div className="w-full max-h-[320px] bg-slate-900 overflow-hidden flex items-center justify-center border-t border-b border-slate-100">
                        <img src={mediaPreviewUrl || mediaUrls[0]} alt="Facebook Preview" className="w-full h-auto object-cover max-h-[320px]" />
                      </div>
                    ) : isTarget ? (
                      <div className="mx-4 my-2 p-5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 text-center text-slate-400 text-xs">
                        [ Attached photo(s) or video will appear here in simulated Facebook layout ]
                      </div>
                    ) : null}

                    {/* Reaction Counts */}
                    <div className="px-4 py-2.5 flex items-center justify-between text-[13px] text-[#65676B] border-b border-slate-100 select-none">
                      <div className="flex items-center gap-1.5">
                        <div className="flex items-center -space-x-1">
                          <div className="w-4.5 h-4.5 rounded-full bg-[#1877F2] text-white flex items-center justify-center shadow-xs border border-white z-10">
                            <svg className="w-2.5 h-2.5 fill-white" viewBox="0 0 16 16"><path d="M8.864.046C7.908-.193 7.02.53 6.956 1.466c-.072 1.051-.23 2.016-.428 2.59-.125.36-.314.7-.547 1.012l-1.34 1.785a.5.5 0 0 0-.1.3l-.001 6.5a.5.5 0 0 0 .5.5h6.634a2 2 0 0 0 1.92-1.447l1.414-4.95A2 2 0 0 0 13.088 5H9.72a.5.5 0 0 1-.491-.592l.38-2.28c.148-.888-.337-1.748-1.18-1.996zM3 6.5a.5.5 0 0 1 .5-.5h.5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5h-.5a.5.5 0 0 1-.5-.5v-7z"/></svg>
                          </div>
                          <div className="w-4.5 h-4.5 rounded-full bg-[#FA383E] text-white flex items-center justify-center shadow-xs border border-white">
                            <svg className="w-2.5 h-2.5 fill-white" viewBox="0 0 16 16"><path fillRule="evenodd" d="M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314z"/></svg>
                          </div>
                        </div>
                        <span className="text-xs font-normal">24</span>
                      </div>
                      <div className="text-xs font-normal flex items-center gap-2"><span>3 comments</span><span>·</span><span>1 share</span></div>
                    </div>

                    {/* Action Bar */}
                    <div className="px-2 py-1 grid grid-cols-3 gap-1 text-[#65676B] font-semibold text-[13px]">
                      <button type="button" className="flex items-center justify-center gap-2 py-1.5 hover:bg-[#F2F2F2] rounded-lg transition active:scale-95 hover:text-[#1877F2]">
                        <svg className="w-4 h-4 fill-none stroke-current stroke-[1.8]" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                        <span>Like</span>
                      </button>
                      <button type="button" className="flex items-center justify-center gap-2 py-1.5 hover:bg-[#F2F2F2] rounded-lg transition active:scale-95">
                        <svg className="w-4 h-4 fill-none stroke-current stroke-[1.8]" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                        <span>Comment</span>
                      </button>
                      <button type="button" className="flex items-center justify-center gap-2 py-1.5 hover:bg-[#F2F2F2] rounded-lg transition active:scale-95">
                        <svg className="w-4 h-4 fill-none stroke-current stroke-[1.8]" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>
                        <span>Share</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            <p className="text-[11px] text-center text-slate-400 pb-2">
              Live simulated Facebook Page Feed preview. Exact rendering matches Facebook desktop & mobile clients.
            </p>
          </div>

        </div>

        {/* BOTTOM SECTION: SCHEDULED POSTS DASHBOARD */}
        <section ref={scheduledPostsSectionRef} className="mt-14 space-y-6">
          
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Scheduled Posts</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Automatically published by the server scheduler when the scheduled time arrives.
              </p>
            </div>

            {/* Filter Controls (Status & Account) */}
            <div className="flex flex-wrap items-center gap-2.5">
              
              {/* Filter by Account / Page */}
              {pages.length > 1 && (
                <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-xs font-semibold text-slate-500">Account:</span>
                  <select
                    value={filterPageId}
                    onChange={(e) => setFilterPageId(e.target.value)}
                    className="text-xs font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                  >
                    <option value="ALL">All Accounts ({posts.length})</option>
                    {pages.map((p) => {
                      const count = posts.filter((post) => post.facebookPageId === p.id).length;
                      return (
                        <option key={p.id} value={p.id}>
                          {p.pageName} ({count})
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-xs">
                {(["ALL", "SCHEDULED", "PUBLISHED", "FAILED"] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      filterStatus === status
                        ? "bg-[#1877F2] text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    {status === "ALL" ? "All Status" : status}
                  </button>
                ))}
              </div>

              {/* Clear All Posts Button */}
              {filteredPosts.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllPosts}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition active:scale-95 shadow-xs disabled:opacity-50"
                  title="Delete all posts in current view"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear All ({filteredPosts.length})</span>
                </button>
              )}

            </div>
          </div>

          {/* Posts Grid / List */}
          {filteredPosts.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-card space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                <Calendar className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">No {filterStatus !== "ALL" ? filterStatus.toLowerCase() : ""} posts found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {filterPageId !== "ALL"
                  ? "No posts scheduled for this specific account under the selected status."
                  : "Create a Facebook post using the form above and select a publish date/time to schedule it."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPosts.map((post) => {
                let cardMediaUrls: string[] = [];
                if (post.mediaUrls) {
                  try {
                    cardMediaUrls = JSON.parse(post.mediaUrls);
                  } catch {
                    cardMediaUrls = post.mediaUrls.split(",").map((s) => s.trim()).filter(Boolean);
                  }
                }

                return (
                  <div
                    key={post.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden flex flex-col justify-between hover:border-slate-300 transition"
                  >
                    <div>
                      {/* Post Card Header */}
                      <div className="p-4 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          <img
                            src={post.facebookPage?.pictureUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80"}
                            alt={post.facebookPage?.pageName || "Page"}
                            className="w-8 h-8 rounded-full object-cover shrink-0"
                          />
                          <span className="font-bold text-xs text-slate-800 truncate">
                            {post.facebookPage?.pageName || "Facebook Page"}
                          </span>
                        </div>

                        {getStatusBadge(post.status)}
                      </div>

                      {/* Post Content */}
                      <div className="p-4 space-y-3">
                        {/* Media (Video, Multi-Image, or Single Image) Thumbnail */}
                        {post.videoUrl ? (
                          <div className="relative w-full h-36 rounded-xl bg-slate-950 overflow-hidden border border-slate-200">
                            <video
                              src={post.videoUrl}
                              controls
                              preload="metadata"
                              className="w-full h-full object-contain"
                            />
                            <div className="absolute top-2 left-2 pointer-events-none">
                              <span className="inline-flex items-center gap-1 bg-black/70 text-white text-[10px] font-bold px-2 py-0.5 rounded-md backdrop-blur-xs">
                                <Film className="w-2.5 h-2.5" /> Video
                              </span>
                            </div>
                          </div>
                        ) : cardMediaUrls.length > 1 ? (
                          /* Multi-Photo Collage on Post Card */
                          <div className="relative w-full h-36 rounded-xl overflow-hidden border border-slate-200 grid grid-cols-2 gap-0.5 bg-slate-100">
                            <img src={cardMediaUrls[0]} alt="Media 1" className="w-full h-full object-cover" />
                            <div className="relative w-full h-full">
                              <img src={cardMediaUrls[1]} alt="Media 2" className="w-full h-full object-cover" />
                              {cardMediaUrls.length > 2 && (
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xs font-bold">
                                  +{cardMediaUrls.length - 2} more
                                </div>
                              )}
                            </div>
                            <div className="absolute top-2 left-2">
                              <span className="inline-flex items-center gap-1 bg-black/70 text-white text-[10px] font-bold px-2 py-0.5 rounded-md backdrop-blur-xs">
                                <ImageIcon className="w-2.5 h-2.5" /> {cardMediaUrls.length} Photos
                              </span>
                            </div>
                          </div>
                        ) : post.imageUrl || cardMediaUrls.length === 1 ? (
                          <div className="relative w-full h-32 rounded-xl bg-slate-100 overflow-hidden border border-slate-100">
                            <img
                              src={post.imageUrl || cardMediaUrls[0]}
                              alt="Post Media"
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute top-2 left-2">
                              <span className="inline-flex items-center gap-1 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-md backdrop-blur-xs">
                                <ImageIcon className="w-2.5 h-2.5" /> Image
                              </span>
                            </div>
                          </div>
                        ) : null}

                      {/* Caption text */}
                      {post.caption ? (
                        <p className="text-xs text-slate-800 line-clamp-3 leading-relaxed">
                          &ldquo;{post.caption}&rdquo;
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 italic">No text caption</p>
                      )}

                      {/* Schedule details */}
                      <div className="pt-2 border-t border-slate-100 space-y-1 text-[11px] text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-medium text-slate-700">
                            {formatScheduledDisplay(post.scheduledAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <Globe className="w-3.5 h-3.5" />
                          <span>{post.timezone || "UTC"}</span>
                        </div>

                        {/* Facebook Post ID if published */}
                        {post.facebookPostId && (
                          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-emerald-700 bg-emerald-50 px-2 py-1 rounded text-[10px]">
                            <span className="font-mono truncate">ID: {post.facebookPostId}</span>
                            <span className="font-bold">Published</span>
                          </div>
                        )}

                        {/* Error Message if Failed */}
                        {post.status === "FAILED" && post.errorMessage && (
                          <div className="mt-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] space-y-1">
                            <p className="font-bold flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5 text-rose-600" /> Publishing Failed
                            </p>
                            <p className="text-rose-700 leading-snug">{post.errorMessage}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Actions Footer */}
                  <div className="p-3 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {post.status === "SCHEDULED" && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleEditPost(post)}
                            className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePost(post.id)}
                            className="px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          >
                            Cancel
                          </button>
                        </>
                      )}

                      {post.status === "FAILED" && (
                        <>
                          <button
                            type="button"
                            onClick={() => handlePublishNow(post.id)}
                            disabled={actionLoadingId === post.id}
                            className="px-2.5 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition flex items-center gap-1"
                          >
                            {actionLoadingId === post.id ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3 h-3" />
                            )}
                            Retry Post
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePost(post.id)}
                            className="px-2 py-1.5 text-xs font-medium text-slate-500 hover:text-rose-600 transition"
                          >
                            Dismiss
                          </button>
                        </>
                      )}

                      {post.status === "PUBLISHED" && (
                        <button
                          type="button"
                          onClick={() => handleDeletePost(post.id)}
                          className="px-2 py-1 text-xs text-slate-400 hover:text-slate-600 transition"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {/* Instant Force Publish Button (Useful for testing) */}
                    {post.status === "SCHEDULED" && (
                      <button
                        type="button"
                        onClick={() => handlePublishNow(post.id)}
                        disabled={actionLoadingId === post.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-[#1877F2] hover:bg-blue-50 rounded-lg transition"
                        title="Publish immediately without waiting for scheduled time"
                      >
                        {actionLoadingId === post.id ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Send className="w-3 h-3" />
                        )}
                        Publish Now
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        </section>

      </main>

      {/* CONFIRMATION MODAL */}
      {confirmationModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-100 space-y-6 animate-in fade-in zoom-in-95 duration-200">
            
            <div className="text-center space-y-2">
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Post Scheduled Successfully</h3>
              <p className="text-xs text-slate-500">
                Your post is registered in the background queue and will be published automatically.
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-3 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Facebook Page:</span>
                <strong className="text-slate-900">{confirmationModal.pageName}</strong>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Date:</span>
                <strong className="text-slate-900">{confirmationModal.dateFormatted}</strong>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Time:</span>
                <strong className="text-slate-900">{confirmationModal.timeFormatted}</strong>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-500">Timezone:</span>
                <strong className="text-slate-900">{confirmationModal.timezone}</strong>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => {
                  setConfirmationModal(null);
                  scheduledPostsSectionRef.current?.scrollIntoView({ behavior: "smooth" });
                }}
                className="w-full py-3 bg-[#1877F2] hover:bg-[#166fe5] text-white text-xs font-bold rounded-xl transition shadow-md"
              >
                View in Scheduled Posts
              </button>
              <button
                type="button"
                onClick={() => setConfirmationModal(null)}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
              >
                Create Another Post
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ADD FACEBOOK PAGE MODAL — Guided Wizard */}
      {showAddPageModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 relative my-auto flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="flex items-center justify-between p-5 sm:p-6 pb-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 flex items-center justify-center text-[#1877F2]">
                  <Facebook className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Connect a Facebook Page</h3>
                  <p className="text-xs text-slate-500">Add any Facebook Page to your scheduler</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddPageModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-100 transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">

              {/* 1-Click Facebook Login */}
              {isRealMetaConfigured && (
                <div className="p-4 rounded-2xl border border-[#1877F2]/30 bg-blue-50/60 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1877F2] uppercase tracking-wider">⚡ Facebook OAuth Login</span>
                    <span className="text-[10px] bg-[#1877F2] text-white px-2 py-0.5 rounded-full font-bold">1-Click</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Log in with Facebook and all Pages you manage will be imported automatically.
                  </p>
                  <button
                    type="button"
                    onClick={() => { handleConnectLiveFacebook(); setShowAddPageModal(false); }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#1877F2] hover:bg-[#166fe5] text-white text-sm font-bold rounded-xl shadow-sm transition active:scale-95"
                  >
                    <Facebook className="w-4 h-4 fill-current" /> Continue with Facebook
                  </button>
                </div>
              )}

              {/* Divider */}
              <div className="relative flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">or connect via token</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              {/* Token Input Form (Primary & Prominent) */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const target = e.target as any;
                  const pageId = target.modalPageId?.value?.trim() || "";
                  const token = target.modalPageToken?.value?.trim() || "";
                  if (!token) {
                    showToast("error", "Please paste your Access Token.");
                    return;
                  }
                  setIsAddingPage(true);
                  try {
                    const res = await fetch("/api/facebook/manual-connect", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ pageId, token }),
                    });
                    const data = await res.json();
                    if (data.success) {
                      showToast("success", data.message || "Connected successfully!");
                      await fetchPages();
                      if (data.page?.id) setSelectedPageId(data.page.id);
                      setShowAddPageModal(false);
                    } else {
                      showToast("error", data.error || "Failed to connect. Check your Token.");
                    }
                  } catch (err: any) {
                    showToast("error", err.message || "Connection failed");
                  } finally {
                    setIsAddingPage(false);
                  }
                }}
                className="space-y-3.5"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-800">
                      Facebook Access Token <span className="text-[#1877F2] font-semibold">(Page or User Token)</span>
                    </label>
                    <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                      ✓ Auto-Detects Page
                    </span>
                  </div>
                  <input
                    name="modalPageToken"
                    type="password"
                    placeholder="Paste EAAB... token here"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1877F2] transition"
                    required
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    🔒 Encrypted with AES-256-GCM. Page ID and details are auto-detected.
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Page ID <span className="text-slate-400 font-normal">(Optional — leave blank to auto-detect)</span>
                  </label>
                  <input
                    name="modalPageId"
                    placeholder="Optional, e.g. 109823485023910"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#1877F2] transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isAddingPage}
                  className="w-full py-3 bg-[#1877F2] hover:bg-[#166fe5] text-white text-sm font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-md active:scale-95 disabled:opacity-60"
                >
                  {isAddingPage ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Auto-Detecting & Connecting...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" /> Auto-Detect & Connect Page
                    </>
                  )}
                </button>
              </form>

              {/* How to get Token (Collapsible / Guide Box) */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs text-slate-600">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-xs">Need an Access Token?</span>
                  <a
                    href="https://developers.facebook.com/tools/explorer/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-bold text-[#1877F2] hover:underline text-[11px]"
                  >
                    <ExternalLink className="w-3 h-3" /> Open Graph API Explorer ↗
                  </a>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  In Graph API Explorer: Select your App → Click <strong>Generate Access Token</strong> → Copy the token and paste it above!
                </p>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
