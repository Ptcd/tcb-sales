"use client";

import { useState, useEffect } from "react";
import { X, Phone, Mail, MapPin, ExternalLink, Star, MessageCircle, Activity, MessageSquare, Zap, CreditCard, Calendar, Clock, Rocket, Code, DollarSign, CheckCircle, Lock, Eye, Settings, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import type { BusinessResult, LeadNote, LeadNotification } from "@/lib/types";
import ActivityTimeline from "@/components/ActivityTimeline";
import ClientStatusBadge from "@/components/ClientStatusBadge";
import { StartTrialModal } from "@/components/StartTrialModal";
import toast from "react-hot-toast";

// Inline client timeline content
function ClientTimelineContent({ leadId }: { leadId: string }) {
  const [notifications, setNotifications] = useState<LeadNotification[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, [leadId]);

  const fetchNotifications = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/notifications/lead-notifications?lead_id=${leadId}&unread_only=false&limit=50`);
      if (!response.ok) throw new Error("Failed to fetch notifications");
      const data = await response.json();
      setNotifications(data.notifications || []);
    } catch (error) {
      console.error("Error fetching client timeline:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getEventDescription = (notification: LeadNotification): string => {
    const payload = notification.payload || {};
    switch (notification.eventType) {
      case "trial_started":
        return `Started trial${payload.plan ? ` on ${payload.plan} plan` : ""}`;
      case "password_set":
        return "Password set (activation gate passed)";
      case "first_login":
        return "Logged in for the first time";
      case "calculator_viewed":
        return "Viewed calculator settings";
      case "calculator_modified":
        return "Saved changes to calculator";
      case "embed_snippet_copied":
        return "Copied embed code";
      case "first_lead_received":
        return `First lead received${payload.source_url ? ` from ${new URL(payload.source_url).hostname}` : ""}`;
      case "trial_activated": // Legacy
        const activationType = payload.activation_type === "first_login" ? "Logged in" : "Changed settings";
        return `Trial activated – ${activationType}`;
      case "snippet_installed": // Legacy
        return `Calculator installed${payload.website_domain ? ` on ${payload.website_domain}` : ""}`;
      case "trial_qualified":
        return "Trial qualified for conversion";
      case "credits_low":
        const credits = payload.credits_remaining ?? payload.credits_left;
        return `Credits running low${credits !== undefined ? ` (${credits} remaining)` : ""}`;
      case "trial_expiring":
        return `Trial expiring soon${payload.trial_ends_at ? ` on ${new Date(payload.trial_ends_at).toLocaleDateString()}` : ""}`;
      case "paid_subscribed":
        const mrrStr = payload.mrr ? ` – $${payload.mrr}/mo` : "";
        return `Converted to paid${payload.plan ? ` (${payload.plan})` : ""}${mrrStr}`;
      default:
        return notification.eventType.replace(/_/g, " ");
    }
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case "trial_started":
        return <Rocket className="h-4 w-4 text-blue-500" />;
      case "password_set":
        return <Lock className="h-4 w-4 text-blue-400" />;
      case "first_login":
      case "trial_activated": // Legacy
        return <Zap className="h-4 w-4 text-indigo-500" />;
      case "calculator_viewed":
        return <Eye className="h-4 w-4 text-indigo-400" />;
      case "calculator_modified":
        return <Settings className="h-4 w-4 text-indigo-600" />;
      case "embed_snippet_copied":
        return <Copy className="h-4 w-4 text-purple-400" />;
      case "first_lead_received":
      case "snippet_installed": // Legacy
        return <Code className="h-4 w-4 text-purple-500" />;
      case "trial_qualified":
        return <CheckCircle className="h-4 w-4 text-indigo-500" />;
      case "credits_low":
        return <CreditCard className="h-4 w-4 text-amber-500" />;
      case "trial_expiring":
        return <Calendar className="h-4 w-4 text-orange-500" />;
      case "paid_subscribed":
        return <DollarSign className="h-4 w-4 text-green-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-gray-500 mt-2">Loading client timeline...</p>
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="text-center py-8">
        <Activity className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No client events yet</p>
        <p className="text-sm text-gray-400 mt-1">Events from the Junk Car Calculator will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">CLIENT TIMELINE</h3>
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
        <div className="space-y-4">
          {notifications.map((notification) => (
            <div key={notification.id} className="relative flex items-start gap-4 pl-10">
              <div className="absolute left-2 p-1 bg-white rounded-full border border-gray-200">
                {getEventIcon(notification.eventType)}
              </div>
              <div className="flex-1 bg-gray-50 rounded-lg p-4 border border-gray-200">
                <p className="text-sm font-medium text-gray-900">
                  {getEventDescription(notification)}
                </p>
                <p className="text-xs text-gray-500 mt-1">{formatDate(notification.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Inline notes content (no modal wrapper)
function NotesInlineContent({ leadId }: { leadId: string }) {
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    fetchNotes();
  }, [leadId]);

  const fetchNotes = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/leads/${leadId}/notes`);
      if (!response.ok) throw new Error("Failed to fetch notes");
      const data = await response.json();
      setNotes(data.notes || []);
    } catch (error) {
      console.error("Error fetching notes:", error);
      toast.error("Failed to load notes");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setIsAdding(true);
    try {
      const response = await fetch(`/api/leads/${leadId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: newNote }),
      });
      if (!response.ok) throw new Error("Failed to add note");
      const data = await response.json();
      setNotes([data.note, ...notes]);
      setNewNote("");
      toast.success("Note added successfully");
    } catch (error) {
      console.error("Error adding note:", error);
      toast.error("Failed to add note");
    } finally {
      setIsAdding(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleAddNote}>
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Add a note..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          rows={3}
          disabled={isAdding}
        />
        <button
          type="submit"
          disabled={isAdding || !newNote.trim()}
          className="mt-3 w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {isAdding ? "Adding..." : "Add Note"}
        </button>
      </form>

      {isLoading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-500 mt-2">Loading notes...</p>
        </div>
      ) : notes.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No notes yet</p>
          <p className="text-sm text-gray-400 mt-1">Add your first note above</p>
        </div>
      ) : (
        <div className="space-y-4">
          {notes.map((note) => (
            <div key={note.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="text-gray-900 whitespace-pre-wrap">{note.note}</p>
              <p className="text-xs text-gray-500 mt-2">{formatDate(note.createdAt)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface LeadDetailsPanelProps {
  lead: BusinessResult;
  isOpen: boolean;
  onClose: () => void;
  onCall?: (lead: BusinessResult) => void;
  onText?: (lead: BusinessResult) => void;
}

interface CallRecord {
  id: string;
  lead_id: string;
  duration: number | null;
  status: string;
  created_at: string;
  notes: string | null;
}

export default function LeadDetailsPanel({
  lead,
  isOpen,
  onClose,
  onCall,
  onText,
}: LeadDetailsPanelProps) {
  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);
  const [isLoadingCalls, setIsLoadingCalls] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "notes" | "activity" | "calls" | "client">("info");
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [emailValue, setEmailValue] = useState(lead.email || "");
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [showStartTrialModal, setShowStartTrialModal] = useState(false);
  const [localClientStatus, setLocalClientStatus] = useState(lead.clientStatus);
  const router = useRouter();

  useEffect(() => {
    if (isOpen && lead.id) {
      fetchCallHistory();
      setEmailValue(lead.email || "");
      setIsEditingEmail(false);
      setLocalClientStatus(lead.clientStatus);
      setShowStartTrialModal(false);
    }
  }, [isOpen, lead.id, lead.email, lead.clientStatus]);

  const handleSaveEmail = async () => {
    if (!emailValue.trim()) {
      toast.error("Please enter an email address");
      return;
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailValue.trim())) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsSavingEmail(true);
    try {
      const response = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailValue.trim() }),
      });

      if (!response.ok) {
        throw new Error("Failed to update email");
      }

      toast.success("Email updated successfully");
      setIsEditingEmail(false);
      // Update the lead object locally
      lead.email = emailValue.trim();
    } catch (error) {
      console.error("Error saving email:", error);
      toast.error("Failed to update email");
    } finally {
      setIsSavingEmail(false);
    }
  };

  const fetchCallHistory = async () => {
    setIsLoadingCalls(true);
    try {
      const response = await fetch(`/api/calls/history?leadId=${lead.id}`);
      if (response.ok) {
        const data = await response.json();
        setCallHistory(data.calls || []);
      }
    } catch (error) {
      console.error("Error fetching call history:", error);
    } finally {
      setIsLoadingCalls(false);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "N/A";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-end">
      <div className="bg-white h-full w-full max-w-2xl shadow-xl flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{lead.name}</h2>
            <p className="text-sm text-gray-600 mt-1">Lead Details</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 flex overflow-x-auto">
          <button
            onClick={() => setActiveTab("info")}
            className={`px-6 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === "info"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Info
          </button>
          <button
            onClick={() => setActiveTab("notes")}
            className={`px-6 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === "notes"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Notes
          </button>
          <button
            onClick={() => setActiveTab("activity")}
            className={`px-6 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === "activity"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Activity
          </button>
          <button
            onClick={() => setActiveTab("calls")}
            className={`px-6 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === "calls"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Calls
          </button>
          <button
            onClick={() => setActiveTab("client")}
            className={`px-6 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === "client"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Client
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "info" && (
            <div className="space-y-6">
              {/* Client Status Section - Only show if client has status */}
              {lead.clientStatus && lead.clientStatus !== "none" && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">CLIENT STATUS</h3>
                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-4 border border-gray-200">
                    <div className="flex items-center justify-between mb-3">
                      <ClientStatusBadge status={lead.clientStatus} size="lg" />
                    </div>
                    <div className="space-y-2 text-sm">
                      {lead.clientPlan && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Plan</span>
                          <span className="font-medium text-gray-900">{lead.clientPlan}</span>
                        </div>
                      )}
                      {lead.clientCreditsLeft !== undefined && lead.clientCreditsLeft !== null && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Credits Remaining</span>
                          <span className={`font-medium ${lead.clientCreditsLeft < 10 ? "text-amber-600" : "text-gray-900"}`}>
                            {lead.clientCreditsLeft}
                          </span>
                        </div>
                      )}
                      {lead.clientTrialEndsAt && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Trial Ends</span>
                          <span className="font-medium text-gray-900">
                            {new Date(lead.clientTrialEndsAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Contact Info */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">CONTACT INFO</h3>
                <div className="space-y-3">
                  {lead.phone && (
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Phone className="h-5 w-5 text-gray-600" />
                        <a href={`tel:${lead.phone}`} className="text-sm text-gray-900">
                          {lead.phone}
                        </a>
                      </div>
                      <div className="flex items-center gap-2">
                        {onCall && (
                          <button
                            onClick={() => onCall(lead)}
                            className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            Call
                          </button>
                        )}
                        {onText && (
                          <button
                            onClick={() => onText(lead)}
                            className="px-3 py-1.5 text-xs font-medium bg-cyan-600 text-white rounded hover:bg-cyan-700"
                          >
                            SMS
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {/* Email - Always show, editable */}
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3 flex-1">
                      <Mail className="h-5 w-5 text-gray-600" />
                      {isEditingEmail ? (
                        <input
                          type="email"
                          value={emailValue}
                          onChange={(e) => setEmailValue(e.target.value)}
                          placeholder="Enter email address..."
                          className="flex-1 text-sm text-gray-900 border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          autoFocus
                        />
                      ) : lead.email ? (
                        <a href={`mailto:${lead.email}`} className="text-sm text-gray-900">
                          {lead.email}
                        </a>
                      ) : (
                        <span className="text-sm text-gray-400 italic">No email address</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {isEditingEmail ? (
                        <>
                          <button
                            onClick={handleSaveEmail}
                            disabled={isSavingEmail}
                            className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
                          >
                            {isSavingEmail ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={() => {
                              setIsEditingEmail(false);
                              setEmailValue(lead.email || "");
                            }}
                            className="px-3 py-1.5 text-xs font-medium bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setIsEditingEmail(true)}
                            className="px-3 py-1.5 text-xs font-medium bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                          >
                            {lead.email ? "Edit" : "Add"}
                          </button>
                          {lead.email && (
                            <a
                              href={`mailto:${lead.email}`}
                              className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700"
                            >
                              Email
                            </a>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  {lead.website && (
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <ExternalLink className="h-5 w-5 text-gray-600" />
                        <span className="text-sm text-gray-900">{lead.website}</span>
                      </div>
                      <a
                        href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700"
                      >
                        Visit
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Start Free Trial - Show when no active trial */}
              {(!localClientStatus || localClientStatus === "none") && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">JUNK CAR CALCULATOR</h3>
                  <button
                    onClick={() => setShowStartTrialModal(true)}
                    className="w-full flex items-center justify-center gap-2 p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg"
                  >
                    <Rocket className="h-5 w-5" />
                    <span className="font-medium">Start Free Trial</span>
                    <span className="text-blue-100 text-sm ml-1">(20 credits)</span>
                  </button>
                  <p className="text-xs text-gray-500 text-center mt-2">
                    Instantly provision a trial account while on the phone
                  </p>
                </div>
              )}

              {/* Business Info */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">BUSINESS INFO</h3>
                <div className="space-y-3">
                  {lead.address && (
                    <div className="flex items-start justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-start gap-3">
                        <MapPin className="h-5 w-5 text-gray-600 mt-0.5" />
                        <span className="text-sm text-gray-900">{lead.address}</span>
                      </div>
                      {lead.placeId && (
                        <button
                          onClick={() => {
                            window.open(
                              `https://www.google.com/maps/place/?q=place_id:${lead.placeId}`,
                              "_blank"
                            );
                          }}
                          className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700"
                        >
                          View on Maps
                        </button>
                      )}
                    </div>
                  )}
                  {lead.rating && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <Star className="h-5 w-5 text-yellow-400 fill-yellow-400" />
                      <span className="text-sm text-gray-900">
                        {lead.rating} ({lead.reviewCount || 0} reviews)
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Messages Link */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">MESSAGES</h3>
                <button
                  onClick={() => {
                    router.push(`/dashboard/conversations?leadId=${lead.id}&phone=${encodeURIComponent(lead.phone || "")}&name=${encodeURIComponent(lead.name || "")}`);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <MessageCircle className="h-5 w-5 text-gray-600" />
                    <span className="text-sm text-gray-900">View Conversation</span>
                  </div>
                  <ExternalLink className="h-4 w-4 text-gray-400" />
                </button>
              </div>
            </div>
          )}

          {activeTab === "notes" && (
            <NotesInlineContent leadId={lead.id} />
          )}

          {activeTab === "activity" && (
            <ActivityTimeline
              leadId={lead.id}
              leadName={lead.name || "Lead"}
              isOpen={true}
              onClose={() => {}}
            />
          )}

          {activeTab === "calls" && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">CALL HISTORY</h3>
              {isLoadingCalls ? (
                <div className="text-center py-8 text-gray-500">Loading calls...</div>
              ) : callHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No call history</div>
              ) : (
                <div className="space-y-3">
                  {callHistory.map((call) => (
                    <div
                      key={call.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Phone className="h-5 w-5 text-gray-600" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {formatDate(call.created_at)}
                          </div>
                          <div className="text-xs text-gray-600">
                            {formatDuration(call.duration)} • {call.status}
                          </div>
                          {call.notes && (
                            <div className="text-xs text-gray-500 mt-1">{call.notes}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "client" && (
            <div className="space-y-6">
              {/* Client Status Summary */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">CLIENT STATUS</h3>
                <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <ClientStatusBadge status={lead.clientStatus || "none"} size="lg" />
                  </div>
                  <div className="space-y-2 text-sm">
                    {lead.clientPlan && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Plan</span>
                        <span className="font-medium text-gray-900">{lead.clientPlan}</span>
                      </div>
                    )}
                    {lead.clientCreditsLeft !== undefined && lead.clientCreditsLeft !== null && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Credits Remaining</span>
                        <span className={`font-medium ${lead.clientCreditsLeft < 10 ? "text-amber-600" : "text-gray-900"}`}>
                          {lead.clientCreditsLeft}
                        </span>
                      </div>
                    )}
                    {lead.clientTrialEndsAt && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Trial Ends</span>
                        <span className="font-medium text-gray-900">
                          {new Date(lead.clientTrialEndsAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    )}
                    {!lead.clientStatus && !lead.clientPlan && (
                      <p className="text-gray-500 italic text-center py-2">No client data available</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Client Timeline */}
              <ClientTimelineContent leadId={lead.id} />
            </div>
          )}
        </div>
      </div>

      {/* Start Trial Modal */}
      {showStartTrialModal && (
        <StartTrialModal
          leadId={lead.id}
          leadName={lead.name}
          leadEmail={lead.email || emailValue}
          leadPhone={lead.phone}
          leadWebsite={lead.website}
          onClose={() => setShowStartTrialModal(false)}
          onSuccess={(result) => {
            // Update local state to reflect the trial was started
            setLocalClientStatus("trialing");
            setShowStartTrialModal(false);
          }}
        />
      )}
    </div>
  );
}

