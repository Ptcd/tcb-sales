"use client";

import { useState, useEffect } from "react";
import { Phone, Globe, Calendar, Clock, RefreshCw, AlertTriangle, CheckCircle, Mail } from "lucide-react";
import toast from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ScheduleSlotPicker } from "@/components/ScheduleSlotPicker";

interface SDRQueueItem {
  id: string;
  leadId: string;
  companyName: string;
  phone: string;
  website: string;
  email: string;
  activationStatus: string;
  lastOutcome: string;
  nextAction: string;
  noShowCount: number;
  rescheduleCount: number;
  noShowAt: string | null;
  attemptNumber: number;
  attendeeName: string | null;
  originalScheduledTime: string | null;
  scheduledTimezone: string | null;
  meetingStatus: string | null;
  nextFollowupAt: string;
  isOverdue: boolean;
  isToday: boolean;
  callScriptHint: string;
}

export default function SDRQueuePage() {
  const [items, setItems] = useState<SDRQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [rescheduleItem, setRescheduleItem] = useState<SDRQueueItem | null>(null);
  const [counts, setCounts] = useState({ overdue: 0, today: 0, total: 0 });

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const url = showUpcoming 
        ? "/api/pipeline/sdr-queue?includeUpcoming=true"
        : "/api/pipeline/sdr-queue";
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch queue");
      const data = await response.json();
      setItems(data.items || []);
      setCounts({
        overdue: data.overdueCount || 0,
        today: data.todayCount || 0,
        total: data.count || 0,
      });
    } catch (error: any) {
      console.error("Error fetching SDR queue:", error);
      toast.error(error.message || "Failed to load queue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [showUpcoming]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const handleReschedule = (item: SDRQueueItem) => {
    setRescheduleItem(item);
  };

  const handleRescheduleComplete = () => {
    setRescheduleItem(null);
    fetchQueue();
    toast.success("Meeting rescheduled successfully");
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
          <h1 className="text-3xl font-bold text-white mb-2">Install Follow-ups</h1>
          <p className="text-slate-400">SDR queue for no-shows and canceled installs that need rescheduling</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={showUpcoming}
              onChange={(e) => setShowUpcoming(e.target.checked)}
              className="rounded border-slate-600 bg-slate-700 text-blue-500"
            />
            Show upcoming
          </label>
          <button
            onClick={fetchQueue}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-red-600/20 border border-red-500/30 rounded-lg p-4">
          <div className="text-2xl font-bold text-red-400">{counts.overdue}</div>
          <div className="text-sm text-red-300">Overdue</div>
        </div>
        <div className="bg-yellow-600/20 border border-yellow-500/30 rounded-lg p-4">
          <div className="text-2xl font-bold text-yellow-400">{counts.today}</div>
          <div className="text-sm text-yellow-300">Due Today</div>
        </div>
        <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
          <div className="text-2xl font-bold text-slate-300">{counts.total}</div>
          <div className="text-sm text-slate-400">Total</div>
        </div>
      </div>

      {/* Queue Items */}
      {items.length === 0 ? (
        <div className="bg-slate-800 rounded-lg p-8 text-center">
          <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
          <p className="text-slate-300 text-lg">No follow-ups needed</p>
          <p className="text-slate-400 text-sm mt-1">All installs are on track!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="bg-slate-800 rounded-lg overflow-hidden">
              {/* Status Banner */}
              <div className={`px-4 py-2 ${
                item.isOverdue 
                  ? 'bg-red-600/20 border-b border-red-500/30' 
                  : item.activationStatus === 'no_show'
                    ? 'bg-orange-600/20 border-b border-orange-500/30'
                    : 'bg-yellow-600/20 border-b border-yellow-500/30'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {item.isOverdue && (
                      <AlertTriangle className="h-4 w-4 text-red-400" />
                    )}
                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                      item.activationStatus === 'no_show' 
                        ? 'bg-red-500 text-white' 
                        : 'bg-yellow-500 text-black'
                    }`}>
                      {item.activationStatus === 'no_show' ? `NO-SHOW #${item.noShowCount}` : 'NEEDS RESCHEDULE'}
                    </span>
                    <span className="text-sm font-medium text-white">
                      {item.nextAction}
                    </span>
                    {item.attemptNumber > 1 && (
                      <span className="px-2 py-0.5 bg-slate-600 rounded text-xs text-slate-300">
                        Attempt #{item.attemptNumber}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    {item.noShowAt && (
                      <span>No-showed: {formatDate(item.noShowAt)}</span>
                    )}
                    {item.rescheduleCount > 0 && (
                      <span className="px-2 py-0.5 bg-slate-600 rounded">
                        {item.rescheduleCount} reschedule{item.rescheduleCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Main Content */}
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-white">{item.companyName}</h3>
                    {item.attendeeName && (
                      <div className="text-sm text-slate-400">Contact: {item.attendeeName}</div>
                    )}
                    
                    <div className="flex flex-wrap gap-4 text-sm">
                      {item.phone && (
                        <a href={`tel:${item.phone}`} className="flex items-center gap-1 text-blue-400 hover:text-blue-300">
                          <Phone className="h-4 w-4" />
                          {item.phone}
                        </a>
                      )}
                      {item.email && (
                        <a href={`mailto:${item.email}`} className="flex items-center gap-1 text-blue-400 hover:text-blue-300">
                          <Mail className="h-4 w-4" />
                          {item.email}
                        </a>
                      )}
                      {item.website && (
                        <a href={item.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-400 hover:text-blue-300">
                          <Globe className="h-4 w-4" />
                          View Website
                        </a>
                      )}
                    </div>

                    <div className="flex gap-4 text-xs text-slate-400 mt-2">
                      <span>Original appt: {formatDate(item.originalScheduledTime)}</span>
                      <span>•</span>
                      <span className={`flex items-center gap-1 ${item.isOverdue ? 'text-red-400' : ''}`}>
                        <Clock className="h-3 w-3" />
                        Follow up {item.isOverdue ? 'was due' : 'by'}: {formatDate(item.nextFollowupAt)}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleReschedule(item)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                  >
                    <Calendar className="h-4 w-4" />
                    Reschedule
                  </button>
                </div>

                {/* Call Script Hint */}
                <div className="mt-4 p-3 bg-slate-700/50 rounded-lg border border-slate-600">
                  <p className="text-xs text-slate-400 mb-1">💡 Call Script Hint:</p>
                  <p className="text-sm text-slate-300 italic">{item.callScriptHint}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleItem && (
        <ScheduleSlotPicker
          leadId={rescheduleItem.leadId}
          initialPhone={rescheduleItem.phone || null}
          initialTimezone={rescheduleItem.scheduledTimezone || null}
          onClose={() => setRescheduleItem(null)}
          onSave={(data) => handleRescheduleComplete()}
          isSaving={false}
        />
      )}
    </div>
  );
}

