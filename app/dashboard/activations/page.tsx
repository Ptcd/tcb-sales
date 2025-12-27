"use client";

import { useState, useEffect } from "react";
import { Phone, Mail, MessageSquare, X, CheckCircle2, Clock, AlertTriangle, HelpCircle, Calendar, User as UserIcon, Globe, MapPin, Search, Trash2, ExternalLink, Settings, FileText } from "lucide-react";
import toast from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import Link from "next/link";
import { ScheduleSlotPicker } from "@/components/ScheduleSlotPicker";
import { ActivatorAvailabilitySettings } from "@/components/ActivatorAvailabilitySettings";
import { formatInTimezone } from "@/lib/timezones";
import { ActivationMeeting } from "@/lib/types";
import { useCall } from "@/components/CallProvider";

interface TrialPipeline {
  id: string;
  trial_started_at: string | null;
  password_set_at: string | null;
  first_login_at: string | null;
  calculator_modified_at: string | null;
  embed_snippet_copied_at: string | null;
  first_lead_received_at: string | null;
  marked_lost_at: string | null;
  // NEW FIELDS:
  activation_status: 'queued' | 'in_progress' | 'scheduled' | 'activated' | 'killed' | null;
  next_action: string | null;
  scheduled_install_at: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  scheduled_timezone: string | null;
  scheduled_with_name: string | null;
  scheduled_with_role: string | null;
  website_platform: string | null;
  technical_owner_name: string | null;
  jcc_user_id: string | null;
  assigned_activator_id: string | null;
  last_contact_at: string | null;
  rescue_attempts: number;
  customer_timezone: string | null;
}

interface User {
  id: string;
  name: string;
  role: string;
  is_activator: boolean;
}

interface Activation {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  badge_key: string;
  assigned_to: string | null;
  trial_pipeline: TrialPipeline | null;
}

function getStallStatus(tp: TrialPipeline | null): { label: string; priority: number } {
  if (!tp || !tp.trial_started_at) {
    return { label: "Unknown", priority: 999 };
  }

  const now = Date.now();
  const hoursSince = (ts: string | null): number => {
    if (!ts) return Infinity;
    return (now - new Date(ts).getTime()) / 3600000;
  };

  // Needs password set (2+ hours since trial)
  if (!tp.password_set_at && hoursSince(tp.trial_started_at) > 2) {
    return { label: "Needs Password", priority: 1 };
  }

  // Needs first login
  if (tp.password_set_at && !tp.first_login_at) {
    return { label: "Needs Login", priority: 2 };
  }

  // Needs config
  if (tp.first_login_at && !tp.calculator_modified_at) {
    return { label: "Needs Config", priority: 3 };
  }

  // Needs embed copied
  if (tp.calculator_modified_at && !tp.embed_snippet_copied_at) {
    return { label: "Needs Embed", priority: 4 };
  }

  // Verify live (needs first lead)
  if (tp.embed_snippet_copied_at && !tp.first_lead_received_at) {
    return { label: "Verify Live", priority: 5 };
  }

  // Ready to activate
  if (tp.first_lead_received_at) {
    return { label: "Ready", priority: 6 };
  }

  return { label: "New", priority: 0 };
}

function getLastEventTime(tp: TrialPipeline | null): string | null {
  if (!tp) return null;
  const timestamps = [
    tp.first_lead_received_at,
    tp.embed_snippet_copied_at,
    tp.calculator_modified_at,
    tp.first_login_at,
    tp.password_set_at,
    tp.trial_started_at,
  ].filter(Boolean) as string[];
  
  if (timestamps.length === 0) return null;
  return timestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
}

