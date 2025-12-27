"use client";

import { useState, useEffect } from "react";
import { X, CheckCircle, AlertTriangle, Calendar, User, Building, Clock, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { addBusinessDays } from "@/lib/utils/dates";

// Types
type Outcome = 'installed_proven' | 'blocked' | 'partial' | 'rescheduled' | 'no_show' | 'canceled' | 'killed';

interface ActivatorCallSummaryModalProps {
  meetingId: string;
  meetingData: {
    companyName: string;
    attendeeName?: string;
    scheduledByName?: string;
    scheduledTime?: string;
    phone?: string;
    website?: string;
  };
  onClose: () => void;
  onComplete: () => void;
}

// Enum options
const PROOF_METHODS = [
  { value: 'credits_decremented', label: 'Credits decremented (20→19)' },
  { value: 'test_lead_confirmed', label: 'Test lead confirmed by client' },
  { value: 'both', label: 'Both' },
];

const LEAD_DELIVERY_METHODS = [
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'crm', label: 'CRM/Inbox' },
  { value: 'webhook', label: 'Webhook' },
];

const BLOCK_REASONS = [
  { value: 'no_website_login', label: 'No website login' },
  { value: 'web_person_absent', label: 'Website person not present' },
  { value: 'permission_needed', label: 'Permission/approval needed' },
  { value: 'technical_issue', label: 'Technical issue (theme/plugin/conflict)' },
  { value: 'dns_hosting_missing', label: 'DNS/hosting access missing' },
  { value: 'client_confusion', label: 'Client confusion / not ready' },
  { value: 'other', label: 'Other' },
];

const BLOCK_OWNERS = [
  { value: 'client_owner', label: 'Client (owner)' },
  { value: 'client_web_person', label: "Client's web person" },
  { value: 'our_team', label: 'Our team (activator)' },
  { value: 'mixed', label: 'Mixed' },
];

const NEXT_STEPS = [
  { value: 'get_credentials', label: 'Get credentials' },
  { value: 'invite_web_person', label: 'Invite web person' },
  { value: 'troubleshooting', label: 'Technical troubleshooting' },
  { value: 'send_instructions', label: 'Send install instructions' },
  { value: 'schedule_second_attempt', label: 'Schedule second install attempt' },
  { value: 'waiting_approval', label: 'Waiting on approval' },
  { value: 'other', label: 'Other' },
];

const RESCHEDULE_REASONS = [
  { value: 'client_requested', label: 'Client requested' },
  { value: 'web_person_unavailable', label: 'Website person unavailable' },
  { value: 'credentials_not_ready', label: 'Credentials not ready' },
  { value: 'activator_conflict', label: 'Activator conflict' },
  { value: 'other', label: 'Other' },
];

const CANCEL_REASONS = [
  { value: 'client_unavailable', label: 'Client unavailable' },
  { value: 'website_not_ready', label: 'Website not ready' },
  { value: 'other', label: 'Other' },
];

const KILL_REASONS = [
  { value: 'no_website', label: "No website / won't add to site" },
  { value: 'not_buying_junk_cars', label: 'Not buying junk cars' },
  { value: 'pricing_objection', label: 'Pricing objection' },
  { value: 'not_decision_maker', label: "Not decision maker / can't get approval" },
  { value: 'competitor', label: 'Went with competitor' },
  { value: 'ghosted', label: 'Ghosted after attempts' },
  { value: 'other', label: 'Other' },
];

const CONTACT_METHODS = [
  { value: 'called', label: 'Called' },
  { value: 'texted', label: 'Texted' },
  { value: 'emailed', label: 'Emailed' },
];

