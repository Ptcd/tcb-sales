"use client";

import { useState, useEffect } from "react";
import { Globe, User, Mail, Clock, RefreshCw, AlertTriangle, CheckCircle, Phone, Calendar, ExternalLink, FileText } from "lucide-react";
import toast from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ScheduleSlotPicker } from "@/components/ScheduleSlotPicker";

interface BlockedItem {
  id: string;
  type: 'blocked';
  leadId: string;
  companyName: string;
  websiteUrl: string;
  phone: string;
  email: string;
  blockReason: string;
  blockOwner: string;
  nextStep: string;
  webPersonName: string | null;
  webPersonRole: string | null;
  webPersonEmail: string | null;
  accessMethod: string | null;
  attemptNumber: number;
  rescheduleCount: number;
  nextFollowupAt: string;
  lastOutcome: string;
}

interface UnprovenItem {
  id: string;
  type: 'unproven';
  meetingId: string;
  leadId: string;
  companyName: string;
  websiteUrl: string;
  phone: string;
  email: string;
  installUrl: string;
  proofMethod: string;
  completedAt: string;
  attendeeName: string;
  creditsRemaining: number;
  warningMessage: string;
}

type QueueItem = BlockedItem | UnprovenItem;

const BLOCK_REASON_LABELS: Record<string, string> = {
  no_website_login: "No Website Login",
  web_person_absent: "Web Person Not Present",
  permission_needed: "Permission/Approval Needed",
  technical_issue: "Technical Issue",
  dns_hosting_missing: "DNS/Hosting Access Missing",
  client_confusion: "Client Confusion / Not Ready",
  other: "Other",
};

const BLOCK_OWNER_LABELS: Record<string, string> = {
  client_owner: "Client (Owner)",
  client_web_person: "Client's Web Person",
  our_team: "Our Team (Activator)",
  mixed: "Mixed",
};

const NEXT_STEP_LABELS: Record<string, string> = {
  get_credentials: "Get Credentials",
  invite_web_person: "Invite Web Person",
  troubleshooting: "Technical Troubleshooting",
  send_instructions: "Send Install Instructions",
  schedule_second_attempt: "Schedule Second Attempt",
  waiting_approval: "Waiting on Approval",
  other: "Other",
};

