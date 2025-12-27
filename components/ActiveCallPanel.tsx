"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PhoneOff, Mic, MicOff, ChevronLeft, ChevronRight, Hash, X, Save, MessageSquare, Mail, HelpCircle, FileText, ChevronDown, ChevronUp, Loader2, Calendar } from "lucide-react";
import { useCall } from "./CallProvider";
import { CallOutcome, CallOutcomeCode, CTAResult, OUTCOME_OPTIONS, CTA_RESULT_OPTIONS } from "@/lib/types";
import toast from "react-hot-toast";
import { QuickEmailModal } from "./QuickEmailModal";
import { ScheduleSlotPicker } from "./ScheduleSlotPicker";

interface LeadInfo {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  leadStatus?: string;
  assignedRepName?: string;
  campaign?: {
    id: string;
    name: string;
  };
  lastCall?: {
    status: string;
    outcome?: string;
    initiatedAt: string;
  };
}

interface CallScript {
  id: string;
  name: string;
  content: string;
  campaignName?: string;
}

export function ActiveCallPanel() {
  const {
    call,
    callState,
    callDuration,
    isMuted,
    incomingCallerId,
    outboundLeadId,
    outboundLeadPhone,
    outboundLeadName,
    isOutboundCall,
    displayPhone,
    displayName,
    hangUp,
    toggleMute,
    sendDTMF,
    getCallId,
    getLastCallSid,
    resetCallState,
  } = useCall();

  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [leadInfo, setLeadInfo] = useState<LeadInfo | null>(null);
  const [callNotes, setCallNotes] = useState("");
  const [showDialpad, setShowDialpad] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [onboardingScheduled, setOnboardingScheduled] = useState(false);
  const [summaryOutcome, setSummaryOutcome] = useState<CallOutcome | "">("");
  const [summaryOutcomeCode, setSummaryOutcomeCode] = useState<CallOutcomeCode | "">("");
  const [summaryNotes, setSummaryNotes] = useState("");
  const [summaryCallbackDate, setSummaryCallbackDate] = useState("");
  const [summaryNextActionAt, setSummaryNextActionAt] = useState("");
  const [summaryNextActionNote, setSummaryNextActionNote] = useState("");
  // CTA tracking state
  const [ctaAttempted, setCtaAttempted] = useState<boolean | null>(null);
  const [ctaResult, setCtaResult] = useState<CTAResult | "">("");
  const [ctaSentViaSms, setCtaSentViaSms] = useState(false);
  const [ctaSentViaEmail, setCtaSentViaEmail] = useState(false);

  // Auto-derive lead status from outcome code
  const getLeadStatusFromOutcomeCode = (code: CallOutcomeCode | ""): string => {
    switch (code) {
      case "INTERESTED_INFO_SENT": return "interested";
      case "TRIAL_STARTED": return "trial_started";
      case "CALLBACK_SCHEDULED": return "follow_up";
      case "NOT_INTERESTED": return "not_interested";
      case "NO_ANSWER": return "contacted";
      case "BUSY": return "contacted";
      case "WRONG_NUMBER": return "closed_lost";
      default: return "";
    }
  };

  // Map new outcome codes to old outcomes for backward compatibility
  const getOldOutcomeFromCode = (code: CallOutcomeCode | ""): CallOutcome | "" => {
    switch (code) {
      case "NO_ANSWER": return "no_answer";
      case "BUSY": return "busy";
      case "WRONG_NUMBER": return "wrong_number";
      case "NOT_INTERESTED": return "not_interested";
      case "INTERESTED_INFO_SENT": return "interested";
      case "TRIAL_STARTED": return "interested";
      case "CALLBACK_SCHEDULED": return "callback_requested";
      default: return "";
    }
  };

  // Check if outcome is a real conversation (30s+ typically)
  const isConversationOutcome = (code: CallOutcomeCode | ""): boolean => {
    return ["NOT_INTERESTED", "INTERESTED_INFO_SENT", "TRIAL_STARTED", "CALLBACK_SCHEDULED"].includes(code);
  };
  const [isSavingSummary, setIsSavingSummary] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const [showOutcomeGuide, setShowOutcomeGuide] = useState(false);
  
  // Lead info loading state
  const [isLoadingLeadInfo, setIsLoadingLeadInfo] = useState(false);
  const [leadInfoRetryCount, setLeadInfoRetryCount] = useState(0);
  
  // Call script state
  const [callScript, setCallScript] = useState<CallScript | null>(null);
  const [showScript, setShowScript] = useState(true); // Default open
  const [isLoadingScript, setIsLoadingScript] = useState(false);

  // Fetch lead info when call starts - with retry logic
  useEffect(() => {
    if (callState === "connected" && !leadInfo && !isLoadingLeadInfo) {
      console.log("[ActiveCallPanel] Fetching lead info...", {
        isOutboundCall,
        outboundLeadId,
        outboundLeadPhone,
        incomingCallerId,
        retryCount: leadInfoRetryCount,
      });
      
      setIsLoadingLeadInfo(true);
      
      // For outbound calls, try to fetch by lead ID first (more reliable)
      if (isOutboundCall && outboundLeadId) {
        fetch(`/api/leads/${outboundLeadId}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.lead) {
              console.log("[ActiveCallPanel] Lead info fetched by ID:", data.lead.id);
              setLeadInfo({
                id: data.lead.id,
                name: data.lead.name,
                address: data.lead.address,
                phone: data.lead.phone,
                email: data.lead.email,
                website: data.lead.website,
                leadStatus: data.lead.leadStatus,
                campaign: data.lead.campaign,
              });
            } else {
              console.warn("[ActiveCallPanel] Lead not found by ID, trying phone lookup");
              if (outboundLeadPhone) {
                fetchLeadByPhone(outboundLeadPhone);
              }
            }
            setIsLoadingLeadInfo(false);
          })
          .catch((err) => {
            console.error("[ActiveCallPanel] Error fetching lead by ID:", err);
            // Fallback to phone lookup
            if (outboundLeadPhone) {
              fetchLeadByPhone(outboundLeadPhone);
            }
            setIsLoadingLeadInfo(false);
          });
      } else {
        // For inbound calls or outbound without lead ID, use phone lookup
        const phoneToLookup = isOutboundCall ? outboundLeadPhone : incomingCallerId;
        if (phoneToLookup) {
          console.log("[ActiveCallPanel] Looking up lead by phone:", phoneToLookup);
          fetchLeadByPhone(phoneToLookup);
        } else {
          console.warn("[ActiveCallPanel] No phone number available for lookup");
          setIsLoadingLeadInfo(false);
        }
      }
    }
  }, [callState, incomingCallerId, outboundLeadId, outboundLeadPhone, isOutboundCall, leadInfo, isLoadingLeadInfo, leadInfoRetryCount]);

  // Retry lead info fetch if it failed
  useEffect(() => {
    if (callState === "connected" && !leadInfo && !isLoadingLeadInfo && leadInfoRetryCount < 3) {
      const timer = setTimeout(() => {
        console.log("[ActiveCallPanel] Retrying lead info fetch, attempt:", leadInfoRetryCount + 1);
        setLeadInfoRetryCount((prev) => prev + 1);
      }, 2000); // Retry after 2 seconds
      return () => clearTimeout(timer);
    }
  }, [callState, leadInfo, isLoadingLeadInfo, leadInfoRetryCount]);

  const fetchLeadByPhone = (phoneNumber: string) => {
    fetch(`/api/calls/lookup?phoneNumber=${encodeURIComponent(phoneNumber)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.found && data.lead) {
          console.log("[ActiveCallPanel] Lead found by phone:", data.lead.id);
          setLeadInfo(data.lead);
          setCallNotes(data.lead.lastCall?.notes || "");
        } else {
          console.warn("[ActiveCallPanel] Lead not found by phone lookup");
        }
        setIsLoadingLeadInfo(false);
      })
      .catch((err) => {
        console.error("[ActiveCallPanel] Error looking up lead:", err);
        setIsLoadingLeadInfo(false);
      });
  };

  // Fetch call script when campaign is known
  useEffect(() => {
    if (leadInfo?.campaign?.id && !callScript && !isLoadingScript) {
      setIsLoadingScript(true);
      console.log("[ActiveCallPanel] Fetching script for campaign:", leadInfo.campaign.id);
      
      fetch(`/api/call-scripts?campaignId=${leadInfo.campaign.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.scripts && data.scripts.length > 0) {
            // Get the first active script
            const activeScript = data.scripts.find((s: any) => s.isActive) || data.scripts[0];
            console.log("[ActiveCallPanel] Script loaded:", activeScript.name);
            setCallScript({
              id: activeScript.id,
              name: activeScript.name,
              content: activeScript.content,
              campaignName: activeScript.campaignName,
            });
          } else {
            console.log("[ActiveCallPanel] No scripts found for campaign");
          }
        })
        .catch((err) => {
          console.error("[ActiveCallPanel] Error fetching script:", err);
        })
        .finally(() => {
          setIsLoadingScript(false);
        });
    }
  }, [leadInfo?.campaign?.id, callScript, isLoadingScript]);

  // When call ends, show summary
  useEffect(() => {
    if (callState === "ended") {
      console.log("Call ended, showing summary popup");
      const currentCallId = getCallId();
      console.log("Current call ID:", currentCallId);
      
      if (currentCallId) {
        setCallId(currentCallId);
        setShowSummary(true);
      } else {
        // Retry lookup if call ID not found yet (async lookup may still be in progress)
        // Use getLastCallSid() which persists even after call object is cleared
        const callSid = getLastCallSid();
        console.log("Call ID not found, retrying with CallSid:", callSid);
        
        if (callSid) {
          // Retry lookup with a small delay
          setTimeout(async () => {
            try {
              console.log("Retrying call ID lookup with CallSid:", callSid);
              const response = await fetch(`/api/calls/by-sid?twilioCallSid=${encodeURIComponent(callSid)}`);
              if (response.ok) {
                const data = await response.json();
                console.log("Call ID lookup response:", data);
                if (data.call?.id) {
                  setCallId(data.call.id);
                  setShowSummary(true);
                }
              } else {
                console.error("Call ID lookup failed:", response.status);
              }
            } catch (err) {
              console.error("Error retrying call ID lookup:", err);
            }
          }, 500);
        }
        // Show summary anyway even without call ID (user can still add notes)
        console.log("Showing summary popup (may not have call ID yet)");
        setShowSummary(true);
      }
    }
  }, [callState, getCallId, getLastCallSid]);

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Format phone number
  const formatPhoneNumber = (phone: string) => {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  const formatDateTimeLocal = (date: Date) => {
    const pad = (value: number) => `${value}`.padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate()
    )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const scheduleCallbackInDays = (days: number) => {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    targetDate.setHours(9, 0, 0, 0);
    const formatted = formatDateTimeLocal(targetDate);
    setSummaryCallbackDate(formatted);
    setSummaryNextActionAt(formatted);
    if (!summaryNextActionNote) {
      setSummaryNextActionNote(`Callback scheduled for ${targetDate.toLocaleDateString()}`);
    }
  };

  const handleSaveSummary = async () => {
    let effectiveCallId = callId;
    // Prepare next action ISO with local-to-UTC conversion (to avoid 3 AM drift)
    const nextActionIso = summaryNextActionAt
      ? new Date(summaryNextActionAt).toISOString()
      : undefined;

    // If we don't have a callId yet, try to look it up by CallSid
    if (!effectiveCallId) {
      const callSid = getLastCallSid();
      if (callSid) {
        try {
          const res = await fetch(`/api/calls/by-sid?twilioCallSid=${encodeURIComponent(callSid)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.call?.id) {
              effectiveCallId = data.call.id;
              setCallId(data.call.id);
            }
          }
        } catch (err) {
          console.error("Error looking up call by CallSid:", err);
        }
      }
    }

    if (!effectiveCallId) {
      toast.error("Call not yet saved. Please wait a moment and try again.");
      return;
    }

    setIsSavingSummary(true);
    try {
      // Auto-derive lead status from outcome code
      const derivedLeadStatus = getLeadStatusFromOutcomeCode(summaryOutcomeCode);
      // Map to old outcome for backward compatibility
      const oldOutcome = getOldOutcomeFromCode(summaryOutcomeCode);
      
      const response = await fetch(`/api/calls/${effectiveCallId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome: oldOutcome || undefined,
          outcomeCode: summaryOutcomeCode || undefined,
          notes: summaryNotes || callNotes || undefined,
          callbackDate: summaryCallbackDate || undefined,
          leadStatus: derivedLeadStatus || undefined,
          nextActionAt: nextActionIso || summaryNextActionAt || undefined,
          nextActionNote: summaryNextActionNote || undefined,
          // CTA tracking
          ctaAttempted: ctaAttempted ?? undefined,
          ctaResult: ctaResult || undefined,
          ctaSentViaSms: ctaSentViaSms || undefined,
          ctaSentViaEmail: ctaSentViaEmail || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save call summary");
      }

      toast.success("Call summary saved");
      setShowSummary(false);
      setCallId(null);
      setSummaryOutcome("");
      setSummaryOutcomeCode("");
      setSummaryNotes("");
      setSummaryCallbackDate("");
      setSummaryNextActionAt("");
      setSummaryNextActionNote("");
      // Reset CTA state
      setCtaAttempted(null);
      setCtaResult("");
      setCtaSentViaSms(false);
      setCtaSentViaEmail(false);
      // Reset schedule state
      setShowScheduleModal(false);
      setOnboardingScheduled(false);
      // Reset lead info and script state
      setLeadInfo(null);
      setLeadInfoRetryCount(0);
      setIsLoadingLeadInfo(false);
      setCallScript(null);
      setIsLoadingScript(false);
      // Reset call state in provider
      resetCallState();
    } catch (err: any) {
      console.error("Error saving summary:", err);
      toast.error(err.message || "Failed to save call summary");
    } finally {
      setIsSavingSummary(false);
    }
  };

  const handleSkipSummary = () => {
    setShowSummary(false);
    setShowScheduleModal(false);
    setOnboardingScheduled(false);
    setCallId(null);
    setSummaryOutcome("");
    setSummaryOutcomeCode("");
    setSummaryNotes("");
    setSummaryCallbackDate("");
    setSummaryNextActionAt("");
    setSummaryNextActionNote("");
    // Reset CTA state
    setCtaAttempted(null);
    setCtaResult("");
      setCtaSentViaSms(false);
      setCtaSentViaEmail(false);
      // Reset lead info and script state
    setLeadInfo(null);
    setLeadInfoRetryCount(0);
    setIsLoadingLeadInfo(false);
    setCallScript(null);
    setIsLoadingScript(false);
    // Reset call state in provider
    resetCallState();
  };

  // Use displayPhone/displayName directly - they are set in CallProvider
  const formattedDisplayName =
    displayName ||
    leadInfo?.name ||
    (displayPhone ? formatPhoneNumber(displayPhone) : "Unknown");

  const formattedDisplayNumber = displayPhone ? formatPhoneNumber(displayPhone) : "";

  const handleSendMessage = () => {
    const phoneToMessage = displayPhone || leadInfo?.phone || incomingCallerId;
    const nameToMessage = displayName || leadInfo?.name;

    const leadIdToMessage = leadInfo?.id;

    if (!phoneToMessage) {
      toast.error("No phone number available");
      return;
    }

    const params = new URLSearchParams();
    if (leadIdToMessage) params.set("leadId", leadIdToMessage);
    params.set("phone", phoneToMessage.replace(/\D/g, ""));
    if (nameToMessage) params.set("name", encodeURIComponent(nameToMessage));
    params.set("autoFocus", "true");

    router.push(`/dashboard/conversations?${params.toString()}`);
  };

  // Save notes during call
  const saveCallNotes = async () => {
    if (!callId || !callNotes.trim()) return;

    try {
      await fetch(`/api/calls/${callId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: callNotes }),
      });
    } catch (err) {
      console.error("Error saving notes:", err);
    }
  };

  if (callState !== "connected" && callState !== "ended") return null;

  // Show summary form when call ends
  if (showSummary && callState === "ended") {
    return (
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900">Call Summary</h3>
              <button
                onClick={() => setShowOutcomeGuide(true)}
                className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 flex items-center gap-1"
              >
                <HelpCircle className="h-3 w-3" />
                Guide
              </button>
            </div>
            <button
              onClick={handleSkipSummary}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Outcome Dropdown */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Outcome *</label>
            <select
              value={summaryOutcomeCode}
              onChange={(e) => {
                const code = e.target.value as CallOutcomeCode | "";
                setSummaryOutcomeCode(code);
                // Auto-set CTA attempted to Yes for conversation outcomes
                if (code && isConversationOutcome(code) && ctaAttempted === null) {
                  setCtaAttempted(true);
                }
                // Auto-require follow-up for callbacks
                if (code === "CALLBACK_SCHEDULED" && !summaryNextActionAt) {
                  scheduleCallbackInDays(1);
                }
              }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select outcome...</option>
              {OUTCOME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* CTA Section - Show for conversation outcomes */}
          {summaryOutcomeCode && isConversationOutcome(summaryOutcomeCode) && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-3">
              <div className="text-xs font-medium text-purple-800">CTA Tracking</div>
              
              {/* CTA Attempted */}
              <div className="flex items-center gap-4">
                <span className="text-xs text-gray-700">Did you offer the CTA?</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCtaAttempted(true)}
                    className={`px-3 py-1 text-xs rounded ${ctaAttempted === true ? "bg-purple-600 text-white" : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"}`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCtaAttempted(false);
                      setCtaResult("");
                      setCtaSentViaSms(false);
                      setCtaSentViaEmail(false);
                    }}
                    className={`px-3 py-1 text-xs rounded ${ctaAttempted === false ? "bg-gray-600 text-white" : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"}`}
                  >
                    No
                  </button>
                </div>
              </div>

              {/* CTA Result - Only show if attempted */}
              {ctaAttempted && (
                <>
                  <div>
                    <label className="block text-xs text-gray-700 mb-1">What did they say?</label>
                    <select
                      value={ctaResult}
                      onChange={(e) => setCtaResult(e.target.value as CTAResult | "")}
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Select result...</option>
                      {CTA_RESULT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* CTA Sent Via - Only for accepted */}
                  {ctaResult === "ACCEPTED" && (
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-gray-700">Sent via:</span>
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={ctaSentViaSms}
                          onChange={(e) => setCtaSentViaSms(e.target.checked)}
                          className="h-3.5 w-3.5 text-purple-600 rounded"
                        />
                        <span className="text-xs">SMS</span>
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={ctaSentViaEmail}
                          onChange={(e) => setCtaSentViaEmail(e.target.checked)}
                          className="h-3.5 w-3.5 text-purple-600 rounded"
                        />
                        <span className="text-xs">Email</span>
                      </label>
                    </div>
                  )}

                  {/* Auto-require follow-up for Needs Manager */}
                  {ctaResult === "NEEDS_MANAGER" && !summaryNextActionAt && (
                    <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded">
                      ⚠️ Please schedule a follow-up below
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={summaryNotes || callNotes}
              onChange={(e) => {
                setSummaryNotes(e.target.value);
                setCallNotes(e.target.value);
              }}
              placeholder="Objections, tools they use, who decides..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
          </div>

          {/* Follow-up Section */}
          <div className={`p-2 rounded ${summaryOutcomeCode === "CALLBACK_SCHEDULED" || ctaResult === "NEEDS_MANAGER" ? "bg-blue-50 border border-blue-200" : "bg-gray-50"}`}>
            <div className="flex flex-wrap gap-1 items-center">
              <span className={`text-xs ${summaryOutcomeCode === "CALLBACK_SCHEDULED" || ctaResult === "NEEDS_MANAGER" ? "text-blue-700 font-medium" : "text-gray-500"}`}>
                Follow-up{summaryOutcomeCode === "CALLBACK_SCHEDULED" || ctaResult === "NEEDS_MANAGER" ? " *" : ":"}
              </span>
              <button
                type="button"
                onClick={() => scheduleCallbackInDays(1)}
                className={`px-2 py-1 text-xs rounded ${summaryOutcomeCode === "CALLBACK_SCHEDULED" ? "bg-blue-100 hover:bg-blue-200" : "bg-gray-100 hover:bg-gray-200"}`}
              >
                1d
              </button>
              <button
                type="button"
                onClick={() => scheduleCallbackInDays(7)}
                className={`px-2 py-1 text-xs rounded ${summaryOutcomeCode === "CALLBACK_SCHEDULED" ? "bg-blue-100 hover:bg-blue-200" : "bg-gray-100 hover:bg-gray-200"}`}
              >
                1w
              </button>
              <button
                type="button"
                onClick={() => scheduleCallbackInDays(14)}
                className={`px-2 py-1 text-xs rounded ${summaryOutcomeCode === "CALLBACK_SCHEDULED" ? "bg-blue-100 hover:bg-blue-200" : "bg-gray-100 hover:bg-gray-200"}`}
              >
                2w
              </button>
              <input
                type="datetime-local"
                value={summaryNextActionAt}
                onChange={(e) => {
                  setSummaryNextActionAt(e.target.value);
                  setSummaryCallbackDate(e.target.value);
                }}
                className="flex-1 min-w-[140px] px-2 py-1 text-xs border border-gray-300 rounded"
              />
            </div>
            {summaryNextActionAt && (
              <input
                type="text"
                value={summaryNextActionNote}
                onChange={(e) => setSummaryNextActionNote(e.target.value)}
                placeholder="Follow-up note (optional)"
                className="w-full mt-2 px-2 py-1 text-xs border border-gray-300 rounded"
              />
            )}
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50 space-y-2">
          {/* Send Follow-Up Email Button */}
          {leadInfo?.email && (
            <button
              onClick={() => setShowEmailModal(true)}
              className="w-full px-4 py-2 text-sm border border-blue-300 text-blue-700 bg-blue-50 rounded hover:bg-blue-100 flex items-center justify-center gap-2"
            >
              <Mail className="h-4 w-4" />
              Send Follow-Up Email
            </button>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleSkipSummary}
              className="flex-1 px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-100"
            >
              Skip
            </button>
            <button
              onClick={handleSaveSummary}
              disabled={isSavingSummary}
              className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isSavingSummary ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        {/* Outcome Guide Modal */}
        {showOutcomeGuide && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
              <div className="p-4 border-b border-gray-200 bg-blue-600 text-white flex items-center justify-between">
                <h3 className="font-semibold">📋 Call Outcome Guide</h3>
                <button
                  onClick={() => setShowOutcomeGuide(false)}
                  className="text-white/80 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
                {/* 1. No Answer */}
                <div className="border-l-4 border-gray-400 pl-3">
                  <div className="font-semibold text-gray-900">1️⃣ No Answer / Voicemail</div>
                  <div className="text-gray-600 mt-1">
                    <div><span className="font-medium">Use when:</span> No answer, voicemail, ringing out.</div>
                    <div><span className="font-medium">Notes:</span> "Left VM / No VM," time of day.</div>
                    <div><span className="font-medium">Follow-up:</span> Next day.</div>
                  </div>
                </div>

                {/* 2. Busy */}
                <div className="border-l-4 border-orange-400 pl-3">
                  <div className="font-semibold text-gray-900">2️⃣ Busy / Dropped</div>
                  <div className="text-gray-600 mt-1">
                    <div><span className="font-medium">Use when:</span> "Call back later," hung up, dropped.</div>
                    <div><span className="font-medium">Notes:</span> Reason + any callback time.</div>
                    <div><span className="font-medium">Follow-up:</span> Same day or next morning.</div>
                  </div>
                </div>

                {/* 3. Wrong Number */}
                <div className="border-l-4 border-red-400 pl-3">
                  <div className="font-semibold text-gray-900">3️⃣ Wrong Number</div>
                  <div className="text-gray-600 mt-1">
                    <div><span className="font-medium">Use when:</span> Not the business, disconnected.</div>
                    <div><span className="font-medium">Notes:</span> New number if provided.</div>
                    <div><span className="font-medium">Follow-up:</span> None (unless new number).</div>
                  </div>
                </div>

                {/* 4. Not Interested */}
                <div className="border-l-4 border-red-600 pl-3">
                  <div className="font-semibold text-gray-900">4️⃣ Not Interested</div>
                  <div className="text-gray-600 mt-1">
                    <div><span className="font-medium">Use when:</span> Clear "no," hang-up after purpose.</div>
                    <div><span className="font-medium">Notes:</span> Exact objection (verbatim).</div>
                    <div><span className="font-medium">Follow-up:</span> None OR 2 weeks if "soft no."</div>
                  </div>
                </div>

                {/* 5. Interested - Info Sent */}
                <div className="border-l-4 border-blue-500 pl-3">
                  <div className="font-semibold text-gray-900">5️⃣ Interested — Info Sent</div>
                  <div className="text-gray-600 mt-1">
                    <div><span className="font-medium">Use when:</span> Wants more info, sample link, demo link; no trial.</div>
                    <div><span className="font-medium">Notes:</span> Email, what hooked them, objections, decision-maker.</div>
                    <div><span className="font-medium">Follow-up:</span> Next day.</div>
                  </div>
                </div>

                {/* 6. Interested - Action Taken */}
                <div className="border-l-4 border-green-500 pl-3">
                  <div className="font-semibold text-gray-900">6️⃣ Interested — Action Taken</div>
                  <div className="text-gray-500 text-xs mb-1">(Trial Started, Registration Complete, Booking Made)</div>
                  <div className="text-gray-600 mt-1">
                    <div><span className="font-medium">Use when:</span> They take the CTA you wanted on the call.</div>
                    <div><span className="font-medium">Notes:</span> Contact email/phone, their goal, any setup notes.</div>
                    <div><span className="font-medium">Follow-up:</span> 1 day → confirm it worked; 3 days → tune/help.</div>
                  </div>
                </div>

                {/* 7. Callback Scheduled */}
                <div className="border-l-4 border-purple-500 pl-3">
                  <div className="font-semibold text-gray-900">7️⃣ Callback Scheduled</div>
                  <div className="text-gray-600 mt-1">
                    <div><span className="font-medium">Use when:</span> Future call agreed.</div>
                    <div><span className="font-medium">Notes:</span> Exact time, decision-maker, what they want to see.</div>
                    <div><span className="font-medium">Follow-up:</span> At scheduled time.</div>
                  </div>
                </div>

                {/* Notes Section */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-4">
                  <div className="font-semibold text-amber-800 mb-2">📝 NOTES — Always include:</div>
                  <ul className="text-amber-700 space-y-1 list-disc list-inside">
                    <li>Decision-maker</li>
                    <li>Their current process</li>
                    <li>Exact objection</li>
                    <li>Buying signal</li>
                  </ul>
                </div>
              </div>
              <div className="p-3 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => setShowOutcomeGuide(false)}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
                >
                  Got it!
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`fixed right-0 top-0 h-full bg-white shadow-2xl z-50 flex flex-col transition-all duration-300 ${
        isExpanded ? "w-full max-w-md" : "w-80"
      }`}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-green-500 to-green-600">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="text-white font-semibold truncate">
              {formattedDisplayName}
            </div>
            <div className="text-green-100 text-sm">
              {callState === "connected" ? formatDuration(callDuration) : "Call ended"}
            </div>
            {formattedDisplayNumber && (
              <div className="text-green-100 text-xs truncate">{formattedDisplayNumber}</div>
            )}
          </div>
          <button
            onClick={handleSendMessage}
            className="mr-1 px-2 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs rounded flex items-center gap-1"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            SMS
          </button>
          {leadInfo?.email && (
            <button
              onClick={() => setShowEmailModal(true)}
              className="mr-1 px-2 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs rounded flex items-center gap-1"
            >
              <Mail className="h-3.5 w-3.5" />
              Email
            </button>
          )}
          {/* Show loading state while fetching lead info */}
          {isLoadingLeadInfo && !leadInfo?.id && (
            <span className="mr-1 px-2 py-1.5 bg-white/10 text-white/60 text-xs rounded flex items-center gap-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading...
            </span>
          )}
          {leadInfo?.id && !onboardingScheduled && (
            <button
              onClick={() => setShowScheduleModal(true)}
              className="mr-1 px-2 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs rounded flex items-center gap-1"
            >
              <Calendar className="h-3.5 w-3.5" />
              Schedule
            </button>
          )}
          {onboardingScheduled && (
            <span className="mr-1 px-2 py-1.5 bg-green-400/40 text-white text-xs rounded flex items-center gap-1">
              <span className="text-green-200">✓</span>
              Scheduled
            </span>
          )}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="ml-1 p-1 text-white hover:bg-white/20 rounded"
          >
            {isExpanded ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <ChevronLeft className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Collapsed View */}
      {!isExpanded && (
        <div className="flex-1 flex flex-col items-center justify-center p-4 space-y-4">
          <div className="text-3xl font-mono font-bold text-gray-900">
            {formatDuration(callDuration)}
          </div>
          <div className="flex gap-3">
            <button
              onClick={toggleMute}
              className={`p-3 rounded-full ${
                isMuted
                  ? "bg-red-100 text-red-700"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            <button
              onClick={hangUp}
              className="p-3 bg-red-600 text-white rounded-full hover:bg-red-700"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Expanded View */}
      {isExpanded && (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Call Timer */}
            <div className="text-center py-4">
              <div className="text-4xl font-mono font-bold text-gray-900">
                {formatDuration(callDuration)}
              </div>
              <div className="text-sm text-gray-600 mt-1">Call Duration</div>
            </div>

            {/* Lead Info */}
            {leadInfo && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="font-semibold text-gray-900">{leadInfo.name}</div>
                {leadInfo.address && (
                  <div className="text-sm text-gray-600">{leadInfo.address}</div>
                )}
                {leadInfo.phone && (
                  <div className="text-sm text-gray-600">{leadInfo.phone}</div>
                )}
                {leadInfo.campaign && (
                  <div className="text-xs">
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                      {leadInfo.campaign.name}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Call Script Panel */}
            {(callScript || isLoadingScript) && (
              <div className="border border-blue-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setShowScript(!showScript)}
                  className="w-full px-4 py-3 bg-blue-50 hover:bg-blue-100 flex items-center justify-between text-left transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-600" />
                    <span className="font-medium text-blue-900">
                      {callScript?.name || "Call Script"}
                    </span>
                  </div>
                  {showScript ? (
                    <ChevronUp className="h-4 w-4 text-blue-600" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-blue-600" />
                  )}
                </button>
                {showScript && (
                  <div className="p-4 bg-white max-h-64 overflow-y-auto">
                    {isLoadingScript ? (
                      <div className="flex items-center justify-center py-4 text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Loading script...
                      </div>
                    ) : callScript ? (
                      <div 
                        className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ 
                          __html: callScript.content
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\{name\}/gi, `<span class="bg-yellow-100 px-1 rounded font-medium">${leadInfo?.name || '[Name]'}</span>`)
                            .replace(/\{business\}/gi, `<span class="bg-yellow-100 px-1 rounded font-medium">${leadInfo?.name || '[Business]'}</span>`)
                            .replace(/\n/g, '<br/>')
                        }}
                      />
                    ) : (
                      <div className="text-sm text-gray-500 italic">
                        No script available for this campaign.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Quick Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quick Notes
              </label>
              <textarea
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                onBlur={saveCallNotes}
                placeholder="Type notes during the call..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
                rows={3}
              />
            </div>

            {/* Dialpad */}
            <div>
              <button
                onClick={() => setShowDialpad(!showDialpad)}
                className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                {showDialpad ? "Hide Keypad" : "Show Keypad"}
              </button>
              {showDialpad && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((digit) => (
                    <button
                      key={digit}
                      onClick={() => sendDTMF(digit)}
                      className="p-4 bg-white border-2 border-gray-200 rounded-lg hover:bg-gray-50 font-bold text-xl"
                    >
                      {digit}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <div className="flex gap-3 justify-center">
              <button
                onClick={toggleMute}
                className={`p-4 rounded-full ${
                  isMuted
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
              </button>
              <button
                onClick={hangUp}
                className="p-4 bg-red-600 text-white rounded-full hover:bg-red-700"
              >
                <PhoneOff className="h-6 w-6" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Quick Email Modal */}
      {showEmailModal && leadInfo && (
        <QuickEmailModal
          leadId={leadInfo.id}
          leadName={leadInfo.name}
          leadEmail={leadInfo.email}
          leadAddress={leadInfo.address}
          onClose={() => setShowEmailModal(false)}
          onEmailSent={() => {
            toast.success("Email sent!");
          }}
        />
      )}

      {/* Schedule Onboarding Modal */}
      {showScheduleModal && leadInfo && (
        <ScheduleSlotPicker
          onClose={() => setShowScheduleModal(false)}
          onSave={async (data) => {
            setOnboardingScheduled(true);
            setShowScheduleModal(false);
            toast.success("Onboarding scheduled!");
          }}
          isSaving={false}
          leadId={leadInfo.id}
          isDialerMode={false}
          initialTimezone={null}
          initialTechOwner={leadInfo.name || null}
          initialPhone={leadInfo.phone || null}
          initialEmail={leadInfo.email || null}
        />
      )}
    </div>
  );
}

