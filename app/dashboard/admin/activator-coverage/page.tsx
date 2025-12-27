"use client";

import { useState, useEffect } from "react";
import { Phone, Mail, User as UserIcon, Globe, MapPin, Settings, ExternalLink, Calendar, X, CheckCircle2, Clock, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { formatInTimezone } from "@/lib/timezones";
import { ActivationMeeting } from "@/lib/types";
import { useCall } from "@/components/CallProvider";

interface Activator {
  id: string;
  full_name: string | null;
  email: string;
  is_activator: boolean;
}

interface CompletionModalState {
  meeting: ActivationMeeting;
  outcome: 'installed' | 'partial' | 'couldnt_install' | null;
  websiteUrl: string;
  installVerified: boolean;
  installNotes: string;
  followupDate: string;
  followupReason: string;
  killReason: string;
}

interface ReassignModalState {
  meetingId: string;
  currentActivatorId: string;
  currentActivatorName: string;
  attendeeName: string;
}

export default function ActivatorCoveragePage() {
  const [meetings, setMeetings] = useState<ActivationMeeting[]>([]);
  const [activators, setActivators] = useState<Activator[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedActivator, setSelectedActivator] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [completionModal, setCompletionModal] = useState<CompletionModalState | null>(null);
  const [reassignModal, setReassignModal] = useState<ReassignModalState | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [isReassigning, setIsReassigning] = useState(false);
  const [reassignReason, setReassignReason] = useState("");
  const [newActivatorId, setNewActivatorId] = useState("");
  const [provisionModal, setProvisionModal] = useState<{
    meetingId: string;
    leadId: string | null;
    email: string;
    businessName: string;
    contactName: string;
    website: string;
    phone: string;
  } | null>(null);
  const [isProvisioning, setIsProvisioning] = useState(false);

  const { makeCall } = useCall();

  useEffect(() => {
    fetchMeetings();
    fetchActivators();
  }, []);

  const fetchMeetings = async () => {
    try {
      const res = await fetch("/api/admin/activator-meetings");
      const data = await res.json();
      if (data.success) {
        setMeetings(data.meetings || []);
      } else {
        toast.error("Failed to load meetings");
      }
    } catch (error) {
      console.error("Error fetching meetings:", error);
      toast.error("Failed to load meetings");
    } finally {
      setLoading(false);
    }
  };

  const fetchActivators = async () => {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (data.users) {
        setActivators(data.users.filter((u: any) => u.is_activator));
      }
    } catch (error) {
      console.error("Error fetching activators:", error);
    }
  };

  const handleOpenCompletionModal = (meeting: ActivationMeeting) => {
    setCompletionModal({
      meeting,
      outcome: null,
      websiteUrl: meeting.websiteUrl || '',
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
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleNoShow = async (meetingId: string) => {
    setStatusUpdatingId(meetingId);
    try {
      const res = await fetch(`/api/activation-meetings/${meetingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "no_show" }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update meeting status");
      }

      toast.success("Meeting marked as no-show");
      fetchMeetings();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleReassign = async () => {
    if (!reassignModal || !newActivatorId) {
      toast.error("Please select a new activator");
      return;
    }

    setIsReassigning(true);
    try {
      const res = await fetch('/api/admin/activator-meetings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: reassignModal.meetingId,
          newActivatorId,
          reason: reassignReason || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reassign meeting');
      }

      toast.success("Meeting reassigned successfully");
      setReassignModal(null);
      setNewActivatorId("");
      setReassignReason("");
      fetchMeetings();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsReassigning(false);
    }
  };

  const openReassignModal = (meeting: ActivationMeeting) => {
    setReassignModal({
      meetingId: meeting.id,
      currentActivatorId: meeting.activatorUserId,
      currentActivatorName: meeting.activatorName || "Unknown",
      attendeeName: meeting.attendeeName,
    });
    setNewActivatorId("");
    setReassignReason("");
  };

  const openProvisionModal = (meeting: ActivationMeeting) => {
    setProvisionModal({
      meetingId: meeting.id,
      leadId: meeting.leadId,
      email: meeting.email || '',
      businessName: meeting.attendeeName || '',
      contactName: '',
      website: meeting.websiteUrl || '',
      phone: meeting.phone || '',
    });
  };

  const handleProvisionAccount = async () => {
    if (!provisionModal) return;
    
    // Validate leadId exists
    if (!provisionModal.leadId) {
      toast.error("Cannot create account - meeting is not linked to a lead");
      return;
    }
    
    // Validate required fields
    if (!provisionModal.email || !provisionModal.businessName || !provisionModal.website) {
      toast.error("Email, business name, and website are required");
      return;
    }

    setIsProvisioning(true);
    try {
      const res = await fetch('/api/trials/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: provisionModal.leadId,
          email: provisionModal.email,
          businessName: provisionModal.businessName,
          contactName: provisionModal.contactName || undefined,
          website: provisionModal.website,
          phone: provisionModal.phone || undefined,
          source: 'activation_call',
        }),
      });

      let data;
      try {
        data = await res.json();
      } catch (parseError) {
        // If response isn't JSON, try to get text
        const text = await res.text();
        console.error('Provision API error (non-JSON):', text);
        toast.error(`Failed to create account: ${res.status} ${res.statusText}`);
        return;
      }
      
      if (!res.ok) {
        // Show the specific error from API
        const errorMessage = data.error || `Failed to create account (${res.status})`;
        console.error('Provision API error:', errorMessage, data);
        toast.error(errorMessage);
        return; // Don't throw, just return after showing toast
      }

      toast.success(data.alreadyExists 
        ? 'Account already exists - password reset email sent!' 
        : 'JCC account created! Customer will receive email to set password.');
      
      setProvisionModal(null);
      fetchMeetings(); // Refresh to get updated jcc_user_id
    } catch (error: any) {
      // Network errors or other unexpected errors
      console.error('Provision error:', error);
      toast.error(error.message || 'Failed to create account. Please try again.');
    } finally {
      setIsProvisioning(false);
    }
  };

  // Filter meetings by selected date and activator
  const filteredMeetings = meetings.filter(meeting => {
    const meetingDate = new Date(meeting.scheduledStartAt);
    const isSameDay = meetingDate.toDateString() === selectedDate.toDateString();
    
    if (selectedActivator) {
      return isSameDay && meeting.activatorUserId === selectedActivator;
    }
    return isSameDay;
  }).sort((a, b) => new Date(a.scheduledStartAt).getTime() - new Date(b.scheduledStartAt).getTime());

  // Get meeting counts per activator for selected date
  const getActivatorMeetingCount = (activatorId: string) => {
    return meetings.filter(m => {
      const meetingDate = new Date(m.scheduledStartAt);
      return meetingDate.toDateString() === selectedDate.toDateString() && m.activatorUserId === activatorId;
    }).length;
  };

  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Activator Coverage</h1>
          <p className="text-sm text-gray-400 mt-1">
            View all activator schedules and manage meetings
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => changeDate(-1)}
              className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="px-4 py-2 bg-slate-800 rounded-lg text-white font-medium min-w-[140px] text-center">
              {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
            <button
              onClick={() => changeDate(1)}
              className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => setSelectedDate(new Date())}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
          >
            Today
          </button>
        </div>
      </div>

      {/* Activator Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {activators.map(activator => {
          const count = getActivatorMeetingCount(activator.id);
          const isSelected = selectedActivator === activator.id;
          return (
            <button
              key={activator.id}
              onClick={() => setSelectedActivator(isSelected ? null : activator.id)}
              className={`p-4 rounded-lg border-2 transition-all ${
                isSelected
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-white hover:border-slate-600'
              }`}
            >
              <div className="font-semibold text-lg">{activator.full_name || activator.email}</div>
              <div className="text-sm opacity-80 mt-1">
                {count} meeting{count !== 1 ? 's' : ''} {selectedDate.toDateString() === new Date().toDateString() ? 'today' : 'on this date'}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filter indicator */}
      {selectedActivator && (
        <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3 flex items-center justify-between">
          <span className="text-blue-300">
            Showing meetings for: <strong>{activators.find(a => a.id === selectedActivator)?.full_name || 'Unknown'}</strong>
          </span>
          <button
            onClick={() => setSelectedActivator(null)}
            className="text-blue-400 hover:text-blue-300 text-sm underline"
          >
            Show all
          </button>
        </div>
      )}

      {/* Meetings List */}
      {filteredMeetings.length === 0 ? (
        <div className="bg-slate-800 rounded-lg p-12 text-center text-gray-400">
          No meetings scheduled for {selectedDate.toLocaleDateString()}
          {selectedActivator && ` for ${activators.find(a => a.id === selectedActivator)?.full_name || 'this activator'}`}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredMeetings.map(meeting => (
            <div key={meeting.id} className="p-4 bg-slate-900 rounded-lg border border-slate-700">
              {/* Header with time */}
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-semibold text-white text-lg">
                    {meeting.attendeeName}
                    {(meeting as any).attendeeRole && (
                      <span className="text-slate-400 font-normal text-sm ml-2">({(meeting as any).attendeeRole})</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                    {meeting.activatorName && (
                      <div className="text-xs text-slate-400 flex items-center gap-1">
                        <UserIcon className="h-3 w-3" />
                        Activator: <span className="text-slate-300 font-medium">{meeting.activatorName}</span>
                      </div>
                    )}
                    {(meeting as any).scheduledBySdrName && (
                      <div className="text-xs text-slate-400 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Scheduled by: <span className="text-slate-300 font-medium">{(meeting as any).scheduledBySdrName}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-blue-400 font-medium">
                    {formatInTimezone(new Date(meeting.scheduledStartAt), meeting.scheduledTimezone, {
                      weekday: "short", month: "short", day: "numeric",
                      hour: "2-digit", minute: "2-digit", hour12: true,
                      timeZoneName: "short",
                    })}
                  </div>
                  {(meeting as any).createdAt && (
                    <div className="text-xs text-slate-500 mt-0.5">
                      Booked: {new Date((meeting as any).createdAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Call Button + Contact Info */}
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={() => makeCall(meeting.leadId || '', meeting.phone, meeting.attendeeName)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-sm transition-colors"
                >
                  <Phone className="h-4 w-4" />
                  Call {meeting.phone}
                </button>
                {meeting.email && (
                  <a
                    href={`mailto:${meeting.email}`}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg text-sm transition-colors"
                  >
                    <Mail className="h-4 w-4" />
                    {meeting.email}
                  </a>
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
              <div className="flex flex-wrap gap-2 mb-3">
                {(meeting as any).jccUserId ? (
                  <a
                    href={`https://app.autosalvageautomation.com/control-tower/clients/${(meeting as any).jccUserId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium text-sm transition-colors"
                  >
                    <Settings className="h-4 w-4" />
                    JCC Control Tower
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : meeting.leadId ? (
                  <button
                    onClick={() => openProvisionModal(meeting)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors"
                  >
                    <UserIcon className="h-4 w-4" />
                    Create JCC Account
                  </button>
                ) : (
                  <span className="flex items-center gap-2 px-3 py-2 bg-slate-800 text-slate-500 rounded-lg text-sm">
                    <Settings className="h-4 w-4" />
                    No JCC account linked
                  </span>
                )}
                {meeting.websiteUrl && (
                  <a
                    href={meeting.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg text-sm transition-colors"
                  >
                    <Globe className="h-4 w-4" />
                    Open Website
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              
              {/* Context */}
              <div className="text-xs text-slate-500 mb-3 space-y-1">
                <div><strong>Platform:</strong> {meeting.websitePlatform || 'unknown'}</div>
                <div><strong>Goal:</strong> {meeting.goal || 'Not specified'}</div>
                {meeting.objections && <div><strong>Objections:</strong> {meeting.objections}</div>}
                {(meeting as any).notes && (
                  <div className="mt-2 p-2 bg-slate-800 rounded border border-slate-700">
                    <strong>Notes:</strong> <span className="text-slate-400">{(meeting as any).notes}</span>
                  </div>
                )}
              </div>
              
              {/* SDR Confirmations */}
              {((meeting as any).sdrConfirmedUnderstandsInstall || (meeting as any).sdrConfirmedAgreedInstall || (meeting as any).sdrConfirmedWillAttend) && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {(meeting as any).sdrConfirmedUnderstandsInstall && (
                    <span className="px-2 py-0.5 bg-green-900/40 text-green-400 text-xs rounded">✓ Understands Install</span>
                  )}
                  {(meeting as any).sdrConfirmedAgreedInstall && (
                    <span className="px-2 py-0.5 bg-green-900/40 text-green-400 text-xs rounded">✓ Agreed to Install</span>
                  )}
                  {(meeting as any).sdrConfirmedWillAttend && (
                    <span className="px-2 py-0.5 bg-green-900/40 text-green-400 text-xs rounded">✓ Will Attend</span>
                  )}
                </div>
              )}
              
              {/* Reminder Status */}
              <div className="flex flex-wrap gap-2 mb-3 text-xs">
                {(meeting as any).confirmationSentAt ? (
                  <span className="px-2 py-0.5 bg-blue-900/40 text-blue-400 rounded">
                    Confirmation sent {new Date((meeting as any).confirmationSentAt).toLocaleDateString()}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-yellow-900/40 text-yellow-400 rounded">Confirmation not sent</span>
                )}
                {(meeting as any).reminder24hSentAt && (
                  <span className="px-2 py-0.5 bg-blue-900/40 text-blue-400 rounded">
                    24h reminder sent
                  </span>
                )}
              </div>
              
              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => openReassignModal(meeting)}
                  className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded text-sm font-medium"
                >
                  Reassign
                </button>
                <button
                  onClick={() => handleOpenCompletionModal(meeting)}
                  className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium"
                >
                  Complete Meeting
                </button>
                <button
                  onClick={() => handleNoShow(meeting.id)}
                  disabled={statusUpdatingId === meeting.id}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium disabled:opacity-50"
                >
                  No-Show
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Completion Modal */}
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

      {/* Reassign Modal */}
      {reassignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-bold text-white">Reassign Meeting</h3>
                <p className="text-sm text-slate-400 mt-1">
                  {reassignModal.attendeeName}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Current: {reassignModal.currentActivatorName}
                </p>
              </div>
              <button onClick={() => setReassignModal(null)} className="text-gray-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  New Activator <span className="text-red-400">*</span>
                </label>
                <select
                  value={newActivatorId}
                  onChange={(e) => setNewActivatorId(e.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 text-white px-3 py-2"
                >
                  <option value="">Select activator...</option>
                  {activators
                    .filter(a => a.id !== reassignModal.currentActivatorId)
                    .map(activator => (
                      <option key={activator.id} value={activator.id}>
                        {activator.full_name || activator.email}
                      </option>
                    ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Reason (optional)
                </label>
                <textarea
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 text-white px-3 py-2"
                  rows={2}
                  placeholder="e.g. Activator is out sick..."
                />
              </div>
              
              <div className="flex gap-3 justify-end pt-4 border-t border-slate-700">
                <button
                  onClick={() => setReassignModal(null)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
                  disabled={isReassigning}
                >
                  Cancel
                </button>
                <button
                  onClick={handleReassign}
                  disabled={!newActivatorId || isReassigning}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isReassigning ? "Reassigning..." : "Reassign"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Provision JCC Account Modal */}
      {provisionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-bold text-white">Create JCC Account</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Customer will receive an email to set their password
                </p>
              </div>
              <button onClick={() => setProvisionModal(null)} className="text-gray-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Email <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={provisionModal.email}
                  onChange={(e) => setProvisionModal(prev => prev ? {...prev, email: e.target.value} : null)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 text-white px-3 py-2"
                  placeholder="customer@example.com"
                />
              </div>
              
              {/* Business Name */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Business Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={provisionModal.businessName}
                  onChange={(e) => setProvisionModal(prev => prev ? {...prev, businessName: e.target.value} : null)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 text-white px-3 py-2"
                  placeholder="Business name"
                />
              </div>
              
              {/* Contact Name */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Contact Name
                </label>
                <input
                  type="text"
                  value={provisionModal.contactName}
                  onChange={(e) => setProvisionModal(prev => prev ? {...prev, contactName: e.target.value} : null)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 text-white px-3 py-2"
                  placeholder="Person's name (optional)"
                />
              </div>
              
              {/* Website */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Website URL <span className="text-red-400">*</span>
                </label>
                <input
                  type="url"
                  value={provisionModal.website}
                  onChange={(e) => setProvisionModal(prev => prev ? {...prev, website: e.target.value} : null)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 text-white px-3 py-2"
                  placeholder="https://example.com"
                />
              </div>
              
              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={provisionModal.phone}
                  onChange={(e) => setProvisionModal(prev => prev ? {...prev, phone: e.target.value} : null)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 text-white px-3 py-2"
                  placeholder="(555) 123-4567"
                />
              </div>
              
              {/* Info Box */}
              <div className="p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg text-sm text-blue-300">
                This will create a JCC account with 20 free credits. The customer will receive an email to set their password and can then sign in.
              </div>
              
              {/* Buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t border-slate-700">
                <button
                  onClick={() => setProvisionModal(null)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
                  disabled={isProvisioning}
                >
                  Cancel
                </button>
                <button
                  onClick={handleProvisionAccount}
                  disabled={isProvisioning || !provisionModal.email || !provisionModal.businessName || !provisionModal.website}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProvisioning ? "Creating..." : "Create Account"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

