"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { 
  Phone, PhoneOff, Mic, MicOff, SkipForward, X, 
  MessageSquare, Mail, Globe, MapPin, Star, 
  Clock, Calendar, ChevronRight, ChevronDown, Loader2, Play, Pause,
  AlertCircle, CheckCircle, Volume2, HelpCircle, Hash, Search, Trash2
} from "lucide-react";
import { inferLeadTimezone, getTimezoneLabel } from "@/lib/timezone-inference";
import { formatInTimezone, localToUtc, getDateInTimezone } from "@/lib/timezones";
import toast from "react-hot-toast";
import { useCall } from "./CallProvider";
import { BusinessResult, CallOutcomeCode, CTAResult, OUTCOME_OPTIONS, CTA_RESULT_OPTIONS, DialerModeType, JCCActivationRecord, LostReason, LOST_REASON_OPTIONS } from "@/lib/types";
import { 
  getBadgeFromDisposition, 
  getFollowUpDays, 
  calculateFollowUpDate,
  addDays
} from "@/lib/badges";
import { QuickEmailModal } from "./QuickEmailModal";
import { SendInfoModal } from "./SendInfoModal";
import { DialerKPIStrip } from "./DialerKPIStrip";
import { ScriptSidebar } from "./ScriptSidebar";
import { QuickDispoButtons } from "./QuickDispoButtons";
import { ActivationContextPanel } from './ActivationContextPanel';
import { ScheduleSlotPicker } from "./ScheduleSlotPicker";
import { ActivatorCallSummaryModal } from "./ActivatorCallSummaryModal";

interface DialerModeProps {
  onExit?: () => void;
  initialLeadId?: string;
  initialMode?: DialerModeType;
}

interface QueueLead extends BusinessResult {
  priority?: string;
  campaignId?: string;
  campaignName?: string;
  callCount?: number;
  lastCallOutcome?: string;
}