export function ActivatorCallSummaryModal({
  meetingId,
  meetingData,
  onClose,
  onComplete,
}: ActivatorCallSummaryModalProps) {
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Section 2: Install fields
  const [installUrl, setInstallUrl] = useState("");
  const [proofMethod, setProofMethod] = useState("");
  const [leadDeliveryMethods, setLeadDeliveryMethods] = useState<string[]>([]);
  const [primaryRecipient, setPrimaryRecipient] = useState("");
  const [clientConfirmedReceipt, setClientConfirmedReceipt] = useState(false);

  // Section 3: Block/Partial fields
  const [blockReason, setBlockReason] = useState("");
  const [blockOwner, setBlockOwner] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [followupDate, setFollowupDate] = useState("");
  const [outcomeNotes, setOutcomeNotes] = useState("");

  // Section 4: Reschedule fields
  const [newDatetime, setNewDatetime] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [webPersonInvited, setWebPersonInvited] = useState(false);

  // Section 5: No-show/Canceled fields
  const [contactAttempted, setContactAttempted] = useState<string[]>([]);
  const [canceledBy, setCanceledBy] = useState<'client' | 'us' | ''>('');
  const [cancelReason, setCancelReason] = useState("");

  // Section 6: Killed fields
  const [killReason, setKillReason] = useState("");

  // Set default follow-up dates
  useEffect(() => {
    if (outcome === 'blocked') {
      const defaultDate = addBusinessDays(new Date(), 1);
      setFollowupDate(defaultDate.toISOString().slice(0, 16));
    } else if (outcome === 'partial') {
      const defaultDate = addBusinessDays(new Date(), 2);
      setFollowupDate(defaultDate.toISOString().slice(0, 16));
    } else if (outcome === 'no_show' || outcome === 'canceled') {
      const defaultDate = addBusinessDays(new Date(), 1);
      setFollowupDate(defaultDate.toISOString().slice(0, 16));
    }
  }, [outcome]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!outcome) {
      newErrors.outcome = "Please select an outcome";
      setErrors(newErrors);
      return false;
    }

    switch (outcome) {
      case 'installed_proven':
        if (!installUrl) newErrors.installUrl = "Install URL is required";
        if (!proofMethod) newErrors.proofMethod = "Proof method is required";
        if (leadDeliveryMethods.length === 0) newErrors.leadDeliveryMethods = "Select at least one delivery method";
        break;

      case 'blocked':
      case 'partial':
        if (!blockReason) newErrors.blockReason = "Block reason is required";
        if (!blockOwner) newErrors.blockOwner = "Block owner is required";
        if (!nextStep) newErrors.nextStep = "Next step is required";
        if (!followupDate) newErrors.followupDate = "Follow-up date is required";
        break;

      case 'rescheduled':
        if (!newDatetime) newErrors.newDatetime = "New date/time is required";
        if (!rescheduleReason) newErrors.rescheduleReason = "Reschedule reason is required";
        break;

      case 'no_show':
        if (contactAttempted.length === 0) newErrors.contactAttempted = "Select at least one contact method attempted";
        break;

      case 'canceled':
        if (!canceledBy) newErrors.canceledBy = "Canceled by is required";
        if (!cancelReason) newErrors.cancelReason = "Cancel reason is required";
        break;

      case 'killed':
        if (!killReason) newErrors.killReason = "Kill reason is required";
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      const body: Record<string, any> = { outcome };

      switch (outcome) {
        case 'installed_proven':
          body.install_url = installUrl;
          body.proof_method = proofMethod;
          body.lead_delivery_methods = leadDeliveryMethods;
          body.primary_recipient = primaryRecipient || undefined;
          body.client_confirmed_receipt = clientConfirmedReceipt;
          break;

        case 'blocked':
        case 'partial':
          body.block_reason = blockReason;
          body.block_owner = blockOwner;
          body.next_step = nextStep;
          body.followup_date = followupDate;
          body.outcome_notes = outcomeNotes || undefined;
          break;

        case 'rescheduled':
          body.new_datetime = newDatetime;
          body.reschedule_reason = rescheduleReason;
          body.web_person_invited = webPersonInvited;
          break;

        case 'no_show':
          body.contact_attempted = contactAttempted;
          body.followup_date = followupDate;
          break;

        case 'canceled':
          body.canceled_by = canceledBy;
          body.cancel_reason = cancelReason;
          body.followup_date = followupDate;
          break;

        case 'killed':
          body.kill_reason = killReason;
          body.outcome_notes = outcomeNotes || undefined;
          break;
      }

      const response = await fetch(`/api/activation-meetings/${meetingId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to complete meeting");
      }

      toast.success(`Meeting marked as ${outcome!.replace('_', ' ')}`);
      onComplete();
    } catch (error: any) {
      console.error("Error completing meeting:", error);
      toast.error(error.message || "Failed to complete meeting");
    } finally {
      setLoading(false);
    }
  };

  const toggleDeliveryMethod = (method: string) => {
    setLeadDeliveryMethods(prev => 
      prev.includes(method) 
        ? prev.filter(m => m !== method)
        : [...prev, method]
    );
  };

  const toggleContactMethod = (method: string) => {
    setContactAttempted(prev => 
      prev.includes(method) 
        ? prev.filter(m => m !== method)
        : [...prev, method]
    );
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Complete Meeting</h2>
            <p className="text-sm text-slate-400">{meetingData.companyName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Section 7: Attribution (Always visible) */}
          <div className="bg-slate-700/50 rounded-lg p-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-slate-400" />
                <span className="text-slate-400">Company:</span>
                <span className="text-white">{meetingData.companyName}</span>
              </div>
              {meetingData.attendeeName && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-400">Contact:</span>
                  <span className="text-white">{meetingData.attendeeName}</span>
                </div>
              )}
              {meetingData.scheduledByName && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-400">Scheduled by:</span>
                  <span className="text-white">{meetingData.scheduledByName}</span>
                </div>
              )}
              {meetingData.scheduledTime && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-400">Meeting:</span>
                  <span className="text-white">{meetingData.scheduledTime}</span>
                </div>
              )}
            </div>
          </div>

          {/* Section 1: Outcome (Required) */}
          <div>
            <label className="block text-sm font-medium text-white mb-3">
              Outcome <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'installed_proven', label: 'Installed + Proven', color: 'green' },
                { value: 'blocked', label: 'Blocked', color: 'orange' },
                { value: 'partial', label: 'Partial Install', color: 'yellow' },
                { value: 'rescheduled', label: 'Rescheduled', color: 'blue' },
                { value: 'no_show', label: 'No-Show', color: 'red' },
                { value: 'canceled', label: 'Canceled', color: 'slate' },
                { value: 'killed', label: 'Killed / Not a Fit', color: 'red' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setOutcome(opt.value as Outcome)}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    outcome === opt.value
                      ? `border-${opt.color}-500 bg-${opt.color}-500/20 text-white`
                      : 'border-slate-600 hover:border-slate-500 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {outcome === opt.value && <CheckCircle className="h-4 w-4" />}
                    <span className="font-medium">{opt.label}</span>
                  </div>
                </button>
              ))}
            </div>
            {errors.outcome && <p className="text-red-400 text-sm mt-1">{errors.outcome}</p>}
          </div>

          {/* Section 2: Install Details (if installed_proven) */}
          {outcome === 'installed_proven' && (
            <div className="space-y-4 p-4 bg-green-900/20 rounded-lg border border-green-500/30">
              <h3 className="font-medium text-green-400">Install Details</h3>
              
              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Install URL <span className="text-red-400">*</span>
                </label>
                <input
                  type="url"
                  value={installUrl}
                  onChange={(e) => setInstallUrl(e.target.value)}
                  placeholder="https://example.com/page-with-calculator"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                />
                {errors.installUrl && <p className="text-red-400 text-sm mt-1">{errors.installUrl}</p>}
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Proof Method <span className="text-red-400">*</span>
                </label>
                <select
                  value={proofMethod}
                  onChange={(e) => setProofMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="">Select proof method...</option>
                  {PROOF_METHODS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {errors.proofMethod && <p className="text-red-400 text-sm mt-1">{errors.proofMethod}</p>}
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Lead Delivery Methods <span className="text-red-400">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {LEAD_DELIVERY_METHODS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => toggleDeliveryMethod(opt.value)}
                      className={`px-3 py-1 rounded-full text-sm ${
                        leadDeliveryMethods.includes(opt.value)
                          ? 'bg-green-500 text-white'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {errors.leadDeliveryMethods && <p className="text-red-400 text-sm mt-1">{errors.leadDeliveryMethods}</p>}
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">Primary Recipient (optional)</label>
                <input
                  type="text"
                  value={primaryRecipient}
                  onChange={(e) => setPrimaryRecipient(e.target.value)}
                  placeholder="email@example.com or phone"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                />
              </div>

              {(proofMethod === 'test_lead_confirmed' || proofMethod === 'both') && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={clientConfirmedReceipt}
                    onChange={(e) => setClientConfirmedReceipt(e.target.checked)}
                    className="rounded border-slate-600"
                  />
                  <span className="text-sm text-slate-300">Client confirmed receipt during call</span>
                </label>
              )}
            </div>
          )}

          {/* Section 3: Block/Partial */}
          {(outcome === 'blocked' || outcome === 'partial') && (
            <div className="space-y-4 p-4 bg-orange-900/20 rounded-lg border border-orange-500/30">
              <h3 className="font-medium text-orange-400">
                {outcome === 'blocked' ? 'Blocked Details' : 'Partial Install Details'}
              </h3>
              
              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Block Reason <span className="text-red-400">*</span>
                </label>
                <select
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="">Select reason...</option>
                  {BLOCK_REASONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {errors.blockReason && <p className="text-red-400 text-sm mt-1">{errors.blockReason}</p>}
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Who Owns Unblock <span className="text-red-400">*</span>
                </label>
                <select
                  value={blockOwner}
                  onChange={(e) => setBlockOwner(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="">Select owner...</option>
                  {BLOCK_OWNERS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {errors.blockOwner && <p className="text-red-400 text-sm mt-1">{errors.blockOwner}</p>}
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Next Step <span className="text-red-400">*</span>
                </label>
                <select
                  value={nextStep}
                  onChange={(e) => setNextStep(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="">Select next step...</option>
                  {NEXT_STEPS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {errors.nextStep && <p className="text-red-400 text-sm mt-1">{errors.nextStep}</p>}
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Follow-up Due <span className="text-red-400">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={followupDate}
                  onChange={(e) => setFollowupDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                />
                {errors.followupDate && <p className="text-red-400 text-sm mt-1">{errors.followupDate}</p>}
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">Notes (optional)</label>
                <textarea
                  value={outcomeNotes}
                  onChange={(e) => setOutcomeNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  placeholder="Any additional notes..."
                />
              </div>
            </div>
          )}

          {/* Section 4: Reschedule */}
          {outcome === 'rescheduled' && (
            <div className="space-y-4 p-4 bg-blue-900/20 rounded-lg border border-blue-500/30">
              <h3 className="font-medium text-blue-400">Reschedule Details</h3>
              
              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  New Date/Time <span className="text-red-400">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={newDatetime}
                  onChange={(e) => setNewDatetime(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                />
                {errors.newDatetime && <p className="text-red-400 text-sm mt-1">{errors.newDatetime}</p>}
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Reschedule Reason <span className="text-red-400">*</span>
                </label>
                <select
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="">Select reason...</option>
                  {RESCHEDULE_REASONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {errors.rescheduleReason && <p className="text-red-400 text-sm mt-1">{errors.rescheduleReason}</p>}
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={webPersonInvited}
                  onChange={(e) => setWebPersonInvited(e.target.checked)}
                  className="rounded border-slate-600"
                />
                <span className="text-sm text-slate-300">Web person invited to new meeting</span>
              </label>
            </div>
          )}

          {/* Section 5: No-Show */}
          {outcome === 'no_show' && (
            <div className="space-y-4 p-4 bg-red-900/20 rounded-lg border border-red-500/30">
              <h3 className="font-medium text-red-400">No-Show Details</h3>
              
              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Contact Attempted <span className="text-red-400">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {CONTACT_METHODS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => toggleContactMethod(opt.value)}
                      className={`px-3 py-1 rounded-full text-sm ${
                        contactAttempted.includes(opt.value)
                          ? 'bg-red-500 text-white'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {errors.contactAttempted && <p className="text-red-400 text-sm mt-1">{errors.contactAttempted}</p>}
              </div>

              <div className="p-3 bg-slate-700/50 rounded-lg">
                <p className="text-sm text-slate-400">
                  <AlertTriangle className="h-4 w-4 inline mr-1" />
                  This will assign follow-up to SDR for rescheduling. Due: next business day.
                </p>
              </div>
            </div>
          )}

          {/* Section 5b: Canceled */}
          {outcome === 'canceled' && (
            <div className="space-y-4 p-4 bg-slate-700/50 rounded-lg border border-slate-600">
              <h3 className="font-medium text-slate-300">Canceled Details</h3>
              
              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Canceled By <span className="text-red-400">*</span>
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCanceledBy('client')}
                    className={`flex-1 p-2 rounded-lg border ${
                      canceledBy === 'client'
                        ? 'border-blue-500 bg-blue-500/20 text-white'
                        : 'border-slate-600 text-slate-300'
                    }`}
                  >
                    Client
                  </button>
                  <button
                    onClick={() => setCanceledBy('us')}
                    className={`flex-1 p-2 rounded-lg border ${
                      canceledBy === 'us'
                        ? 'border-blue-500 bg-blue-500/20 text-white'
                        : 'border-slate-600 text-slate-300'
                    }`}
                  >
                    Us
                  </button>
                </div>
                {errors.canceledBy && <p className="text-red-400 text-sm mt-1">{errors.canceledBy}</p>}
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Cancel Reason <span className="text-red-400">*</span>
                </label>
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="">Select reason...</option>
                  {CANCEL_REASONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {errors.cancelReason && <p className="text-red-400 text-sm mt-1">{errors.cancelReason}</p>}
              </div>
            </div>
          )}

          {/* Section 6: Killed */}
          {outcome === 'killed' && (
            <div className="space-y-4 p-4 bg-red-900/30 rounded-lg border border-red-500/50">
              <h3 className="font-medium text-red-400">Kill Reason</h3>
              
              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Reason <span className="text-red-400">*</span>
                </label>
                <select
                  value={killReason}
                  onChange={(e) => setKillReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="">Select reason...</option>
                  {KILL_REASONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {errors.killReason && <p className="text-red-400 text-sm mt-1">{errors.killReason}</p>}
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">Notes (optional)</label>
                <textarea
                  value={outcomeNotes}
                  onChange={(e) => setOutcomeNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  placeholder="Any additional notes..."
                />
              </div>

              <div className="p-3 bg-red-900/50 rounded-lg">
                <p className="text-sm text-red-300">
                  <AlertTriangle className="h-4 w-4 inline mr-1" />
                  This is a terminal state. The trial cannot be reopened.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !outcome}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg flex items-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Complete Meeting
          </button>
        </div>
      </div>
    </div>
  );
}