export default function ActivatorQueuePage() {
  const [blocked, setBlocked] = useState<BlockedItem[]>([]);
  const [unproven, setUnproven] = useState<UnprovenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ blocked: 0, unproven: 0, overdue: 0, today: 0, total: 0 });
  const [activeTab, setActiveTab] = useState<'blocked' | 'unproven'>('blocked');
  const [scheduleItem, setScheduleItem] = useState<BlockedItem | null>(null);

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/pipeline/activator-queue");
      if (!response.ok) throw new Error("Failed to fetch queue");
      const data = await response.json();
      setBlocked(data.blocked || []);
      setUnproven(data.unproven || []);
      setCounts(data.counts || { blocked: 0, unproven: 0, overdue: 0, today: 0, total: 0 });
    } catch (error: any) {
      console.error("Error fetching activator queue:", error);
      toast.error(error.message || "Failed to load queue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const handleScheduleNewMeeting = (item: BlockedItem) => {
    setScheduleItem(item);
  };

  const handleScheduleComplete = (data: {
    scheduled_install_at: string;
    customer_timezone: string;
    technical_owner_name: string;
  }) => {
    setScheduleItem(null);
    fetchQueue();
    toast.success("New meeting scheduled");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Activator Queue</h1>
          <p className="text-slate-400">Blocked installs and unverified completions needing attention</p>
        </div>
        <button
          onClick={fetchQueue}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-orange-600/20 border border-orange-500/30 rounded-lg p-4">
          <div className="text-2xl font-bold text-orange-400">{counts.blocked}</div>
          <div className="text-sm text-orange-300">Blocked Installs</div>
        </div>
        <div className="bg-yellow-600/20 border border-yellow-500/30 rounded-lg p-4">
          <div className="text-2xl font-bold text-yellow-400">{counts.unproven}</div>
          <div className="text-sm text-yellow-300">Unverified Installs</div>
        </div>
        <div className="bg-red-600/20 border border-red-500/30 rounded-lg p-4">
          <div className="text-2xl font-bold text-red-400">{counts.overdue}</div>
          <div className="text-sm text-red-300">Overdue</div>
        </div>
        <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
          <div className="text-2xl font-bold text-slate-300">{counts.total}</div>
          <div className="text-sm text-slate-400">Total</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('blocked')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'blocked'
              ? 'bg-orange-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          Blocked Installs ({counts.blocked})
        </button>
        <button
          onClick={() => setActiveTab('unproven')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'unproven'
              ? 'bg-yellow-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          Install Marked, Not Proven ({counts.unproven})
        </button>
      </div>

      {/* Blocked Tab Content */}
      {activeTab === 'blocked' && (
        <>
          {blocked.length === 0 ? (
            <div className="bg-slate-800 rounded-lg p-8 text-center">
              <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
              <p className="text-slate-300 text-lg">No blocked installs</p>
              <p className="text-slate-400 text-sm mt-1">All installs are progressing smoothly!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {blocked.map((item) => (
                <div key={item.id} className="bg-slate-800 rounded-lg overflow-hidden">
                  {/* Status Banner */}
                  <div className="px-4 py-2 bg-orange-600/20 border-b border-orange-500/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-orange-500 text-white rounded text-xs font-bold uppercase">
                          BLOCKED
                        </span>
                        <span className="text-sm font-medium text-white">
                          {BLOCK_REASON_LABELS[item.blockReason] || item.blockReason}
                        </span>
                        {item.attemptNumber > 1 && (
                          <span className="px-2 py-0.5 bg-slate-600 rounded text-xs text-slate-300">
                            Attempt #{item.attemptNumber}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">
                          Owner: <span className="text-slate-300">{BLOCK_OWNER_LABELS[item.blockOwner] || item.blockOwner}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Main Content */}
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-3 flex-1">
                        <div>
                          <h3 className="text-lg font-semibold text-white">{item.companyName}</h3>
                          {item.webPersonName && (
                            <div className="text-sm text-slate-400">
                              Web Contact: {item.webPersonName} {item.webPersonRole && `(${item.webPersonRole})`}
                            </div>
                          )}
                        </div>
                        
                        <div className="flex flex-wrap gap-4 text-sm">
                          {item.phone && (
                            <a href={`tel:${item.phone}`} className="flex items-center gap-1 text-blue-400 hover:text-blue-300">
                              <Phone className="h-4 w-4" />
                              {item.phone}
                            </a>
                          )}
                          {item.webPersonEmail && (
                            <a href={`mailto:${item.webPersonEmail}`} className="flex items-center gap-1 text-blue-400 hover:text-blue-300">
                              <Mail className="h-4 w-4" />
                              {item.webPersonEmail}
                            </a>
                          )}
                          {item.websiteUrl && (
                            <a href={item.websiteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-400 hover:text-blue-300">
                              <Globe className="h-4 w-4" />
                              View Website
                            </a>
                          )}
                        </div>

                        <div className="flex gap-4 text-xs text-slate-400">
                          <span>Next Step: <span className="text-slate-300">{NEXT_STEP_LABELS[item.nextStep] || item.nextStep}</span></span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Follow up by: {formatDate(item.nextFollowupAt)}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleScheduleNewMeeting(item)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                      >
                        <Calendar className="h-4 w-4" />
                        New Meeting
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Unproven Tab Content */}
      {activeTab === 'unproven' && (
        <>
          {unproven.length === 0 ? (
            <div className="bg-slate-800 rounded-lg p-8 text-center">
              <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
              <p className="text-slate-300 text-lg">No unverified installs</p>
              <p className="text-slate-400 text-sm mt-1">All completed installs have been verified!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {unproven.map((item) => (
                <div key={item.id} className="bg-slate-800 rounded-lg overflow-hidden">
                  {/* Warning Banner */}
                  <div className="px-4 py-2 bg-yellow-600/20 border-b border-yellow-500/30">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-400" />
                      <span className="px-2 py-0.5 bg-yellow-500 text-black rounded text-xs font-bold uppercase">
                        UNVERIFIED
                      </span>
                      <span className="text-sm text-yellow-200">
                        {item.warningMessage}
                      </span>
                    </div>
                  </div>

                  {/* Main Content */}
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-3 flex-1">
                        <div>
                          <h3 className="text-lg font-semibold text-white">{item.companyName}</h3>
                          {item.attendeeName && (
                            <div className="text-sm text-slate-400">Contact: {item.attendeeName}</div>
                          )}
                        </div>
                        
                        <div className="flex flex-wrap gap-4 text-sm">
                          {item.installUrl && (
                            <a href={item.installUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-400 hover:text-blue-300">
                              <ExternalLink className="h-4 w-4" />
                              Check Install URL
                            </a>
                          )}
                          {item.websiteUrl && (
                            <a href={item.websiteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-400 hover:text-blue-300">
                              <Globe className="h-4 w-4" />
                              View Website
                            </a>
                          )}
                        </div>

                        <div className="flex gap-4 text-xs text-slate-400">
                          <span>Proof Method: <span className="text-slate-300">{item.proofMethod || "Not specified"}</span></span>
                          <span>•</span>
                          <span>Completed: {formatDate(item.completedAt)}</span>
                          <span>•</span>
                          <span className="text-yellow-400">Credits: {item.creditsRemaining}/20 (unchanged)</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-2xl font-bold text-yellow-400">
                          {item.creditsRemaining}/20
                        </div>
                        <div className="text-xs text-slate-400">Credits unchanged</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Schedule Modal */}
      {scheduleItem && (
        <ScheduleSlotPicker
          leadId={scheduleItem.leadId}
          onClose={() => setScheduleItem(null)}
          onSave={handleScheduleComplete}
          isSaving={false}
          initialPhone={scheduleItem.phone || null}
        />
      )}
    </div>
  );
}