export function DialerMode({ onExit, initialLeadId, initialMode }: DialerModeProps) {
  // Call provider state
  const {
    callState,
    callDuration,
    isMuted,
    isInitialized,
    isDeviceReady,
    makeCall,
    hangUp,
    toggleMute,
    sendDTMF,
    getCallId,
    getLastCallSid,
    resetCallState,
  } = useCall();

  // Dialer state
  const [currentLead, setCurrentLead] = useState<QueueLead | null>(null);
  const [isLoadingLead, setIsLoadingLead] = useState(true);
  const [queueEmpty, setQueueEmpty] = useState(false);
  const [queueStats, setQueueStats] = useState({ total: 0, new: 0, followUp: 0 });
  
  // Dialer mode state
  const [dialerMode, setDialerMode] = useState<DialerModeType>(initialMode || "PROSPECTING");
  const [scriptKey, setScriptKey] = useState<string | null>(null);

  // JCC Activation state
  const [activationQueue, setActivationQueue] = useState<JCCActivationRecord[]>([]);
  const [currentActivation, setCurrentActivation] = useState<JCCActivationRecord | null>(null);
  const [isClaimingActivation, setIsClaimingActivation] = useState(false);
  const [isWritingBackToJCC, setIsWritingBackToJCC] = useState(false);
  
  // Call history state
  const [callHistory, setCallHistory] = useState<any[]>([]);
  const [showCallHistory, setShowCallHistory] = useState(false);
  
  // Call summary state
  const [showSummary, setShowSummary] = useState(false);
  const [summaryOutcomeCode, setSummaryOutcomeCode] = useState<CallOutcomeCode | "">("");
  const [summaryNotes, setSummaryNotes] = useState("");
  const [summaryNextActionAt, setSummaryNextActionAt] = useState("");
  const [summaryNextActionNote, setSummaryNextActionNote] = useState("");
  const [ctaAttempted, setCtaAttempted] = useState<boolean | null>(null);
  const [ctaResult, setCtaResult] = useState<CTAResult | "">("");
  const [isSavingSummary, setIsSavingSummary] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  // DNC (Do Not Contact) state
  const [showDncConfirm, setShowDncConfirm] = useState(false);
  const [doNotContact, setDoNotContact] = useState(false);
  // Lost reason state (for WRONG_NUMBER outcome which maps to closed_lost)
  const [showLostReasonModal, setShowLostReasonModal] = useState(false);
  const [showTimezoneModal, setShowTimezoneModal] = useState(false);
  const [lostReason, setLostReason] = useState<LostReason | "">("");
  const [lostReasonNotes, setLostReasonNotes] = useState("");

  // Modal state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showSendInfoModal, setShowSendInfoModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [onboardingScheduled, setOnboardingScheduled] = useState(false);
  const [showOutcomeGuide, setShowOutcomeGuide] = useState(false);
  const [showDialpad, setShowDialpad] = useState(false);
  const [showActivatorModal, setShowActivatorModal] = useState(false);
  
  // Search modal state
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isManualLead, setIsManualLead] = useState(false);

  // Auto-dial countdown
  const [autoDialCountdown, setAutoDialCountdown] = useState<number | null>(null);
  const [autoDialEnabled, setAutoDialEnabled] = useState(false);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Session timer
  const [sessionStartTime] = useState<Date>(new Date());

  // Compute script key based on lead context
  const computeScriptKey = (priority: string | undefined, _rescueType: null): string | null => {
    if (priority === "follow_up_due" || priority === "follow_up") {
      return "TRIAL_FOLLOWUP_1"; // Could be enhanced to pick 1/2/3 based on attempt count
    }
    return "PROSPECT_PITCH_CORE";
  };

  // Fetch JCC activation queue
  const fetchActivationQueue = useCallback(async () => {
    setIsLoadingLead(true);
    try {
      const response = await fetch('/api/jcc/activation-queue');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch activation queue');
      }
      
      if (data.queue) {
        setActivationQueue(data.queue);
        setQueueStats({ total: data.total || data.queue.length, new: 0, followUp: 0 });
        
        if (data.queue.length > 0) {
          setCurrentActivation(data.queue[0]);
          setQueueEmpty(false);
        } else {
          setCurrentActivation(null);
          setQueueEmpty(true);
        }
      }
    } catch (error: any) {
      console.error('Error fetching activation queue:', error);
      toast.error(error.message || 'Failed to load activation queue');
    } finally {
      setIsLoadingLead(false);
    }
  }, []);

  // Claim activation in JCC before dialing
  const claimActivation = async (activation: JCCActivationRecord): Promise<boolean> => {
    setIsClaimingActivation(true);
    try {
      const response = await fetch('/api/jcc/activation-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: activation.client_id }),
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.claimed) {
        if (data.claimed_by) {
          toast.error(`Already claimed by ${data.claimed_by}`);
        } else {
          toast.error(data.error || 'Failed to claim activation');
        }
        return false;
      }
      
      return true;
    } catch (error: any) {
      console.error('Error claiming activation:', error);
      toast.error('Failed to claim activation');
      return false;
    } finally {
      setIsClaimingActivation(false);
    }
  };

  // Write back contact attempt to JCC (MANDATORY after every activation call)
  const writeBackToJCC = async (
    clientId: string,
    callId: string,
    outcomeCode: string,
    notes: string,
    followUpAt?: string
  ): Promise<boolean> => {
    setIsWritingBackToJCC(true);
    try {
      const response = await fetch('/api/jcc/contact-attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          crm_call_id: callId,
          crm_outcome: outcomeCode,
          notes: notes,
          follow_up_at: followUpAt,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to write back to JCC');
      }
      
      toast.success(`JCC updated (${data.rescue_attempts} attempts)`);
      return true;
    } catch (error: any) {
      console.error('Error writing back to JCC:', error);
      toast.error('Failed to update JCC - please try again');
      return false;
    } finally {
      setIsWritingBackToJCC(false);
    }
  };

  // Transform JCC activation to QueueLead format for dialer
  const activationToQueueLead = (activation: JCCActivationRecord): QueueLead => ({
    id: activation.client_id,
    placeId: activation.client_id,
    name: activation.business_name,
    address: '',
    phone: activation.phone || undefined,
    email: activation.email,
    website: activation.website || undefined,
    contactName: activation.contact_name || undefined,
    priority: 'activation',
    lastContactedAt: activation.last_contact_at || undefined,
    nextActionAt: activation.next_action_due_at,
  });

  // Handle URL params for preloaded lead (from CRM page)
  const searchParams = useSearchParams();
  const preloadLeadId = searchParams.get('leadId');

  useEffect(() => {
    if (preloadLeadId && !currentLead) {
      fetch(`/api/leads/${preloadLeadId}`).then(r => r.json()).then(data => {
        if (data.lead) {
          setCurrentLead(data.lead);
          window.history.replaceState({}, '', '/dashboard/dialer');
        }
      }).catch(err => {
        console.error('Error fetching preloaded lead:', err);
      });
    }
  }, [preloadLeadId]);

  // Fetch next lead from queue
  const fetchNextLead = useCallback(async () => {
    // Reset modal states when loading new lead
    setShowScheduleModal(false);
    setOnboardingScheduled(false);
    
    if (dialerMode === 'ACTIVATION') {
      fetchActivationQueue();
      return;
    }
    setIsLoadingLead(true);
    setQueueEmpty(false);
    
    try {
      // Build URL with mode parameters
      const params = new URLSearchParams({ dialer: "true" });
      
      if (dialerMode === "FOLLOWUPS") {
        params.set("mode", "followups");
      }
      
      const response = await fetch(`/api/leads/next?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch next lead");
      }

      if (data.lead) {
        const lead: QueueLead = {
          id: data.lead.id,
          placeId: data.lead.place_id,
          name: data.lead.name,
          address: data.lead.address,
          phone: data.lead.phone,
          email: data.lead.email,
          website: data.lead.website,
          rating: data.lead.rating,
          reviewCount: data.lead.review_count,
          leadStatus: data.lead.lead_status,
          nextActionAt: data.lead.next_action_at,
          nextActionNote: data.lead.next_action_note,
          lastContactedAt: data.lead.last_contacted_at,
          contactName: data.lead.contact_name,
          priority: data.priority,
          campaignId: data.lead.campaign_id,
          campaignName: data.lead.campaign_name,
          callCount: data.lead.call_count,
          lastCallOutcome: data.lead.last_call_outcome,
          badgeKey: data.lead.badge_key,
          doNotContact: data.lead.do_not_contact,
          ownerSdrId: data.lead.owner_sdr_id,
          nextFollowUpAt: data.lead.next_follow_up_at,
        };
        setCurrentLead(lead);
        setQueueStats(data.queueStats || { total: 0, new: 0, followUp: 0 });
        
        // Update script key from response
        if (data.scriptKey) {
          setScriptKey(data.scriptKey);
        } else {
          // Compute script key based on context
          setScriptKey(computeScriptKey(data.priority, null));
        }
        
        // Fetch call history for this lead
        try {
          const historyRes = await fetch(`/api/calls/history?leadId=${lead.id}&limit=5`);
          const historyData = await historyRes.json();
          if (historyData.success) {
            setCallHistory(historyData.calls || []);
          } else {
            setCallHistory([]);
          }
        } catch (error) {
          console.error("Error fetching call history:", error);
          setCallHistory([]);
        }
        
        // Start auto-dial countdown if enabled
        if (autoDialEnabled && lead.phone) {
          startAutoDialCountdown();
        }
      } else {
        // No more leads in current mode
        setCurrentLead(null);
        setQueueEmpty(true);
      }
    } catch (error: any) {
      console.error("Error fetching next lead:", error);
      toast.error(error.message || "Failed to load next lead");
    } finally {
      setIsLoadingLead(false);
    }
  }, [autoDialEnabled, dialerMode]);

  // Function to load a specific lead by ID
  const loadLeadById = async (leadId: string) => {
    // Reset modal states
    setShowScheduleModal(false);
    setOnboardingScheduled(false);
    
    setIsLoadingLead(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`);
      if (!res.ok) {
        toast.error("Failed to load lead");
        fetchNextLead();
        return;
      }
      const data = await res.json();
      if (data.lead) {
        const lead: QueueLead = {
          id: data.lead.id,
          placeId: data.lead.place_id,
          name: data.lead.name,
          address: data.lead.address,
          phone: data.lead.phone,
          email: data.lead.email,
          website: data.lead.website,
          rating: data.lead.rating,
          reviewCount: data.lead.review_count,
          leadStatus: data.lead.lead_status,
          assignedTo: data.lead.assigned_to,
          nextActionAt: data.lead.next_action_at,
          nextActionNote: data.lead.next_action_note,
          lastContactedAt: data.lead.last_contacted_at,
          priority: "manual",
        };
        setCurrentLead(lead);
        setIsManualLead(true);
        
        // Fetch call history for this lead
        try {
          const historyRes = await fetch(`/api/calls/history?leadId=${lead.id}`);
          if (historyRes.ok) {
            const historyData = await historyRes.json();
            setCallHistory(historyData.calls || []);
          }
        } catch (error) {
          console.error("Error fetching call history:", error);
        }
      } else {
        toast.error("Lead not found");
        fetchNextLead();
      }
    } catch (error) {
      console.error("Error loading lead:", error);
      toast.error("Failed to load lead");
      fetchNextLead();
    } finally {
      setIsLoadingLead(false);
    }
  };

  // Initial load
  useEffect(() => {
    if (initialLeadId) {
      loadLeadById(initialLeadId);
    } else if (dialerMode === 'ACTIVATION') {
      fetchActivationQueue();
    } else {
      fetchNextLead();
    }
  }, []);

  // Sync currentLead with currentActivation in ACTIVATION mode
  useEffect(() => {
    if (currentActivation && dialerMode === 'ACTIVATION') {
      setCurrentLead(activationToQueueLead(currentActivation));
    }
  }, [currentActivation, dialerMode]);

  // Check URL params for initial mode
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const mode = params.get("mode");
      if (mode === "followups") {
        setDialerMode("FOLLOWUPS");
      }
    }
  }, []);

  useEffect(() => {
    if (dialerMode === 'ACTIVATION') {
      fetchActivationQueue();
    }
  }, [dialerMode]);

  // Handle call state changes
  useEffect(() => {
    if (callState === "ended") {
      // Cancel any auto-dial countdown
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      setAutoDialCountdown(null);
      
      // Get call ID and show summary
      const currentCallId = getCallId();
      if (currentCallId) {
        setCallId(currentCallId);
      } else {
        // Try to get from CallSid
        const callSid = getLastCallSid();
        if (callSid) {
          setTimeout(async () => {
            try {
              const response = await fetch(`/api/calls/by-sid?twilioCallSid=${encodeURIComponent(callSid)}`);
              if (response.ok) {
                const data = await response.json();
                if (data.call?.id) {
                  setCallId(data.call.id);
                }
              }
            } catch (err) {
              console.error("Error looking up call ID:", err);
            }
          }, 500);
        }
      }
      
      // For ACTIVATION mode, show the Activator modal instead of default summary
      if (dialerMode === 'ACTIVATION' && currentActivation) {
        setShowActivatorModal(true);
      } else {
        setShowSummary(true);
      }
    }
  }, [callState, getCallId, getLastCallSid, dialerMode, currentActivation]);

  // Auto-dial countdown
  const startAutoDialCountdown = () => {
    setAutoDialCountdown(3);
    countdownRef.current = setInterval(() => {
      setAutoDialCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          // Trigger the call
          if (currentLead?.phone) {
            handleDial();
          }
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelAutoDialCountdown = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setAutoDialCountdown(null);
  };

  // Dial current lead
  const handleDial = async () => {
    // ACTIVATION MODE: Must claim first
    if (dialerMode === 'ACTIVATION' && currentActivation) {
      const claimed = await claimActivation(currentActivation);
      if (!claimed) {
        // Remove from local queue and load next
        const newQueue = activationQueue.filter(a => a.client_id !== currentActivation.client_id);
        setActivationQueue(newQueue);
        if (newQueue.length > 0) {
          setCurrentActivation(newQueue[0]);
        } else {
          setCurrentActivation(null);
          setQueueEmpty(true);
        }
        return;
      }
    }

    if (!currentLead?.phone || !currentLead?.id) {
      toast.error("No phone number available");
      return;
    }

    cancelAutoDialCountdown();

    try {
      await makeCall(currentLead.id, currentLead.phone, currentLead.name);
    } catch (error: any) {
      console.error("Error making call:", error);
      toast.error(error.message || "Failed to start call");
    }
  };

  // Skip current lead (snooze 30 mins so a different lead appears)
  const handleSkip = async () => {
    cancelAutoDialCountdown();
    if (currentLead?.id) {
      try {
        // Always try to route to activator first (works for trial leads in rescue mode)
        const routeRes = await fetch(`/api/leads/${currentLead.id}/route-to-activator`, { method: "POST" });
        const routeData = routeRes.ok ? await routeRes.json() : null;
        
        if (routeData?.routed) {
          toast.success("Trial lead routed to activator");
        } else {
          // No trial - try to snooze
          const snoozeRes = await fetch(`/api/leads/${currentLead.id}/snooze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hours: 0.5 }),
          });
          
          if (!snoozeRes.ok) {
            const snoozeData = await snoozeRes.json();
            // If not authorized (403), still proceed but show warning
            if (snoozeRes.status === 403) {
              toast("Lead not assigned to you - skipping", { icon: "⚠️" });
            } else {
              throw new Error(snoozeData.error || "Failed to skip");
            }
          } else {
            toast.success("Skipped - snoozed for 30 mins");
          }
        }
      } catch (error: any) {
        console.error("Error skipping lead:", error);
        toast.error(error.message || "Failed to skip lead");
      }
    } else {
      toast.error("No lead to skip");
    }
    fetchNextLead();
  };

  // Remove bad lead from queue (wrong industry, bad data, etc.)
  const handleBadLead = async (reason: string) => {
    if (!currentLead?.id) return;
    setIsRemovingBadLead(true);
    try {
      // Mark as not_interested to remove from dialer queue
      await fetch(`/api/leads/${currentLead.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "not_interested" }),
      });
      // Add note explaining why
      await fetch(`/api/leads/${currentLead.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: `Removed as bad lead: ${reason}` }),
      });
      toast.success("Bad lead removed from queue");
      setShowBadLeadModal(false);
      fetchNextLead();
    } catch (error: any) {
      console.error("Error removing bad lead:", error);
      toast.error("Failed to remove lead");
    } finally {
      setIsRemovingBadLead(false);
    }
  };

  // Snooze current lead (push follow-up forward)
  const [isSnoozing, setIsSnoozing] = useState(false);
  // Bad lead removal
  const [showBadLeadModal, setShowBadLeadModal] = useState(false);
  const [isRemovingBadLead, setIsRemovingBadLead] = useState(false);
  const handleSnooze = async (hours: number = 2) => {
    if (!currentLead?.id) return;
    
    setIsSnoozing(true);
    try {
      const response = await fetch(`/api/leads/${currentLead.id}/snooze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to snooze lead");
      }

      const data = await response.json();
      toast.success(`Snoozed for ${hours} hours`);
      // Move to next lead
      fetchNextLead();
    } catch (error: any) {
      console.error("Error snoozing lead:", error);
      toast.error(error.message || "Failed to snooze lead");
    } finally {
      setIsSnoozing(false);
    }
  };

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Format date for datetime-local input
  const formatDateTimeLocal = (date: Date) => {
    const pad = (value: number) => `${value}`.padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  // Schedule callback helper - schedules at 9am in LEAD's timezone
  const scheduleCallbackInDays = (days: number) => {
    const leadTz = currentLead?.leadTimezone || 'America/New_York';
    
    // Get current date in lead's timezone (YYYY-MM-DD format)
    const now = new Date();
    const leadTodayStr = getDateInTimezone(now, leadTz);
    
    // Parse date components
    const [year, month, day] = leadTodayStr.split('-').map(Number);
    
    // Create date in lead's timezone, add days
    // Use UTC date arithmetic to avoid timezone shifts
    const leadToday = new Date(Date.UTC(year, month - 1, day));
    const targetDate = new Date(leadToday);
    targetDate.setUTCDate(targetDate.getUTCDate() + days);
    
    // Construct datetime-local string for 9am in lead's timezone
    const yearStr = targetDate.getUTCFullYear();
    const monthStr = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
    const dayStr = String(targetDate.getUTCDate()).padStart(2, '0');
    const leadDateTimeStr = `${yearStr}-${monthStr}-${dayStr}T09:00`;
    
    // Convert lead's local time (9am) to UTC, then to SDR's local for the input
    const utcTime = localToUtc(leadDateTimeStr, leadTz);
    const sdrLocal = new Date(utcTime);
    const formatted = formatDateTimeLocal(sdrLocal);
    setSummaryNextActionAt(formatted);
    
    if (!summaryNextActionNote) {
      const leadDateDisplay = formatInTimezone(new Date(utcTime), leadTz, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      setSummaryNextActionNote(`Follow-up scheduled for ${leadDateDisplay} (lead's time)`);
    }
  };

  // Schedule callback for today - sets to 4pm in LEAD's timezone
  const scheduleCallbackToday = () => {
    const leadTz = currentLead?.leadTimezone || 'America/New_York';
    
    // Get current date in lead's timezone
    const now = new Date();
    const leadDateStr = getDateInTimezone(now, leadTz);
    
    // Set to 4pm in lead's timezone
    const leadDateTimeStr = `${leadDateStr}T16:00`;
    
    // Convert lead's local time to UTC, then to SDR's local for the input
    const utcTime = localToUtc(leadDateTimeStr, leadTz);
    const sdrLocal = new Date(utcTime);
    const formatted = formatDateTimeLocal(sdrLocal);
    setSummaryNextActionAt(formatted);
    
    if (!summaryNextActionNote) {
      setSummaryNextActionNote("Callback requested - call back today at 4pm (lead's timezone)");
    }
  };

  // Handle exit with validation - block if call needs disposition
  const handleExit = () => {
    // Check if there's an active call that needs disposition
    if (callState !== "idle" && callState !== "ended") {
      toast.error("Please end the call before exiting");
      return;
    }
    
    // Check if there's a completed call without disposition
    if (callId && !summaryOutcomeCode) {
      toast.error("Please select a call outcome before exiting");
      // Show the summary panel if not already showing
      if (!showSummary) {
        setShowSummary(true);
      }
      return;
    }
    
    // Safe to exit
    onExit?.();
  };

  // Get lead status from outcome
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

  // Map to old outcome
  const getOldOutcomeFromCode = (code: CallOutcomeCode | ""): string => {
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

  // Is conversation outcome (real talk)
  const isConversationOutcome = (code: CallOutcomeCode | ""): boolean => {
    return ["NOT_INTERESTED", "INTERESTED_INFO_SENT", "TRIAL_STARTED", "CALLBACK_SCHEDULED"].includes(code);
  };

  // Search for leads
  const handleSearchLeads = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`/api/leads?assigned=me&limit=100`);
      if (!response.ok) {
        throw new Error("Failed to search leads");
      }

      const data = await response.json();
      const leads = data.leads || [];
      
      // Client-side filtering by name, phone, email, or contact name
      const searchLower = query.toLowerCase();
      const filtered = leads.filter((lead: any) => {
        const nameMatch = lead.name?.toLowerCase().includes(searchLower);
        const phoneMatch = lead.phone?.includes(query);
        const emailMatch = lead.email?.toLowerCase().includes(searchLower);
        const contactMatch = lead.contact_name?.toLowerCase().includes(searchLower);
        return nameMatch || phoneMatch || emailMatch || contactMatch;
      });

      setSearchResults(filtered);
    } catch (error: any) {
      console.error("Error searching leads:", error);
      toast.error("Failed to search leads");
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounce search
  useEffect(() => {
    if (!showSearchModal) return;
    
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        handleSearchLeads(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, showSearchModal, handleSearchLeads]);

  // Load a manually selected lead
  const handleLoadManualLead = async (lead: any) => {
    if (!lead.phone) {
      toast.error("This lead doesn't have a phone number");
      return;
    }

    setShowSearchModal(false);
    setSearchQuery("");
    setSearchResults([]);
    
    // Transform the lead to match QueueLead format
    const transformedLead: QueueLead = {
      id: lead.id,
      placeId: lead.place_id,
      name: lead.name,
      address: lead.address,
      phone: lead.phone,
      email: lead.email,
      website: lead.website,
      rating: lead.rating,
      reviewCount: lead.review_count,
      leadStatus: lead.lead_status,
      nextActionAt: lead.next_action_at,
      nextActionNote: lead.next_action_note,
      lastContactedAt: lead.last_contacted_at,
      contactName: lead.contact_name,
      priority: "manual",
      campaignId: lead.campaign_id,
      campaignName: lead.campaign_name,
      callCount: lead.call_count || 0,
      lastCallOutcome: lead.last_call_outcome,
      badgeKey: lead.badge_key,
      doNotContact: lead.do_not_contact,
    };

    setCurrentLead(transformedLead);
    setIsManualLead(true);
    
    // Fetch call history for this lead
    try {
      const historyRes = await fetch(`/api/calls/history?leadId=${lead.id}`);
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        setCallHistory(historyData.calls || []);
      }
    } catch (error) {
      console.error("Error fetching call history:", error);
    }

    // Get campaign info if available
    if (lead.campaign_id) {
      try {
        const campaignRes = await fetch(`/api/campaigns/${lead.campaign_id}`);
        if (campaignRes.ok) {
          const campaignData = await campaignRes.json();
          transformedLead.campaignName = campaignData.campaign?.name;
          setCurrentLead({ ...transformedLead, campaignName: campaignData.campaign?.name });
        }
      } catch (error) {
        console.error("Error fetching campaign info:", error);
      }
    }

    toast.success(`Loaded ${lead.name}`);
  };

  // Save summary and load next lead
  const handleSaveAndNext = async () => {
    // VALIDATION: Disposition required
    if (!summaryOutcomeCode) {
      toast.error("Please select a call outcome");
      return;
    }

    // VALIDATION: Follow-up required for non-closing outcomes
    const CLOSING_OUTCOMES = ["NOT_INTERESTED", "WRONG_NUMBER"];
    if (!CLOSING_OUTCOMES.includes(summaryOutcomeCode) && !summaryNextActionAt) {
      toast.error("A follow-up date/time is required for this outcome. Please schedule a follow-up.");
      return;
    }

    let effectiveCallId = callId;

    // Try to get call ID if we don't have it
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
      toast.error("Call not yet saved. Please wait and try again.");
      return;
    }

    // ACTIVATION MODE: Mandatory JCC write-back
    if (dialerMode === 'ACTIVATION' && currentActivation) {
      const followUpIso = summaryNextActionAt 
        ? new Date(summaryNextActionAt).toISOString() 
        : undefined;
      
      const jccSuccess = await writeBackToJCC(
        currentActivation.client_id,
        effectiveCallId,
        summaryOutcomeCode,
        summaryNotes,
        followUpIso
      );
      
      if (!jccSuccess) {
        // Block save if JCC write-back failed
        return;
      }
    }

    setIsSavingSummary(true);

    try {
      // Determine badge and follow-up
      let badgeKey = getBadgeFromDisposition(summaryOutcomeCode);
      let followUpDate: string | undefined = summaryNextActionAt || undefined;

      // For Info, auto-set +7d if not set manually
      if (summaryOutcomeCode === "INTERESTED_INFO_SENT" && !followUpDate) {
        const defaultDate = addDays(new Date(), 7);
        followUpDate = formatDateTimeLocal(defaultDate);
      }

      // For Not Interested with DNC, set badge to dnc and clear follow-up
      if (summaryOutcomeCode === "NOT_INTERESTED" && doNotContact) {
        badgeKey = "dnc";
        followUpDate = undefined; // clear follow-up for DNC
      }

      const derivedLeadStatus = getLeadStatusFromOutcomeCode(summaryOutcomeCode);
      const oldOutcome = getOldOutcomeFromCode(summaryOutcomeCode);
      const nextActionIso = followUpDate ? new Date(followUpDate).toISOString() : (doNotContact ? null : undefined);

      const response = await fetch(`/api/calls/${effectiveCallId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome: oldOutcome || undefined,
          outcomeCode: summaryOutcomeCode || undefined,
          notes: summaryNotes || undefined,
          leadStatus: derivedLeadStatus || undefined,
          nextActionAt: nextActionIso,
          nextActionNote: summaryNextActionNote || undefined,
          ctaAttempted: ctaAttempted ?? undefined,
          ctaResult: ctaResult || undefined,
          // New badge system fields
          badgeKey: badgeKey,
          doNotContact: doNotContact,
          nextFollowUpAt: nextActionIso,
          // Lost reason fields (for WRONG_NUMBER outcome)
          lostReason: lostReason || undefined,
          lostReasonNotes: lostReasonNotes || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save call summary");
      }

      toast.success("Saved! Loading next lead...");
      
      // Reset state
      resetSummaryState();
      resetCallState();
      
      // If this was a manual lead, reset the flag and go back to queue
      if (isManualLead) {
        setIsManualLead(false);
      }
      
      // Load next lead
      fetchNextLead();
    } catch (err: any) {
      console.error("Error saving summary:", err);
      toast.error(err.message || "Failed to save");
    } finally {
      setIsSavingSummary(false);
    }
  };

  // Skip summary and load next
  const handleSkipSummary = () => {
    resetSummaryState();
    resetCallState();
    fetchNextLead();
  };

  // Reset summary state
  const resetSummaryState = () => {
    setShowSummary(false);
    setShowScheduleModal(false);
    setOnboardingScheduled(false);
    setCallId(null);
    setSummaryOutcomeCode("");
    setSummaryNotes("");
    setSummaryNextActionAt("");
    setSummaryNextActionNote("");
    setCtaAttempted(null);
    setCtaResult("");
    setShowDncConfirm(false);
    setDoNotContact(false);
    setShowLostReasonModal(false);
    setLostReason("");
    setLostReasonNotes("");
    setCallHistory([]);
    setShowCallHistory(false);
  };

  // Handle quick disposition
  const handleQuickDispo = (code: CallOutcomeCode) => {
    setSummaryOutcomeCode(code);
    
    // Show lost reason modal for WRONG_NUMBER (maps to closed_lost)
    if (code === "WRONG_NUMBER") {
      setShowLostReasonModal(true);
      setLostReason("");
      setLostReasonNotes("");
      return; // Don't proceed until lost reason is provided
    }
    
    // Show DNC confirmation for Not Interested
    if (code === "NOT_INTERESTED") {
      setShowDncConfirm(true);
      setDoNotContact(false); // default OFF (soft no)
    } else {
      setShowDncConfirm(false);
      setDoNotContact(false);
    }
    
    // Auto-set follow-up based on cadence (except Callback which is manual)
    const followUpDays = getFollowUpDays(code);
    if (followUpDays !== null && code !== "CALLBACK_SCHEDULED") {
      const followUpDate = addDays(new Date(), followUpDays);
      setSummaryNextActionAt(formatDateTimeLocal(followUpDate));
    }
    
    // Auto-set CTA attempted for conversation outcomes
    if (isConversationOutcome(code) && ctaAttempted === null) {
      setCtaAttempted(true);
    }
    
    // Auto-open send info modal when Info is selected
    if (code === "INTERESTED_INFO_SENT" && currentLead) {
      setShowSendInfoModal(true);
    }
    
    // Auto-open schedule modal when Schedule Onboarding is selected
    if (code === "ONBOARDING_SCHEDULED" && currentLead && !onboardingScheduled) {
      setShowScheduleModal(true);
    }
    
  };

  // Helper: Get outcome display label
  const getOutcomeLabel = (outcome: string): string => {
    const labels: Record<string, string> = {
      "NO_ANSWER": "No Answer",
      "BUSY": "Busy",
      "WRONG_NUMBER": "Wrong Number",
      "NOT_INTERESTED": "Not Interested",
      "INTERESTED_INFO_SENT": "Info Sent",
      "TRIAL_STARTED": "Trial Started",
      "ONBOARDING_SCHEDULED": "Onboarding Scheduled",
      "SCHEDULE_REFUSED": "Schedule Refused",
      "DM_UNAVAILABLE": "Decision Maker Unavailable",
      "CALLBACK_SCHEDULED": "Callback Scheduled",
      // Old outcome values
      "no_answer": "No Answer",
      "busy": "Busy",
      "wrong_number": "Wrong Number",
      "not_interested": "Not Interested",
      "interested": "Interested",
      "callback_requested": "Callback",
    };
    return labels[outcome] || outcome;
  };

  // Helper: Get outcome styling
  const getOutcomeStyle = (outcome: string): { bg: string; text: string; icon: string } => {
    const styles: Record<string, { bg: string; text: string; icon: string }> = {
      "INTERESTED_INFO_SENT": { 
        bg: "bg-blue-500/10 border border-blue-500/30", 
        text: "text-blue-400",
        icon: "text-blue-400"
      },
      "TRIAL_STARTED": { 
        bg: "bg-green-500/10 border border-green-500/30", 
        text: "text-green-400",
        icon: "text-green-400"
      },
      "ONBOARDING_SCHEDULED": { 
        bg: "bg-green-500/10 border border-green-500/30", 
        text: "text-green-400",
        icon: "text-green-400"
      },
      "CALLBACK_SCHEDULED": { 
        bg: "bg-purple-500/10 border border-purple-500/30", 
        text: "text-purple-400",
        icon: "text-purple-400"
      },
      "NOT_INTERESTED": { 
        bg: "bg-red-500/10 border border-red-500/30", 
        text: "text-red-400",
        icon: "text-red-400"
      },
      "NO_ANSWER": { 
        bg: "bg-slate-500/10 border border-slate-500/30", 
        text: "text-slate-400",
        icon: "text-slate-400"
      },
      "BUSY": { 
        bg: "bg-orange-500/10 border border-orange-500/30", 
        text: "text-orange-400",
        icon: "text-orange-400"
      },
    };
    return styles[outcome] || { bg: "bg-slate-500/10 border border-slate-500/30", text: "text-slate-400", icon: "text-slate-400" };
  };

  // Helper: Format time ago
  const formatTimeAgo = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  // Get follow-up call number (1st, 2nd, 3rd, etc.)
  const getCallAttemptNumber = (): number => {
    return (currentLead?.callCount || 0) + 1;
  };

  // Check if this is a follow-up call
  const isFollowUpCall = (): boolean => {
    return currentLead?.priority === "follow_up_due" || 
           currentLead?.priority === "follow_up" ||
           currentLead?.priority === "info_sent_follow_up" ||
           (currentLead?.callCount || 0) > 0;
  };

  // Render loading state
  if (isLoadingLead && !currentLead) {
    return (
      <div className="fixed inset-0 bg-slate-900 z-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-white text-lg">Loading dialer...</p>
        </div>
      </div>
    );
  }

  // Render queue empty state
  if (queueEmpty && !currentLead) {
    return (
      <div className="fixed inset-0 bg-slate-900 z-50 flex flex-col">
        <DialerKPIStrip sessionStartTime={sessionStartTime} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md mx-auto p-8">
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-10 w-10 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">All Caught Up!</h2>
            <p className="text-slate-400 mb-6">
              You've processed all available leads in your queue. Great work!
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={fetchNextLead}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
              >
                Refresh Queue
              </button>
              <button
                onClick={handleExit}
                className="px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 font-medium transition-colors"
              >
                Exit Dialer
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Check if in active call
  const isInCall = callState === "connected" || callState === "connecting" || callState === "ringing";

  return (
    <div className="fixed inset-0 bg-slate-900 z-50 flex flex-col">
      {/* KPI Strip */}
      <DialerKPIStrip sessionStartTime={sessionStartTime} />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side - Lead Info & Call Controls */}
        <div className="flex-1 flex flex-col p-6 overflow-y-auto">
          {/* Queue Info Bar */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              {/* Device Status Indicator */}
              <div className="flex items-center gap-2" title={isDeviceReady ? "Phone connected" : "Phone disconnected - reconnecting..."}>
                <span className={`w-2.5 h-2.5 rounded-full ${isDeviceReady ? "bg-green-500" : "bg-red-500 animate-pulse"}`} />
                <span className={`text-xs font-medium ${isDeviceReady ? "text-green-400" : "text-red-400"}`}>
                  {isDeviceReady ? "Ready" : "Reconnecting..."}
                </span>
              </div>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400 text-sm">
                Queue: <span className="text-white font-medium">{queueStats.total}</span> leads
                {queueStats.new > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
                    {queueStats.new} new
                  </span>
                )}
                {queueStats.followUp > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">
                    {queueStats.followUp} follow-ups
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {/* Search Lead Button */}
              <button
                onClick={() => setShowSearchModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                title="Search for a specific lead to call"
              >
                <Search className="h-4 w-4" />
                Search Lead
              </button>
              {/* Auto-dial toggle */}
              <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoDialEnabled}
                  onChange={(e) => setAutoDialEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                />
                Auto-dial
              </label>
              <button
                onClick={handleExit}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                title="Exit Dialer Mode"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Lead Card */}
          {currentLead && (
            <>
              {/* Follow-up Context Card - shows for follow-up calls */}
              {isFollowUpCall() && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Phone className="h-5 w-5 text-amber-400" />
                      <span className="text-lg font-bold text-amber-400">
                        Follow-up Call #{getCallAttemptNumber()}
                      </span>
                    </div>
                    {currentLead?.lastCallOutcome && (
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getOutcomeStyle(currentLead.lastCallOutcome).bg} ${getOutcomeStyle(currentLead.lastCallOutcome).text}`}>
                        Last: {getOutcomeLabel(currentLead.lastCallOutcome)}
                      </span>
                    )}
                  </div>
                  
                  {/* Prior Call Notes - Always visible */}
                  {callHistory.length > 0 && callHistory[0]?.notes && (
                    <div className="bg-slate-900/50 rounded-lg p-3">
                      <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Notes from last call:</div>
                      <p className="text-slate-300 text-sm">{callHistory[0].notes}</p>
                    </div>
                  )}
                  
                  {/* Show if no notes from prior call */}
                  {callHistory.length > 0 && !callHistory[0]?.notes && (
                    <div className="text-xs text-slate-500 italic">No notes from previous call</div>
                  )}
                </div>
              )}
              <div className="bg-slate-800 rounded-xl p-6 mb-6">
              {/* Lead Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-1">{currentLead.name}</h2>
                  {currentLead.contactName && (
                    <p className="text-slate-300 text-sm mb-1">Contact: {currentLead.contactName}</p>
                  )}
                  {currentLead.campaignName && (
                    <span className="inline-block px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded-full">
                      {currentLead.campaignName}
                    </span>
                  )}
                </div>
                {currentLead.priority && (
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    currentLead.priority === "new" 
                      ? "bg-green-500/20 text-green-400" 
                      : "bg-amber-500/20 text-amber-400"
                  }`}>
                    {currentLead.priority === "new" ? "New Lead" : `Follow-up #${getCallAttemptNumber()}`}
                  </span>
                )}
              </div>

              {/* Lead Details Grid */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                {currentLead.phone && (
                  <div className="flex items-center gap-2 text-slate-300">
                    <Phone className="h-4 w-4 text-slate-500" />
                    <span className="font-mono">{currentLead.phone}</span>
                  </div>
                )}
                {currentLead.address && (
                  <div className="flex items-center gap-2 text-slate-300">
                    <MapPin className="h-4 w-4 text-slate-500" />
                    <span className="truncate">{currentLead.address}</span>
                  </div>
                )}
                {currentLead.email && (
                  <div className="flex items-center gap-2 text-slate-300">
                    <Mail className="h-4 w-4 text-slate-500" />
                    <span className="truncate">{currentLead.email}</span>
                  </div>
                )}
                {currentLead.website && (
                  <div className="flex items-center gap-2 text-slate-300">
                    <Globe className="h-4 w-4 text-slate-500" />
                    <a 
                      href={currentLead.website.startsWith("http") ? currentLead.website : `https://${currentLead.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-blue-400 hover:underline"
                    >
                      {currentLead.website.replace(/^https?:\/\//, "")}
                    </a>
                  </div>
                )}
                {currentLead.rating && (
                  <div className="flex items-center gap-2 text-slate-300">
                    <Star className="h-4 w-4 text-yellow-500 fill-current" />
                    <span>{currentLead.rating.toFixed(1)} ({currentLead.reviewCount || 0} reviews)</span>
                  </div>
                )}
                {currentLead.lastContactedAt && (
                  <div className="flex items-center gap-2 text-slate-300">
                    <Clock className="h-4 w-4 text-slate-500" />
                    <span>Last contact: {new Date(currentLead.lastContactedAt).toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              {/* Last Call Outcome - shows why this lead is in queue */}
              {currentLead.lastCallOutcome && (
                <div className={`rounded-lg p-3 mb-4 ${getOutcomeStyle(currentLead.lastCallOutcome).bg}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Phone className={`h-4 w-4 ${getOutcomeStyle(currentLead.lastCallOutcome).icon}`} />
                      <span className={`text-sm font-medium ${getOutcomeStyle(currentLead.lastCallOutcome).text}`}>
                        Last Call: {getOutcomeLabel(currentLead.lastCallOutcome)}
                      </span>
                    </div>
                    {currentLead.lastContactedAt && (
                      <span className="text-xs text-slate-500">
                        {formatTimeAgo(currentLead.lastContactedAt)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Follow-up Note if exists */}
              {currentLead.nextActionNote && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-6">
                  <div className="flex items-center gap-2 text-amber-400 text-sm font-medium mb-1">
                    <Calendar className="h-4 w-4" />
                    Follow-up Note
                  </div>
                  <p className="text-slate-300 text-sm">{currentLead.nextActionNote}</p>
                </div>
              )}

              {/* Previous Call History */}
              {callHistory.length > 0 && (
                <div className="mb-4">
                  <button
                    onClick={() => setShowCallHistory(!showCallHistory)}
                    className="w-full flex items-center justify-between p-3 bg-slate-800 rounded-lg hover:bg-slate-700 transition"
                  >
                    <span className="text-sm font-medium text-slate-300">
                      Previous Calls ({callHistory.length})
                    </span>
                    <ChevronDown className={`h-4 w-4 text-slate-400 transition ${showCallHistory ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {showCallHistory && (
                    <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                      {callHistory.map((call) => (
                        <div key={call.id} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-slate-400">
                              {new Date(call.initiatedAt).toLocaleDateString()}
                              {call.outcome || call.outcomeCode ? ` - ${getOutcomeLabel(call.outcome || call.outcomeCode || '')}` : ''}
                            </span>
                            <span className="text-xs text-slate-500">
                              {call.duration ? `${Math.floor(call.duration / 60)}m ${call.duration % 60}s` : '-'}
                            </span>
                          </div>
                          {call.notes && (
                            <p className="text-sm text-slate-300 mt-1">{call.notes}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Call Controls */}
              <div className="flex items-center gap-4">
                {!isInCall && !showSummary ? (
                  <>
                    {/* Dial Button with Countdown */}
                    <button
                      onClick={handleDial}
                      disabled={!isInitialized || !currentLead.phone}
                      className={`flex-1 py-4 ${
                        !isDeviceReady 
                          ? "bg-amber-600 hover:bg-amber-700" 
                          : "bg-green-600 hover:bg-green-700"
                      } disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-3 transition-colors`}
                    >
                      <Phone className="h-6 w-6" />
                      {!isDeviceReady ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-5 w-5 animate-spin" />
                          Reconnecting...
                        </span>
                      ) : autoDialCountdown !== null ? (
                        <span>Calling in {autoDialCountdown}...</span>
                      ) : (
                        <span>Dial</span>
                      )}
                    </button>
                    
                    {autoDialCountdown !== null && (
                      <button
                        onClick={cancelAutoDialCountdown}
                        className="px-6 py-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition-colors"
                      >
                        <Pause className="h-5 w-5" />
                      </button>
                    )}
                    
                    {/* Snooze button - only show for follow-ups */}
                    {(currentLead.priority === "follow_up" || currentLead.priority === "follow_up_due") && (
                      <button
                        onClick={() => handleSnooze(2)}
                        disabled={isSnoozing}
                        className="px-6 py-4 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl font-medium flex items-center gap-2 transition-colors"
                        title="Snooze this follow-up for 2 hours (e.g., for timezone issues)"
                      >
                        {isSnoozing ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Clock className="h-5 w-5" />
                        )}
                        Snooze 2h
                      </button>
                    )}
                    <button
                      onClick={handleSkip}
                      className="px-6 py-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium flex items-center gap-2 transition-colors"
                    >
                      <SkipForward className="h-5 w-5" />
                      Skip
                    </button>
                    <button
                      onClick={() => setShowBadLeadModal(true)}
                      className="px-4 py-4 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-xl font-medium flex items-center gap-2 transition-colors"
                      title="Remove bad lead (wrong industry, bad data)"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </>
                ) : isInCall ? (
                  <>
                    {/* In-Call Controls */}
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-4xl font-mono font-bold text-white mb-2">
                          {formatDuration(callDuration)}
                        </div>
                        <div className="text-green-400 text-sm font-medium flex items-center justify-center gap-2">
                          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                          {callState === "connecting" ? "Connecting..." : 
                           callState === "ringing" ? "Ringing..." : "Connected"}
                        </div>
                      </div>
                    </div>
                    
                    <button
                      onClick={toggleMute}
                      className={`p-4 rounded-xl transition-colors ${
                        isMuted 
                          ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" 
                          : "bg-slate-700 text-white hover:bg-slate-600"
                      }`}
                    >
                      {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                    </button>

                    <button
                      onClick={() => setShowDialpad(!showDialpad)}
                      className={`p-4 rounded-xl transition-colors ${
                        showDialpad 
                          ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30" 
                          : "bg-slate-700 text-white hover:bg-slate-600"
                      }`}
                      title="Keypad (for IVR)"
                    >
                      <Hash className="h-6 w-6" />
                    </button>
                    
                    <button
                      onClick={hangUp}
                      className="p-4 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors"
                    >
                      <PhoneOff className="h-6 w-6" />
                    </button>
                  </>
                ) : null}
              </div>

              {/* DTMF Keypad (for IVR navigation) */}
              {isInCall && showDialpad && (
                <div className="mt-4 pt-4 border-t border-slate-700">
                  <div className="text-xs text-slate-400 mb-3 text-center">Press buttons to navigate IVR menus</div>
                  <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((digit) => (
                      <button
                        key={digit}
                        onClick={() => sendDTMF(digit)}
                        className="p-4 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-xl text-white font-bold text-xl transition-colors active:bg-slate-500"
                      >
                        {digit}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Action Buttons (during call) */}
              {isInCall && (
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-700">
                  <button
                    onClick={() => {
                      const phone = currentLead.phone?.replace(/\D/g, "");
                      if (phone) {
                        window.open(`/dashboard/conversations?phone=${phone}&name=${encodeURIComponent(currentLead.name)}&autoFocus=true`, "_blank");
                      }
                    }}
                    className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors min-w-[80px]"
                  >
                    <MessageSquare className="h-4 w-4" />
                    SMS
                  </button>
                  {currentLead.email && (
                    <button
                      onClick={() => setShowEmailModal(true)}
                      className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors min-w-[80px]"
                    >
                      <Mail className="h-4 w-4" />
                      Email
                    </button>
                  )}
                  <button
                    onClick={() => setShowSendInfoModal(true)}
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors min-w-[80px]"
                  >
                    <Mail className="h-4 w-4" />
                    Info
                  </button>
                  <button
                    onClick={() => setShowScheduleModal(true)}
                    disabled={onboardingScheduled}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors min-w-[80px] ${
                      onboardingScheduled 
                        ? "bg-green-500/20 text-green-400" 
                        : "bg-purple-600 hover:bg-purple-700 text-white"
                    }`}
                  >
                    <Calendar className="h-4 w-4" />
                    {onboardingScheduled ? "Scheduled" : "Schedule"}
                  </button>
                </div>
              )}

              {/* Notes during call - carries over to summary */}
              {isInCall && (
                <div className="mt-4 pt-4 border-t border-slate-700">
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    Notes (will carry to summary)
                  </label>
                  <textarea
                    value={summaryNotes}
                    onChange={(e) => setSummaryNotes(e.target.value)}
                    placeholder="Decision-maker name, objections, what hooked them, next steps..."
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
                    rows={3}
                  />
                </div>
              )}
              </div>
            </>
          )}

          {/* Call Summary Overlay */}
          {showSummary && (
            <div className="bg-slate-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white">Call Summary</h3>
                <button
                  onClick={() => setShowOutcomeGuide(true)}
                  className="px-3 py-1.5 text-sm bg-blue-500/20 text-blue-400 rounded-full hover:bg-blue-500/30 flex items-center gap-1.5 transition-colors"
                >
                  <HelpCircle className="h-4 w-4" />
                  Guide
                </button>
              </div>
              
              {/* Quick Dispo Buttons */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-400 mb-2">Quick Outcome</label>
                <QuickDispoButtons 
                  selectedCode={summaryOutcomeCode}
                  onSelect={handleQuickDispo}
                />
              </div>

              {/* DNC Confirmation (shows after Not Int is selected) */}
              {showDncConfirm && summaryOutcomeCode === "NOT_INTERESTED" && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={doNotContact}
                      onChange={(e) => setDoNotContact(e.target.checked)}
                      className="w-4 h-4 rounded border-red-500 text-red-600 focus:ring-red-500 focus:ring-offset-slate-800"
                    />
                    <span className="text-red-400 text-sm font-medium">
                      Hard no — Do Not Contact (removes from all queues permanently)
                    </span>
                  </label>
                </div>
              )}

              {/* Notes */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-400 mb-2">Notes</label>
                <textarea
                  value={summaryNotes}
                  onChange={(e) => setSummaryNotes(e.target.value)}
                  placeholder="Objections, key points, next steps..."
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows={3}
                />
              </div>

              {/* CTA Section for conversation outcomes */}
              {summaryOutcomeCode && isConversationOutcome(summaryOutcomeCode) && (
                <div className="mb-4 p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                  <div className="text-sm font-medium text-purple-400 mb-3">CTA Tracking</div>
                  <div className="flex items-center gap-4 mb-3">
                    <span className="text-sm text-slate-300">Offered trial?</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCtaAttempted(true)}
                        className={`px-3 py-1 text-sm rounded ${
                          ctaAttempted === true 
                            ? "bg-purple-600 text-white" 
                            : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                        }`}
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => { setCtaAttempted(false); setCtaResult(""); }}
                        className={`px-3 py-1 text-sm rounded ${
                          ctaAttempted === false 
                            ? "bg-slate-600 text-white" 
                            : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                        }`}
                      >
                        No
                      </button>
                    </div>
                  </div>
                  
                  {ctaAttempted && (
                    <select
                      value={ctaResult}
                      onChange={(e) => setCtaResult(e.target.value as CTAResult | "")}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">What did they say?</option>
                      {CTA_RESULT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Follow-up Scheduler */}
              <div className="mb-6 p-4 bg-slate-700/50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-300">Schedule Follow-up</span>
                  </div>
                  
                  {/* 3-TIER TIMEZONE BADGE */}
                  {currentLead?.leadTimezone && currentLead?.timezoneSource === 'coords' ? (
                    /* HIGH CONFIDENCE - Blue solid badge */
                    <div className="flex items-center gap-1 px-2 py-1 bg-blue-600/30 rounded text-xs">
                      <Globe className="h-3 w-3 text-blue-400" />
                      <span className="text-blue-300 font-medium">
                        Lead: {getTimezoneLabel(currentLead.leadTimezone)}
                      </span>
                    </div>
                  ) : currentLead?.leadTimezone && currentLead?.timezoneSource === 'phone' ? (
                    /* MEDIUM CONFIDENCE - Amber badge with verify prompt */
                    <button
                      onClick={() => setShowTimezoneModal(true)}
                      className="flex items-center gap-1 px-2 py-1 bg-amber-600/30 hover:bg-amber-600/50 rounded text-xs transition-colors"
                      title="Timezone inferred from area code - click to verify"
                    >
                      <AlertCircle className="h-3 w-3 text-amber-400" />
                      <span className="text-amber-300 font-medium">
                        Lead: {getTimezoneLabel(currentLead.leadTimezone)} (verify?)
                      </span>
                    </button>
                  ) : (
                    /* NO TIMEZONE - Red/amber button requiring action */
                    <button
                      onClick={() => setShowTimezoneModal(true)}
                      className="flex items-center gap-1 px-2 py-1 bg-red-600/30 hover:bg-red-600/50 rounded text-xs transition-colors animate-pulse"
                    >
                      <AlertCircle className="h-3 w-3 text-red-400" />
                      <span className="text-red-300 font-medium">Set Timezone</span>
                    </button>
                  )}
                </div>
                
                {/* Quick buttons */}
                <div className="flex gap-2 mb-3">
                  <button onClick={scheduleCallbackToday} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded transition-colors">Today</button>
                  <button onClick={() => scheduleCallbackInDays(1)} className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-sm rounded transition-colors">Tomorrow</button>
                  <button onClick={() => scheduleCallbackInDays(3)} className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-sm rounded transition-colors">3 Days</button>
                  <button onClick={() => scheduleCallbackInDays(7)} className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-sm rounded transition-colors">1 Week</button>
                </div>
                
                {/* Custom date/time picker */}
                <input
                  type="datetime-local"
                  value={summaryNextActionAt}
                  onChange={(e) => setSummaryNextActionAt(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-600 border border-slate-500 rounded text-white text-sm focus:ring-2 focus:ring-blue-500"
                />
                
                {/* Dual time preview */}
                {summaryNextActionAt && currentLead?.leadTimezone && (() => {
                  // summaryNextActionAt is in SDR's browser timezone (from datetime-local input)
                  // Convert to UTC first, then display in both timezones
                  const utcTime = new Date(summaryNextActionAt).toISOString();
                  const leadTime = formatInTimezone(utcTime, currentLead.leadTimezone, { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric', 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    hour12: true 
                  });
                  const sdrTime = new Date(summaryNextActionAt).toLocaleString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric', 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    hour12: true 
                  });
                  
                  // Check if outside business hours (8am-8pm) in lead's timezone
                  const leadHour = parseInt(formatInTimezone(utcTime, currentLead.leadTimezone, { 
                    hour: '2-digit', 
                    hour12: false 
                  }).split(':')[0]);
                  const isOutsideHours = leadHour < 8 || leadHour >= 20;
                  
                  return (
                    <>
                      <div className="mt-3 p-3 bg-slate-800 rounded-lg text-xs">
                        <div className="flex justify-between">
                          <div>
                            <div className="text-slate-500 uppercase font-semibold mb-1">Lead's Time</div>
                            <div className="text-white font-medium">
                              {leadTime}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-slate-500 uppercase font-semibold mb-1">Your Time</div>
                            <div className="text-slate-300">
                              {sdrTime}
                            </div>
                          </div>
                        </div>
                      </div>
                      {isOutsideHours && (
                        <div className="mt-2 p-2 bg-amber-900/30 border border-amber-700/50 rounded text-xs text-amber-300">
                          ⚠️ This is {formatInTimezone(utcTime, currentLead.leadTimezone, { 
                            hour: '2-digit', 
                            minute: '2-digit', 
                            hour12: true 
                          })} for the lead — outside typical calling hours (8am-8pm)
                        </div>
                      )}
                    </>
                  );
                })()}
                
                {summaryNextActionAt && (
                  <input
                    type="text"
                    value={summaryNextActionNote}
                    onChange={(e) => setSummaryNextActionNote(e.target.value)}
                    placeholder="Follow-up note..."
                    className="w-full mt-3 px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white text-sm placeholder-slate-400 focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleSkipSummary}
                  className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
                >
                  Skip
                </button>
                <button
                  onClick={handleSaveAndNext}
                  disabled={isSavingSummary}
                  className="flex-[2] py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  {isSavingSummary ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      Save + Call Next
                      <ChevronRight className="h-5 w-5" />
                    </>
                  )}
                </button>
              </div>

              {/* Send Email Button in Summary - for info requests */}
              {currentLead?.email && (
                <button
                  onClick={() => setShowEmailModal(true)}
                  className="w-full mt-3 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors border border-slate-600"
                >
                  <Mail className="h-5 w-5" />
                  Send Email (Info / Follow-up)
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Side - Script Sidebar OR Activation Context Panel */}
        {dialerMode === 'ACTIVATION' ? (
          <ActivationContextPanel 
            activation={currentActivation}
            isLoading={isLoadingLead}
          />
        ) : (
          <ScriptSidebar 
            leadName={currentLead?.name}
            campaignId={currentLead?.campaignId}
            badgeKey={currentLead?.badgeKey}
            scriptKey={scriptKey}
            contactName={currentLead?.contactName}
            isInCall={isInCall}
          />
        )}
      </div>

      {/* Email Modal */}
      {showEmailModal && currentLead && (
        <QuickEmailModal
          leadId={currentLead.id}
          leadName={currentLead.name}
          leadEmail={currentLead.email}
          leadAddress={currentLead.address}
          onClose={() => setShowEmailModal(false)}
          onEmailSent={() => {
            toast.success("Email sent!");
            setShowEmailModal(false);
          }}
        />
      )}

      {/* Schedule Onboarding Modal */}
      {showScheduleModal && currentLead && (
        <ScheduleSlotPicker
          onClose={() => setShowScheduleModal(false)}
          onSave={async (data) => {
            // The ScheduleSlotPicker already creates the meeting via API
            // We just need to mark it as scheduled and update outcome
            setOnboardingScheduled(true);
            setShowScheduleModal(false);
            setSummaryOutcomeCode("ONBOARDING_SCHEDULED");
            toast.success("Onboarding scheduled!");
            // Only auto-advance if call has already ended (not still in call)
            // If still in call, let them finish naturally - outcome is already set
            if (!isInCall) {
              setTimeout(() => handleSaveAndNext(), 100);
            }
          }}
          onRefusal={(reason, details) => {
            // Handle refusal - set outcome code and close modal
            setShowScheduleModal(false);
            setSummaryOutcomeCode(reason);
            if (details) {
              setSummaryNotes((prev) => (prev ? `${prev}\n${details}` : details));
            }
            toast("Schedule refusal recorded", { icon: "ℹ️" });
            // Only auto-advance if call has already ended (not still in call)
            if (!isInCall) {
              setTimeout(() => handleSaveAndNext(), 100);
            }
          }}
          isSaving={false}
          leadId={currentLead.id}
          isDialerMode={true}
          initialTimezone={null}
          initialTechOwner={currentLead.contactName || null}
          initialPhone={currentLead.phone || null}
          initialEmail={currentLead.email || null}
        />
      )}

      {/* Send Info Modal */}
      {showSendInfoModal && currentLead && (
        <SendInfoModal
          leadId={currentLead.id}
          leadName={currentLead.name}
          leadEmail={currentLead.email}
          leadAddress={currentLead.address}
          onClose={() => setShowSendInfoModal(false)}
          onEmailSent={() => {
            toast.success("Info email sent!");
            setShowSendInfoModal(false);
            // Pre-fill summary outcome if summary is visible or will be shown
            if (showSummary || !isInCall) {
              setSummaryOutcomeCode("INTERESTED_INFO_SENT");
            }
          }}
        />
      )}

      {/* Outcome Guide Modal */}
      {showOutcomeGuide && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col border border-slate-700">
            <div className="p-4 border-b border-slate-700 bg-blue-600 text-white flex items-center justify-between">
              <h3 className="font-semibold">📋 Call Outcome Guide</h3>
              <button
                onClick={() => setShowOutcomeGuide(false)}
                className="text-white/80 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
              {/* 1. No Ans (NO_ANSWER) */}
              <div className="border-l-4 border-slate-400 pl-3 py-2">
                <div className="font-semibold text-white flex items-center gap-2">
                  <span className="bg-slate-500 text-white text-xs px-1.5 py-0.5 rounded">1</span>
                  No Ans
                </div>
                <div className="text-slate-300 mt-1 space-y-0.5">
                  <div><span className="text-slate-400">What it does:</span> Marks as no answer, schedules next-day follow-up.</div>
                  <div><span className="text-slate-400">Use when:</span> No answer, voicemail, just kept ringing.</div>
                  <div><span className="text-slate-400">Notes:</span> "Left VM" or "No VM," time of day.</div>
                </div>
              </div>

              {/* 2. Busy (BUSY) */}
              <div className="border-l-4 border-orange-400 pl-3 py-2">
                <div className="font-semibold text-white flex items-center gap-2">
                  <span className="bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded">2</span>
                  Busy
                </div>
                <div className="text-slate-300 mt-1 space-y-0.5">
                  <div><span className="text-slate-400">What it does:</span> Marks as busy, schedules same-day/next-morning follow-up.</div>
                  <div><span className="text-slate-400">Use when:</span> Line busy, "call back later," hung up quickly, call dropped.</div>
                  <div><span className="text-slate-400">Notes:</span> Reason + any callback time they mentioned.</div>
                </div>
              </div>

              {/* 3. Info (INTERESTED_INFO_SENT) */}
              <div className="border-l-4 border-blue-400 pl-3 py-2">
                <div className="font-semibold text-white flex items-center gap-2">
                  <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded">3</span>
                  Info
                </div>
                <div className="text-slate-300 mt-1 space-y-0.5">
                  <div><span className="text-slate-400">What it does:</span> Marks as interested, schedules next-day follow-up.</div>
                  <div><span className="text-slate-400">Use when:</span> They want info, a sample link, or demo - but no trial yet.</div>
                  <div><span className="text-slate-400">Notes:</span> Email you sent to, what hooked them, objections, decision-maker.</div>
                </div>
              </div>

              {/* 4. Trial (TRIAL_STARTED) */}
              <div className="border-l-4 border-green-500 pl-3 py-2">
                <div className="font-semibold text-white flex items-center gap-2">
                  <span className="bg-green-500 text-white text-xs px-1.5 py-0.5 rounded">4</span>
                  Trial
                </div>
                <div className="text-green-400/80 text-xs mt-1">⚡ Opens a popup to get their email and create their trial account</div>
                <div className="text-slate-300 mt-1 space-y-0.5">
                  <div><span className="text-slate-400">What it does:</span> Opens trial signup form → ask for their email → creates 20-credit trial → sends welcome email.</div>
                  <div><span className="text-slate-400">Use when:</span> They say YES to trying it! Get their email and sign them up right on the call.</div>
                  <div><span className="text-slate-400">Notes:</span> Email used, their goal, any setup notes.</div>
                </div>
              </div>

              {/* 5. Callback (CALLBACK_SCHEDULED) */}
              <div className="border-l-4 border-purple-400 pl-3 py-2">
                <div className="font-semibold text-white flex items-center gap-2">
                  <span className="bg-purple-500 text-white text-xs px-1.5 py-0.5 rounded">5</span>
                  Callback
                </div>
                <div className="text-slate-300 mt-1 space-y-0.5">
                  <div><span className="text-slate-400">What it does:</span> Sets follow-up date, lead shows in queue at that time.</div>
                  <div><span className="text-slate-400">Use when:</span> They agree to a future call at a specific time.</div>
                  <div><span className="text-slate-400">Notes:</span> Exact time, decision-maker name, what they want to discuss.</div>
                </div>
              </div>

              {/* 6. Not Int (NOT_INTERESTED) */}
              <div className="border-l-4 border-red-400 pl-3 py-2">
                <div className="font-semibold text-white flex items-center gap-2">
                  <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded">6</span>
                  Not Int
                </div>
                <div className="text-slate-300 mt-1 space-y-0.5">
                  <div><span className="text-slate-400">What it does:</span> Marks as not interested, removes from active queue.</div>
                  <div><span className="text-slate-400">Use when:</span> Clear "no," hung up after hearing your pitch.</div>
                  <div><span className="text-slate-400">Notes:</span> Write their exact objection - helps improve the pitch!</div>
                </div>
              </div>

              {/* 7. Wrong # (WRONG_NUMBER) */}
              <div className="border-l-4 border-gray-400 pl-3 py-2">
                <div className="font-semibold text-white flex items-center gap-2">
                  <span className="bg-gray-500 text-white text-xs px-1.5 py-0.5 rounded">7</span>
                  Wrong #
                </div>
                <div className="text-slate-300 mt-1 space-y-0.5">
                  <div><span className="text-slate-400">What it does:</span> Marks as bad number, removes from queue.</div>
                  <div><span className="text-slate-400">Use when:</span> Not the business, wrong person, disconnected number.</div>
                  <div><span className="text-slate-400">Notes:</span> If they gave you a correct number, write it down!</div>
                </div>
              </div>

              {/* Notes Box */}
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mt-4">
                <div className="font-semibold text-amber-400 mb-2">📝 NOTES — Always capture:</div>
                <ul className="text-amber-300/90 space-y-1 ml-4 list-disc">
                  <li>Decision-maker name (who can say yes?)</li>
                  <li>What they're using now</li>
                  <li>Their exact objection</li>
                  <li>Any buying signals</li>
                </ul>
              </div>
            </div>
            <div className="p-3 border-t border-slate-700 bg-slate-800">
              <button
                onClick={() => setShowOutcomeGuide(false)}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search Lead Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col border border-slate-700">
            <div className="p-4 border-b border-slate-700 bg-blue-600 text-white flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Search className="h-5 w-5" />
                Search Lead
              </h3>
              <button
                onClick={() => {
                  setShowSearchModal(false);
                  setSearchQuery("");
                  setSearchResults([]);
                }}
                className="text-white/80 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-4 border-b border-slate-700">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, phone, email, or contact name..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ backgroundColor: '#0f172a', color: '#ffffff' }}
                  autoFocus
                />
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Search for any lead assigned to you
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {isSearching ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
                  <span className="ml-2 text-slate-400">Searching...</span>
                </div>
              ) : searchQuery.trim() && searchResults.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Search className="h-12 w-12 mx-auto mb-3 text-slate-600" />
                  <p>No leads found matching "{searchQuery}"</p>
                </div>
              ) : !searchQuery.trim() ? (
                <div className="text-center py-8 text-slate-400">
                  <Search className="h-12 w-12 mx-auto mb-3 text-slate-600" />
                  <p>Start typing to search for leads</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {searchResults.map((lead) => (
                    <button
                      key={lead.id}
                      onClick={() => handleLoadManualLead(lead)}
                      className="w-full text-left p-4 bg-slate-900 hover:bg-slate-700 rounded-lg border border-slate-700 hover:border-blue-500 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold text-white mb-1">{lead.name}</h4>
                          <div className="space-y-1 text-sm text-slate-300">
                            {lead.contact_name && (
                              <div className="flex items-center gap-2">
                                <span className="text-slate-500">Contact:</span>
                                <span>{lead.contact_name}</span>
                              </div>
                            )}
                            {lead.phone && (
                              <div className="flex items-center gap-2">
                                <Phone className="h-3 w-3 text-slate-500" />
                                <span>{lead.phone}</span>
                              </div>
                            )}
                            {lead.email && (
                              <div className="flex items-center gap-2">
                                <Mail className="h-3 w-3 text-slate-500" />
                                <span className="truncate">{lead.email}</span>
                              </div>
                            )}
                            {lead.address && (
                              <div className="flex items-center gap-2">
                                <MapPin className="h-3 w-3 text-slate-500" />
                                <span className="truncate">{lead.address}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-slate-400 flex-shrink-0 ml-2" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lost Reason Modal */}
      {showLostReasonModal && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Lost Reason Required</h3>
              <button
                onClick={() => {
                  setShowLostReasonModal(false);
                  setLostReason("");
                  setLostReasonNotes("");
                  setSummaryOutcomeCode(""); // Clear outcome if modal is cancelled
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              This lead was marked as "Wrong Number" which closes the lead. Please select a reason why this lead was lost.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Lost Reason <span className="text-red-400">*</span>
              </label>
              <select
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value as LostReason | "")}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select a reason...</option>
                {LOST_REASON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Notes (Optional)
              </label>
              <textarea
                value={lostReasonNotes}
                onChange={(e) => setLostReasonNotes(e.target.value)}
                placeholder="Additional details about why this lead was lost..."
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={3}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowLostReasonModal(false);
                  setLostReason("");
                  setLostReasonNotes("");
                  setSummaryOutcomeCode(""); // Clear outcome if cancelled
                }}
                className="px-4 py-2 text-slate-300 bg-slate-700 rounded-md hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!lostReason) {
                    toast.error("Please select a lost reason");
                    return;
                  }
                  setShowLostReasonModal(false);
                  // Outcome code is already set from handleQuickDispo
                  // Lost reason will be sent when user clicks Save + Call Next
                }}
                disabled={!lostReason}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bad Lead Removal Modal */}
      {showBadLeadModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Remove Bad Lead</h3>
            <p className="text-sm text-gray-400 mb-4">
              Why is this a bad lead? It will be removed from your queue.
            </p>
            <div className="space-y-2">
              <button
                onClick={() => handleBadLead("Wrong industry")}
                disabled={isRemovingBadLead}
                className="w-full px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-left disabled:opacity-50"
              >
                Wrong industry
              </button>
              <button
                onClick={() => handleBadLead("Duplicate lead")}
                disabled={isRemovingBadLead}
                className="w-full px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-left disabled:opacity-50"
              >
                Duplicate lead
              </button>
              <button
                onClick={() => handleBadLead("Bad data (invalid phone/info)")}
                disabled={isRemovingBadLead}
                className="w-full px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-left disabled:opacity-50"
              >
                Bad data (invalid phone/info)
              </button>
              <button
                onClick={() => handleBadLead("Out of service area")}
                disabled={isRemovingBadLead}
                className="w-full px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-left disabled:opacity-50"
              >
                Out of service area
              </button>
            </div>
            <button
              onClick={() => setShowBadLeadModal(false)}
              className="w-full mt-4 px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Timezone Selection Modal */}
      {showTimezoneModal && currentLead && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-xl shadow-2xl p-6 w-full max-w-md border border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">
                {currentLead.timezoneSource === 'phone' ? 'Verify Lead Timezone' : 'Set Lead Timezone'}
              </h3>
              <button onClick={() => setShowTimezoneModal(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            {currentLead.timezoneSource === 'phone' && (
              <div className="mb-4 p-3 bg-amber-900/30 border border-amber-700 rounded-lg text-sm text-amber-200">
                <strong>Note:</strong> Timezone was guessed from phone area code. 
                If the lead moved but kept their number, this may be wrong.
              </div>
            )}
            <select
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white mb-4"
              defaultValue={currentLead.leadTimezone || ""}
              onChange={async (e) => {
                const tz = e.target.value;
                if (tz) {
                  await fetch(`/api/leads/${currentLead.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ leadTimezone: tz, timezoneSource: 'manual' }),
                  });
                  setCurrentLead({ ...currentLead, leadTimezone: tz, timezoneSource: 'manual' });
                  setShowTimezoneModal(false);
                  toast.success('Timezone saved');
                }
              }}
            >
              <option value="">Select timezone...</option>
              <option value="America/New_York">Eastern Time (ET)</option>
              <option value="America/Chicago">Central Time (CT)</option>
              <option value="America/Denver">Mountain Time (MT)</option>
              <option value="America/Los_Angeles">Pacific Time (PT)</option>
              <option value="America/Phoenix">Arizona (no DST)</option>
              <option value="America/Anchorage">Alaska Time (AK)</option>
              <option value="Pacific/Honolulu">Hawaii Time (HI)</option>
            </select>
            <button onClick={() => setShowTimezoneModal(false)} className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Activator Call Summary Modal (for ACTIVATION mode) */}
      {showActivatorModal && currentActivation && (
        <ActivatorCallSummaryModal
          meetingId={currentActivation.client_id}
          meetingData={{
            companyName: currentActivation.business_name || currentLead?.name || "Unknown",
            attendeeName: currentActivation.contact_name || currentLead?.contactName,
            scheduledByName: currentActivation.activation_owner || undefined,
            scheduledTime: currentActivation.trial_started_at 
              ? new Date(currentActivation.trial_started_at).toLocaleString() 
              : undefined,
            phone: currentActivation.phone || currentLead?.phone,
            website: currentActivation.website || currentLead?.website,
          }}
          onClose={() => {
            setShowActivatorModal(false);
            // If they close without completing, show warning
            toast("Complete the meeting summary before moving on", { icon: "⚠️" });
          }}
          onComplete={() => {
            setShowActivatorModal(false);
            // Clear activation and move to next
            setCurrentActivation(null);
            setCurrentLead(null);
            fetchActivationQueue();
            toast.success("Meeting completed!");
          }}
        />
      )}
    </div>
  );
}