function formatTimeAgo(ts: string | null): string {
  if (!ts) return "—";
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / (1000 * 60 * 60));
  if (diff < 1) return "Just now";
  if (diff < 24) return `${diff}h ago`;
  const days = Math.floor(diff / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function getStalledBadge(tp: TrialPipeline | null): { label: string; color: string } | null {
  if (!tp) return null;
  
  const lastEvent = getLastEventTime(tp);
  if (!lastEvent) return null;
  
  const hoursSinceLastEvent = (Date.now() - new Date(lastEvent).getTime()) / 3600000;
  
  if (hoursSinceLastEvent >= 72) {
    return { label: "Stalled 72h+", color: "bg-red-600 text-white" };
  }
  if (hoursSinceLastEvent >= 24) {
    return { label: "Stalled 24h+", color: "bg-orange-500 text-white" };
  }
  return null;
}

export default function ActivationsPage() {
  const [activations, setActivations] = useState<Activation[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [killingId, setKillingId] = useState<string | null>(null);
  const [killReason, setKillReason] = useState("");
  const [showKillModal, setShowKillModal] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState<string | null>(null);
  const [killReasonType, setKillReasonType] = useState("");
  const [editingNextActionId, setEditingNextActionId] = useState<string | null>(null);
  const [nextActionValue, setNextActionValue] = useState("");
  const [showAvailabilitySettings, setShowAvailabilitySettings] = useState(false);
  const [meetings, setMeetings] = useState<ActivationMeeting[]>([]);
  const [isActivator, setIsActivator] = useState(false);
  const [showNotesDrawer, setShowNotesDrawer] = useState<string | null>(null);
  const [activationEvents, setActivationEvents] = useState<Record<string, any[]>>({});
  const [todayStats, setTodayStats] = useState({ scheduled: 0, completed: 0, installed: 0, firstLeads: 0 });
  const [completionModal, setCompletionModal] = useState<{
    meeting: ActivationMeeting;
    outcome: 'installed' | 'partial' | 'couldnt_install' | null;
    websiteUrl: string;
    installVerified: boolean;
    installNotes: string;
    followupDate: string;
    followupReason: string;
    killReason: string;
  } | null>(null);

  const { makeCall } = useCall();

  useEffect(() => {
    fetchActivations();
    fetchUsers();
    checkActivatorStatus();
    fetchMeetings();
    if (isActivator) {
      fetchTodayStats();
    }
  }, [isActivator]);

  const checkActivatorStatus = async () => {
    try {
      const res = await fetch("/api/auth/profile");
      const data = await res.json();
      if (data.success) {
        setIsActivator(data.is_activator || false);
      }
    } catch (error) {
      console.error("Error checking activator status:", error);
    }
  };

  const fetchMeetings = async () => {
    try {
      const res = await fetch("/api/activation-meetings?status=scheduled");
      const data = await res.json();
      if (data.success) {
        // Transform database format to TypeScript interface
        const transformed = data.meetings.map((m: any) => ({
          id: m.id,
          trialPipelineId: m.trial_pipeline_id,
          leadId: m.lead_id,
          scheduledStartAt: m.scheduled_start_at,
          scheduledEndAt: m.scheduled_end_at,
          scheduledTimezone: m.scheduled_timezone,
          activatorUserId: m.activator_user_id,
          activatorName: m.activator?.full_name || null,
          scheduledBySdrUserId: m.scheduled_by_sdr_user_id,
          organizationId: m.organization_id,
          status: m.status,
          attendeeName: m.attendee_name,
          attendeeRole: m.attendee_role,
          phone: m.phone,
          email: m.email,
          websitePlatform: m.website_platform,
          websiteUrl: m.website_url,
          goal: m.goal,
          objections: m.objections,
          notes: m.notes,
          confirmationSentAt: m.confirmation_sent_at,
          reminder24hSentAt: m.reminder_24h_sent_at,
          rescheduledFromId: m.rescheduled_from_id,
          sdrConfirmedUnderstandsInstall: m.sdr_confirmed_understands_install,
          sdrConfirmedAgreedInstall: m.sdr_confirmed_agreed_install,
          sdrConfirmedWillAttend: m.sdr_confirmed_will_attend,
          accessMethod: m.access_method,
          webPersonEmail: m.web_person_email,
          createdAt: m.created_at,
          updatedAt: m.updated_at,
        }));
        setMeetings(transformed);
      }
    } catch (error) {
      console.error("Error fetching meetings:", error);
    }
  };

  const fetchTodayStats = async () => {
    try {
      const res = await fetch("/api/activations/today-stats");
      const data = await res.json();
      if (data.success) {
        setTodayStats(data.stats);
      }
    } catch (error) {
      console.error("Error fetching today stats:", error);
    }
  };

  const handleOpenCompletionModal = (meeting: ActivationMeeting) => {
    setCompletionModal({
      meeting,
      outcome: null,
      websiteUrl: (meeting as any).websiteUrl || '',
      installVerified: false,
      installNotes: '',
      followupDate: '',
      followupReason: '',
      killReason: '',
    });
  };

  const canSubmitCompletion = () => {
    if (!completionModal?.outcome) return false;
    
    if (completionModal.outcome === 'installed') {
      return completionModal.websiteUrl && completionModal.installVerified;
    }
    
    // For partial/couldnt_install, need either followup scheduled OR kill reason
    return (
      completionModal.followupReason && 
      (completionModal.followupDate || completionModal.killReason)
    );
  };

  const handleSubmitCompletion = async () => {
    if (!completionModal || !canSubmitCompletion()) return;
    
    setStatusUpdatingId(completionModal.meeting.id);
    
    try {
      const res = await fetch(`/api/activation-meetings/${completionModal.meeting.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome: completionModal.outcome,
          website_url: completionModal.websiteUrl,
          install_verified: completionModal.installVerified,
          install_notes: completionModal.installNotes,
          followup_date: completionModal.followupDate || null,
          followup_reason: completionModal.followupReason || null,
          kill_reason: completionModal.killReason || null,
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to complete meeting');
      }
      
      toast.success(
        completionModal.outcome === 'installed' 
          ? 'Install marked complete!' 
          : completionModal.killReason 
            ? 'Trial killed' 
            : 'Follow-up scheduled'
      );
      
      setCompletionModal(null);
      fetchMeetings();
      fetchActivations();
      fetchTodayStats();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const formatTimeUntil = (dateStr: string): string => {
    const now = new Date();
    const meeting = new Date(dateStr);
    const diffMs = meeting.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 0) return 'Past due';
    if (diffMins < 60) return `in ${diffMins} min`;
    const hours = Math.floor(diffMins / 60);
    if (hours < 24) return `in ${hours}h`;
    const days = Math.floor(hours / 24);
    return `in ${days}d`;
  };

  const handleMeetingStatusChange = async (meetingId: string, status: "completed" | "no_show" | "canceled") => {
    setStatusUpdatingId(meetingId);
    try {
      const res = await fetch(`/api/activation-meetings/${meetingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update meeting status");
      }

      toast.success(`Meeting marked as ${status === 'completed' ? 'attended' : status}`);
      fetchMeetings();
      fetchActivations();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleAttendedNoShow = async (leadId: string, status: "attended" | "no_show") => {
    setStatusUpdatingId(leadId);
    try {
      // Find the meeting for this trial_pipeline
      const activation = activations.find(a => a.id === leadId);
      const trialPipelineId = activation?.trial_pipeline?.id;
      
      if (!trialPipelineId) {
        toast.error("No trial pipeline found");
        return;
      }

      // Find the meeting
      const meeting = meetings.find(m => m.trialPipelineId === trialPipelineId);
      if (!meeting) {
        toast.error("No scheduled meeting found");
        return;
      }

      await handleMeetingStatusChange(meeting.id, status === "attended" ? "completed" : "no_show");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const fetchActivationEvents = async (trialPipelineId: string) => {
    try {
      const res = await fetch(`/api/activations/events?trialPipelineId=${trialPipelineId}`);
      const data = await res.json();
      if (data.success) {
        setActivationEvents(prev => ({
          ...prev,
          [trialPipelineId]: data.events || [],
        }));
      }
    } catch (error) {
      console.error("Error fetching activation events:", error);
    }
  };

  // Auto-assign all trials if only 1 activator exists
  useEffect(() => {
    if (users.length === 1 && !loading) {
      fetch("/api/activations/auto-assign", { method: "POST" })
        .then(res => res.json())
        .then(data => {
          if (data.assigned > 0) {
            toast.success(`Auto-assigned ${data.assigned} trials to you`);
            fetchActivations();
          }
        })
        .catch(err => console.error("Auto-assign failed:", err));
    }
  }, [users, loading]);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (data.users) {
        setUsers(
          data.users
            .filter((u: any) => u.is_activator)
            .map((u: any) => ({
              id: u.id,
              name: u.full_name || u.email || 'Unknown',
              role: u.role,
              is_activator: u.is_activator,
            }))
        );
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const fetchActivations = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/activations");
      const data = await res.json();
      if (data.activations) {
        setActivations(data.activations);
      }
    } catch (error) {
      console.error("Error fetching activations:", error);
      toast.error("Failed to load activations");
    } finally {
      setLoading(false);
    }
  };

  const handleKillTrial = async (leadId: string) => {
    if (!killReasonType) {
      toast.error("Please select a reason");
      return;
    }

    setKillingId(leadId);
    try {
      const res = await fetch(`/api/activations/${leadId}/killed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: killReason, kill_reason: killReasonType }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to kill trial");
      }

      toast.success("Killed");
      setShowKillModal(null);
      setKillReason("");
      setKillReasonType("");
      fetchActivations();
    } catch (error: any) {
      toast.error(error.message || "Failed to kill trial");
    } finally {
      setKillingId(null);
    }
  };

  const handleStatusChange = async (leadId: string, newStatus: string, tp: TrialPipeline | null) => {
    // If changing to 'scheduled', show modal to get date
    if (newStatus === 'scheduled') {
      setShowScheduleModal(leadId);
      return;
    }

    // If changing to 'activated', check gating
    if (newStatus === 'activated' && !tp?.first_lead_received_at) {
      toast.error("Cannot activate - no test lead received yet. Check Control Tower.");
      return;
    }

    setStatusUpdatingId(leadId);
    try {
      const res = await fetch(`/api/activations/${leadId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update status");
      }

      toast.success(`Status updated to ${newStatus}`);
      fetchActivations();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleScheduleSubmit = async (leadId: string, data: { scheduled_install_at: string; customer_timezone: string; technical_owner_name: string }) => {
    setStatusUpdatingId(leadId);
    try {
      const res = await fetch(`/api/activations/${leadId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: 'scheduled',
          ...data,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to schedule");
      }

      toast.success("Install scheduled");
      setShowScheduleModal(null);
      fetchActivations();
      fetchMeetings();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleNextActionSave = async (leadId: string) => {
    if (!nextActionValue.trim()) return;
    
    setStatusUpdatingId(leadId);
    try {
      const res = await fetch(`/api/activations/${leadId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          status: activations.find(a => a.id === leadId)?.trial_pipeline?.activation_status || 'queued',
          next_action: nextActionValue 
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update next action");
      }

      toast.success("Next action updated");
      setEditingNextActionId(null);
      fetchActivations();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleActivatorChange = async (leadId: string, activatorId: string) => {
    setStatusUpdatingId(leadId);
    try {
      const res = await fetch(`/api/activations/${leadId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          status: activations.find(a => a.id === leadId)?.trial_pipeline?.activation_status || 'queued',
          assigned_activator_id: activatorId 
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update activator");
      }

      toast.success("Activator updated");
      fetchActivations();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setStatusUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Activations</h1>
          <p className="text-sm text-gray-400 mt-1">
            Manage trial follow-ups and activation progress
          </p>
        </div>
        <div className="flex gap-2">
          {isActivator && (
            <button
              onClick={() => setShowAvailabilitySettings(true)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm flex items-center gap-2"
            >
              <Settings className="h-4 w-4" />
              Availability
            </button>
          )}
          <button
            onClick={() => setShowGuide(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm flex items-center gap-2"
          >
            <HelpCircle className="h-4 w-4" />
            Guide
          </button>
          <button
            onClick={fetchActivations}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Today's Stats Banner - Only for Activators */}
      {isActivator && (
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">
                Today: {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </h2>
              <div className="flex gap-6 mt-2 text-sm">
                <div>
                  <span className="text-slate-400">Meetings:</span>
                  <span className="ml-2 text-white font-semibold">{todayStats.scheduled}</span>
                </div>
                <div>
                  <span className="text-slate-400">Completed:</span>
                  <span className="ml-2 text-green-400 font-semibold">{todayStats.completed}</span>
                </div>
                <div>
                  <span className="text-slate-400">Installed:</span>
                  <span className="ml-2 text-blue-400 font-semibold">{todayStats.installed}</span>
                </div>
                <div>
                  <span className="text-slate-400">First Leads:</span>
                  <span className="ml-2 text-yellow-400 font-semibold">{todayStats.firstLeads}</span>
                </div>
              </div>
            </div>
            {meetings.filter(m => new Date(m.scheduledStartAt) >= new Date()).length > 0 && (
              <div className="text-right">
                <div className="text-xs text-slate-500 uppercase">Next Up</div>
                <div className="text-white font-medium">
                  {meetings.filter(m => new Date(m.scheduledStartAt) >= new Date())[0]?.attendeeName}
                </div>
                <div className="text-sm text-blue-400">
                  {formatTimeUntil(meetings.filter(m => new Date(m.scheduledStartAt) >= new Date())[0]?.scheduledStartAt)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upcoming Meetings Section (for Activators) */}
      {isActivator && meetings.length > 0 && (
        <div className="bg-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-bold text-white mb-4">Upcoming Meetings</h2>
          <div className="space-y-3">
            {meetings
              .filter(m => new Date(m.scheduledStartAt) >= new Date())
              .sort((a, b) => new Date(a.scheduledStartAt).getTime() - new Date(b.scheduledStartAt).getTime())
              .slice(0, 5)
              .map(meeting => {
                // Find associated trial for JCC link
                const activation = activations.find(a => 
                  a.trial_pipeline?.id === meeting.trialPipelineId
                );
                const jccUserId = activation?.trial_pipeline?.jcc_user_id;
                
                return (
                  <div key={meeting.id} className="p-4 bg-slate-900 rounded-lg border border-slate-700">
                    {/* Header with time */}
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="font-semibold text-white text-lg">{meeting.attendeeName}</div>
                        {meeting.activatorName && (
                          <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                            <UserIcon className="h-3 w-3" />
                            Activator: <span className="text-slate-300 font-medium">{meeting.activatorName}</span>
                          </div>
                        )}
                      </div>
                      <div className="text-sm text-blue-400 font-medium">
                        {formatInTimezone(new Date(meeting.scheduledStartAt), meeting.scheduledTimezone, {
                          weekday: "short", month: "short", day: "numeric",
                          hour: "2-digit", minute: "2-digit", hour12: true,
                        })}
                      </div>
                    </div>
                    
                    {/* Contact Info */}
                    <div className="grid grid-cols-2 gap-2 text-sm text-slate-400 mb-3">
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        <button
                          onClick={() => makeCall(meeting.leadId || '', meeting.phone, meeting.attendeeName)}
                          className="hover:text-white text-left"
                        >
                          {meeting.phone}
                        </button>
                      </div>
                      {meeting.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          <span>{meeting.email}</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Access Method & Web Person */}
                    {(meeting.accessMethod || meeting.webPersonEmail) && (
                      <div className="mb-3 p-2 bg-slate-900/50 rounded-lg border border-slate-700">
                        <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Access Method</div>
                        <div className="flex items-center gap-2 text-sm">
                          {meeting.accessMethod === 'credentials' && (
                            <span className="flex items-center gap-1 text-blue-400">
                              <UserIcon className="h-3 w-3" />
                              Customer bringing credentials
                            </span>
                          )}
                          {meeting.accessMethod === 'web_person' && (
                            <span className="flex items-center gap-1 text-purple-400">
                              <UserIcon className="h-3 w-3" />
                              Web person on call
                            </span>
                          )}
                          {meeting.accessMethod === 'both' && (
                            <span className="flex items-center gap-1 text-green-400">
                              <UserIcon className="h-3 w-3" />
                              Both methods
                            </span>
                          )}
                        </div>
                        {meeting.webPersonEmail && (
                          <div className="mt-2 flex items-center gap-2 text-sm">
                            <Mail className="h-3 w-3 text-slate-500" />
                            <a 
                              href={`mailto:${meeting.webPersonEmail}`}
                              className="text-blue-400 hover:text-blue-300 hover:underline"
                            >
                              {meeting.webPersonEmail}
                            </a>
                            <span className="text-xs text-slate-500">(Web person)</span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Website + Control Tower Links */}
                    <div className="flex gap-2 mb-3">
                      {(meeting as any).websiteUrl && (
                        <a
                          href={(meeting as any).websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-sm text-slate-300 hover:text-white"
                        >
                          <Globe className="h-4 w-4" />
                          Open Website
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {jccUserId && (
                        <a
                          href={`https://app.autosalvageautomation.com/control-tower/clients/${jccUserId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-900/50 hover:bg-purple-800/50 rounded text-sm text-purple-300 hover:text-white"
                        >
                          <Settings className="h-4 w-4" />
                          Control Tower
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    
                    {/* Context */}
                    <div className="text-xs text-slate-500 mb-3">
                      <div><strong>Platform:</strong> {meeting.websitePlatform}</div>
                      <div><strong>Goal:</strong> {meeting.goal}</div>
                      {meeting.objections && <div><strong>Objections:</strong> {meeting.objections}</div>}
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleOpenCompletionModal(meeting)}
                        className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium"
                      >
                        Complete Meeting
                      </button>
                      <button
                        onClick={() => handleMeetingStatusChange(meeting.id, "no_show")}
                        disabled={statusUpdatingId === meeting.id}
                        className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium disabled:opacity-50"
                      >
                        No-Show
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {activations.length === 0 ? (
        <div className="bg-slate-800 rounded-lg p-12 text-center text-gray-400">
          No activations in queue
        </div>
      ) : (
        <div className="bg-slate-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-900/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase">
                  Account
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase">
                  Owner
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase">
                  Started
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase">
                  Progress
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase">
                  Next Action
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase">
                  Scheduled
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {activations.map((activation) => {
                const tp = activation.trial_pipeline;
                const stall = getStallStatus(tp);
                const lastEvent = getLastEventTime(tp);
                const isScheduled = tp?.activation_status === 'scheduled';
                const scheduleTime = tp?.scheduled_start_at || tp?.scheduled_install_at;
                const isMissed = isScheduled && scheduleTime && new Date(scheduleTime) < new Date();
                const isUpcoming = isScheduled && scheduleTime && new Date(scheduleTime).getTime() - Date.now() < 24 * 60 * 60 * 1000 && !isMissed;
                const decisionRequired = tp && tp.rescue_attempts >= 3 && !['scheduled', 'activated', 'killed'].includes(tp.activation_status || '');

                return (
                  <tr key={activation.id} className={`hover:bg-slate-700/50 transition-colors ${decisionRequired ? 'bg-red-500/5' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="font-bold text-white leading-tight">{activation.name}</div>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          {activation.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {activation.email}
                            </span>
                          )}
                          {activation.phone && (
                            <span className="flex items-center gap-1 border-l border-slate-700 pl-2">
                              <Phone className="h-3 w-3" />
                              {activation.phone}
                            </span>
                          )}
                        </div>
                        {decisionRequired && (
                          <div className="mt-1 flex items-center gap-1.5 px-2 py-0.5 bg-red-500 text-white text-[10px] font-black rounded uppercase tracking-wider animate-pulse">
                            <AlertTriangle className="h-3 w-3" />
                            Decision Required: Schedule or Kill
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={tp?.assigned_activator_id || ''}
                        onChange={(e) => handleActivatorChange(activation.id, e.target.value)}
                        disabled={statusUpdatingId === activation.id}
                        className="bg-slate-900 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-700 focus:border-blue-500 outline-none w-32"
                      >
                        <option value="">Unassigned</option>
                        {users.map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm text-gray-300">
                          {tp?.trial_started_at
                            ? new Date(tp.trial_started_at).toLocaleDateString()
                            : "—"}
                        </span>
                        <span className="text-[10px] text-gray-500 uppercase font-semibold">
                          {tp?.trial_started_at ? formatTimeAgo(tp.trial_started_at) : ""}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {[
                          { label: 'P', done: tp?.password_set_at, title: 'Password' },
                          { label: 'L', done: tp?.first_login_at, title: 'Login' },
                          { label: 'C', done: tp?.calculator_modified_at, title: 'Config' },
                          { label: 'E', done: tp?.embed_snippet_copied_at, title: 'Embed' },
                          { label: 'L', done: tp?.first_lead_received_at, title: 'Lead' },
                        ].map((milestone, i) => (
                          <div 
                            key={i} 
                            title={milestone.title}
                            className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold border ${
                              milestone.done 
                                ? "bg-green-500/20 border-green-500/50 text-green-400" 
                                : "bg-slate-900 border-slate-700 text-slate-600"
                            }`}
                          >
                            {milestone.done ? <CheckCircle2 className="h-3 w-3" /> : milestone.label}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={tp?.activation_status || 'queued'}
                        onChange={(e) => handleStatusChange(activation.id, e.target.value, tp)}
                        disabled={statusUpdatingId === activation.id}
                        className={`text-xs rounded px-2 py-1.5 border outline-none font-bold uppercase tracking-tight ${
                          tp?.activation_status === 'activated' ? 'bg-green-600 text-white border-green-500' :
                          tp?.activation_status === 'killed' ? 'bg-red-600 text-white border-red-500' :
                          tp?.activation_status === 'scheduled' ? 'bg-blue-600 text-white border-blue-500' :
                          'bg-slate-700 text-white border-slate-600'
                        }`}
                      >
                        <option value="queued">Queued</option>
                        <option value="in_progress">In Progress</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="activated" disabled={!tp?.first_lead_received_at}>Activated</option>
                        <option value="killed">Killed</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 min-w-[180px]">
                      {editingNextActionId === activation.id ? (
                        <div className="flex flex-col gap-1">
                          <input
                            type="text"
                            autoFocus
                            value={nextActionValue}
                            onChange={(e) => setNextActionValue(e.target.value)}
                            onBlur={() => handleNextActionSave(activation.id)}
                            onKeyDown={(e) => e.key === 'Enter' && handleNextActionSave(activation.id)}
                            placeholder="e.g. Call back Tue 10am CT"
                            className="bg-slate-900 border border-blue-500 rounded px-2 py-1 text-xs text-white w-full placeholder:text-slate-500"
                          />
                          <div className="flex flex-wrap gap-1 mt-1">
                            {[
                              "Call back tomorrow AM",
                              "Text for WP login",
                              "Email install steps",
                              "Waiting on web guy",
                              "Schedule install",
                              "Kill if no response EOD",
                            ].map((suggestion) => (
                              <button
                                key={suggestion}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault(); // Prevent onBlur from firing before onClick
                                  setNextActionValue(suggestion);
                                }}
                                className="text-[10px] px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded border border-slate-700"
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div 
                          onClick={() => {
                            setEditingNextActionId(activation.id);
                            setNextActionValue(tp?.next_action || "");
                          }}
                          className={`text-xs p-2 rounded border border-dashed cursor-pointer min-h-[32px] flex items-center ${
                            tp?.next_action 
                              ? 'text-slate-200 border-slate-700 hover:border-blue-500' 
                              : 'text-slate-500 border-red-500/50 italic hover:border-red-500 bg-red-500/5'
                          }`}
                        >
                          {tp?.next_action || "⚠ Required — click to set"}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {isScheduled && tp?.scheduled_start_at ? (
                        <div className="flex flex-col gap-1">
                          <div className={`text-xs font-bold ${isMissed ? 'text-red-400' : 'text-blue-400'}`}>
                            {formatInTimezone(new Date(tp.scheduled_start_at), tp.scheduled_timezone || tp.customer_timezone || 'UTC', { 
                              month: 'short', 
                              day: 'numeric', 
                              hour: '2-digit', 
                              minute: '2-digit', 
                              hour12: true 
                            })}
                            <span className="ml-1 opacity-70 text-[10px]">
                              {formatInTimezone(new Date(tp.scheduled_start_at), tp.scheduled_timezone || tp.customer_timezone || 'UTC', { 
                                timeZoneName: 'short' 
                              }).split(' ').pop()}
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-500 italic" title="Activator time">
                            Activator: {new Date(tp.scheduled_start_at).toLocaleTimeString([], { 
                              hour: '2-digit', 
                              minute: '2-digit',
                              timeZone: 'UTC'
                            })} UTC
                          </div>
                          {isMissed && <span className="text-[10px] bg-red-500/20 text-red-400 px-1 rounded border border-red-500/30 w-fit font-bold uppercase">Missed</span>}
                          {isUpcoming && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1 rounded border border-blue-500/30 w-fit font-bold uppercase tracking-tight">Upcoming</span>}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-600">Not scheduled</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-500 uppercase">Attempts:</span>
                          <span className={`text-xs font-black ${tp?.rescue_attempts && tp.rescue_attempts >= 3 ? 'text-red-400' : 'text-slate-300'}`}>
                            {tp?.rescue_attempts || 0}
                          </span>
                        </div>
                        {tp?.last_contact_at && (
                          <div className="flex flex-col">
                            <span className="text-[10px] text-slate-500 uppercase font-semibold">Last Contact:</span>
                            <span className="text-xs text-slate-300">{formatTimeAgo(tp.last_contact_at)}</span>
                          </div>
                        )}
                        {!tp?.last_contact_at && <span className="text-[10px] text-slate-600 italic uppercase">No contact yet</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Attended/No-Show buttons for scheduled meetings (activator only) */}
                        {isActivator && isScheduled && tp?.scheduled_start_at && !isMissed && (
                          <>
                            <button
                              onClick={() => handleAttendedNoShow(activation.id, "attended")}
                              disabled={statusUpdatingId === activation.id}
                              className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium disabled:opacity-50"
                              title="Mark as Attended"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => handleAttendedNoShow(activation.id, "no_show")}
                              disabled={statusUpdatingId === activation.id}
                              className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium disabled:opacity-50"
                              title="Mark as No-Show"
                            >
                              ✗
                            </button>
                          </>
                        )}
                        {activation.phone && (
                          <Link
                            href={`/dashboard/dialer?leadId=${activation.id}`}
                            className="p-2 text-slate-400 hover:text-green-400 rounded-lg bg-slate-900 border border-slate-700 hover:border-green-500 transition-all shadow-sm"
                            title="Open in Dialer"
                          >
                            <Phone className="h-4 w-4" />
                          </Link>
                        )}
                        <button
                          onClick={() => setShowScheduleModal(activation.id)}
                          className="p-2 text-slate-400 hover:text-blue-400 rounded-lg bg-slate-900 border border-slate-700 hover:border-blue-500 transition-all shadow-sm"
                          title="Schedule Install"
                        >
                          <Calendar className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setShowNotesDrawer(activation.id);
                            if (tp?.id) {
                              fetchActivationEvents(tp.id);
                            }
                          }}
                          className="p-2 text-slate-400 hover:text-yellow-400 rounded-lg bg-slate-900 border border-slate-700 hover:border-yellow-500 transition-all shadow-sm"
                          title="View Notes & Events"
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                        {tp?.jcc_user_id ? (
                          <a
                            href={`https://app.autosalvageautomation.com/control-tower/clients/${tp.jcc_user_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-slate-400 hover:text-purple-400 rounded-lg bg-slate-900 border border-slate-700 hover:border-purple-500 transition-all shadow-sm"
                            title="Open Control Tower"
                          >
                            <Globe className="h-4 w-4" />
                          </a>
                        ) : (
                          <button 
                            disabled 
                            className="p-2 text-slate-700 rounded-lg bg-slate-900 border border-slate-800 opacity-50 cursor-not-allowed"
                            title="No JCC user linked"
                          >
                            <Globe className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setShowKillModal(activation.id)}
                          className="p-2 text-slate-400 hover:text-red-400 rounded-lg bg-slate-900 border border-slate-700 hover:border-red-500 transition-all shadow-sm"
                          title="Kill Trial"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Kill Trial Modal */}
      {showKillModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-white mb-4">Kill Trial</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Reason *
                </label>
                <select
                  value={killReasonType}
                  onChange={(e) => setKillReasonType(e.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 text-white px-3 py-2 text-sm"
                >
                  <option value="">Select a reason...</option>
                  <option value="no_access">No access to website</option>
                  <option value="no_response">No response after multiple attempts</option>
                  <option value="no_technical_owner">No technical owner available</option>
                  <option value="no_urgency">No urgency / wants to do it later</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Notes (optional)
                </label>
                <textarea
                  value={killReason}
                  onChange={(e) => setKillReason(e.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 text-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                  placeholder="Additional notes..."
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowKillModal(null);
                    setKillReason("");
                    setKillReasonType("");
                  }}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleKillTrial(showKillModal)}
                  disabled={killingId === showKillModal || !killReasonType}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {killingId === showKillModal ? "Killing..." : "Kill"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Meeting Completion Modal */}
      {completionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-bold text-white">Complete Meeting</h3>
                <p className="text-sm text-slate-400">{completionModal.meeting.attendeeName}</p>
              </div>
              <button onClick={() => setCompletionModal(null)} className="text-gray-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            {/* Outcome Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-3">What happened?</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setCompletionModal(prev => prev ? {...prev, outcome: 'installed'} : null)}
                  className={`p-3 rounded-lg border-2 text-center transition-all ${
                    completionModal.outcome === 'installed'
                      ? 'border-green-500 bg-green-500/20 text-green-400'
                      : 'border-slate-600 bg-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <CheckCircle2 className="h-6 w-6 mx-auto mb-1" />
                  <div className="text-sm font-medium">Installed & Live</div>
                </button>
                <button
                  onClick={() => setCompletionModal(prev => prev ? {...prev, outcome: 'partial'} : null)}
                  className={`p-3 rounded-lg border-2 text-center transition-all ${
                    completionModal.outcome === 'partial'
                      ? 'border-yellow-500 bg-yellow-500/20 text-yellow-400'
                      : 'border-slate-600 bg-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <Clock className="h-6 w-6 mx-auto mb-1" />
                  <div className="text-sm font-medium">Partial Progress</div>
                </button>
                <button
                  onClick={() => setCompletionModal(prev => prev ? {...prev, outcome: 'couldnt_install'} : null)}
                  className={`p-3 rounded-lg border-2 text-center transition-all ${
                    completionModal.outcome === 'couldnt_install'
                      ? 'border-red-500 bg-red-500/20 text-red-400'
                      : 'border-slate-600 bg-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <AlertTriangle className="h-6 w-6 mx-auto mb-1" />
                  <div className="text-sm font-medium">Couldn't Install</div>
                </button>
              </div>
            </div>
            
            {/* INSTALLED FLOW */}
            {completionModal.outcome === 'installed' && (
              <div className="space-y-4 border-t border-slate-700 pt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Website URL <span className="text-red-400">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={completionModal.websiteUrl}
                      onChange={(e) => setCompletionModal(prev => prev ? {...prev, websiteUrl: e.target.value} : null)}
                      className="flex-1 rounded-lg border border-slate-600 bg-slate-700 text-white px-3 py-2"
                      placeholder="https://example.com"
                    />
                    {completionModal.websiteUrl && (
                      <a
                        href={completionModal.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg"
                      >
                        <ExternalLink className="h-5 w-5" />
                      </a>
                    )}
                  </div>
                </div>
                
                <label className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={completionModal.installVerified}
                    onChange={(e) => setCompletionModal(prev => prev ? {...prev, installVerified: e.target.checked} : null)}
                    className="w-5 h-5 rounded border-slate-500"
                  />
                  <div>
                    <div className="text-white font-medium">Calculator visible and working</div>
                    <div className="text-xs text-slate-400">I verified the calculator is live on their site</div>
                  </div>
                </label>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Notes (optional)</label>
                  <textarea
                    value={completionModal.installNotes}
                    onChange={(e) => setCompletionModal(prev => prev ? {...prev, installNotes: e.target.value} : null)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-700 text-white px-3 py-2"
                    rows={2}
                    placeholder="Any notes about the install..."
                  />
                </div>
              </div>
            )}
            
            {/* PARTIAL / COULDN'T INSTALL FLOW */}
            {(completionModal.outcome === 'partial' || completionModal.outcome === 'couldnt_install') && (
              <div className="space-y-4 border-t border-slate-700 pt-4">
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <div className="flex items-center gap-2 text-yellow-400 font-medium">
                    <AlertTriangle className="h-4 w-4" />
                    Follow-up Required (within 7 days)
                  </div>
                  <p className="text-xs text-yellow-400/70 mt-1">
                    Must schedule follow-up or kill the trial
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    What's the blocker? <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={completionModal.followupReason}
                    onChange={(e) => setCompletionModal(prev => prev ? {...prev, followupReason: e.target.value} : null)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-700 text-white px-3 py-2"
                  >
                    <option value="">Select reason...</option>
                    <option value="waiting_web_guy">Waiting on web person</option>
                    <option value="needs_wp_login">Needs WordPress login</option>
                    <option value="technical_issue">Technical issue on their site</option>
                    <option value="customer_busy">Customer got busy, reschedule</option>
                    <option value="needs_owner_approval">Needs owner approval</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Notes</label>
                  <textarea
                    value={completionModal.installNotes}
                    onChange={(e) => setCompletionModal(prev => prev ? {...prev, installNotes: e.target.value} : null)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-700 text-white px-3 py-2"
                    rows={2}
                    placeholder="Details about what happened..."
                  />
                </div>
                
                <div className="border-t border-slate-700 pt-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">Choose one:</label>
                  
                  <div className="space-y-3">
                    <div className="p-3 bg-slate-700/50 rounded-lg">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name="followup_action"
                          checked={!!completionModal.followupDate}
                          onChange={() => {}}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="text-white font-medium">Schedule Follow-up</div>
                          <input
                            type="datetime-local"
                            value={completionModal.followupDate}
                            onChange={(e) => setCompletionModal(prev => prev ? {...prev, followupDate: e.target.value, killReason: ''} : null)}
                            className="mt-2 w-full rounded border border-slate-600 bg-slate-800 text-white px-3 py-2 text-sm"
                            min={new Date().toISOString().slice(0, 16)}
                            max={new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)}
                          />
                        </div>
                      </label>
                    </div>
                    
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name="followup_action"
                          checked={!!completionModal.killReason}
                          onChange={() => {}}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="text-red-400 font-medium">Kill Trial</div>
                          <select
                            value={completionModal.killReason}
                            onChange={(e) => setCompletionModal(prev => prev ? {...prev, killReason: e.target.value, followupDate: ''} : null)}
                            className="mt-2 w-full rounded border border-red-500/50 bg-slate-800 text-white px-3 py-2 text-sm"
                          >
                            <option value="">Select reason...</option>
                            <option value="no_access">No website access</option>
                            <option value="no_response">No response / ghosted</option>
                            <option value="no_technical_owner">No technical owner available</option>
                            <option value="no_urgency">No urgency / wants to do later</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Submit Button */}
            <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-slate-700">
              <button
                onClick={() => setCompletionModal(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitCompletion}
                disabled={!canSubmitCompletion()}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save & Complete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Slot Picker */}
      {showScheduleModal && (
        <ScheduleSlotPicker
          onClose={() => setShowScheduleModal(null)}
          onSave={(data) => handleScheduleSubmit(showScheduleModal, data)}
          isSaving={statusUpdatingId === showScheduleModal}
          leadId={showScheduleModal}
          trialPipelineId={activations.find(a => a.id === showScheduleModal)?.trial_pipeline?.id}
          initialTimezone={activations.find(a => a.id === showScheduleModal)?.trial_pipeline?.customer_timezone}
          initialTechOwner={activations.find(a => a.id === showScheduleModal)?.trial_pipeline?.technical_owner_name}
          initialPhone={activations.find(a => a.id === showScheduleModal)?.phone || undefined}
          initialEmail={activations.find(a => a.id === showScheduleModal)?.email || undefined}
        />
      )}

      {/* Availability Settings Modal */}
      {showAvailabilitySettings && (
        <ActivatorAvailabilitySettings
          onClose={() => setShowAvailabilitySettings(false)}
        />
      )}

      {/* Guide Modal */}
      {showGuide && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold text-white">Activations Guide</h3>
              <button onClick={() => setShowGuide(false)} className="text-gray-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-6 text-sm text-gray-300">
              <section>
                <h4 className="text-lg font-semibold text-white mb-2">Your Job as Activator</h4>
                <p>You own every trial from signup to first lead received. SDRs sell and send trials. You make sure trials actually work.</p>
              </section>

              <section>
                <h4 className="text-lg font-semibold text-white mb-2">Progress Checkmarks</h4>
                <ul className="space-y-2 list-disc list-inside">
                  <li><strong>Password</strong> — They set their password (can log in)</li>
                  <li><strong>Login</strong> — They logged in at least once</li>
                  <li><strong>Config</strong> — They customized their calculator</li>
                  <li><strong>Embed</strong> — They copied the embed snippet</li>
                  <li><strong>Lead</strong> — Their calculator received a real lead (ACTIVATED!)</li>
                </ul>
              </section>

              <section>
                <h4 className="text-lg font-semibold text-white mb-2">Status Labels</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400">Needs Password</span>
                    <span>→ Call them. Walk through password setup.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400">Needs Login</span>
                    <span>→ Password works but haven't logged in. Remind them.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400">Needs Config</span>
                    <span>→ They're in but haven't set up their calculator.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400">Needs Embed</span>
                    <span>→ Calculator ready but not on their website yet.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400">Verify Live</span>
                    <span>→ Embed copied. Check their site, help install if stuck.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400">Ready</span>
                    <span>→ First lead received! They're activated. 🎉</span>
                  </div>
                </div>
              </section>

              <section>
                <h4 className="text-lg font-semibold text-white mb-2">Stalled Badges</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-orange-500 text-white">Stalled 24h+</span>
                    <span>→ No progress in 24 hours. Needs a call TODAY.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-600 text-white">Stalled 72h+</span>
                    <span>→ No progress in 3 days. HIGH PRIORITY. Call NOW.</span>
                  </div>
                </div>
              </section>

              <section>
                <h4 className="text-lg font-semibold text-white mb-2">Actions</h4>
                <ul className="space-y-2 list-disc list-inside">
                  <li><strong>Status Dropdown</strong> — Set the primary workflow status</li>
                  <li><strong>Control Tower</strong> — Open the JCC technical view to verify lead</li>
                  <li><strong>📞 Call</strong> — Opens the dialer with this lead loaded</li>
                  <li><strong>✉️ Email</strong> — Opens your email client</li>
                  <li><strong>Kill</strong> — They're not going to activate (requires reason)</li>
                </ul>
              </section>

              <section>
                <h4 className="text-lg font-semibold text-white mb-2">Your Goal</h4>
                <p className="text-white font-medium">Get every trial to "Ready" status (first lead received) as fast as possible. That's activation. That's when you get paid.</p>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

