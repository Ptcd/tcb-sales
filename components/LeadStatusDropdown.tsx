"use client";

import { useState, useEffect } from "react";
import { LeadStatus, LostReason, LOST_REASON_OPTIONS } from "@/lib/types";
import LeadStatusBadge from "./LeadStatusBadge";
import toast from "react-hot-toast";
import { X, Calendar } from "lucide-react";

interface LeadStatusDropdownProps {
  leadId: string;
  currentStatus: LeadStatus;
  onStatusChange?: (newStatus: LeadStatus) => void;
}

const CLOSING_STATUSES: LeadStatus[] = ['closed_won', 'closed_lost', 'not_interested'];

const statusOptions: { value: LeadStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "interested", label: "Interested" },
  { value: "trial_started", label: "Trial Started" },
  { value: "follow_up", label: "Follow-Up" },
  { value: "closed_won", label: "Closed Won" },
  { value: "closed_lost", label: "Closed Lost" },
  // Legacy values
  { value: "not_interested", label: "Not Interested" },
  { value: "converted", label: "Converted" },
];

export default function LeadStatusDropdown({
  leadId,
  currentStatus,
  onStatusChange,
}: LeadStatusDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [status, setStatus] = useState<LeadStatus>(currentStatus);
  const [dropdownPosition, setDropdownPosition] = useState<'top' | 'bottom'>('bottom');
  const [hasChanged, setHasChanged] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [showLostReasonModal, setShowLostReasonModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<LeadStatus | null>(null);
  const [followUpDate, setFollowUpDate] = useState("");
  const [lostReason, setLostReason] = useState<LostReason | "">("");
  const [lostReasonNotes, setLostReasonNotes] = useState("");

  // Only sync from prop on initial mount or if we haven't made any changes yet
  useEffect(() => {
    if (!hasChanged && !isUpdating) {
      setStatus(currentStatus);
    }
  }, [currentStatus, hasChanged, isUpdating]);

  // Determine dropdown position based on available space
  const handleToggle = (e: React.MouseEvent) => {
    if (isUpdating) return;
    
    if (!isOpen) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      // If more space below or at least 250px below, open downward
      setDropdownPosition(spaceBelow > 250 || spaceBelow > spaceAbove ? 'bottom' : 'top');
    }
    
    setIsOpen(!isOpen);
  };

  const handleStatusChange = async (newStatus: LeadStatus) => {
    if (newStatus === status) {
      setIsOpen(false);
      return;
    }

    // Check if lost reason is required for closed_lost
    if (newStatus === 'closed_lost') {
      setPendingStatus(newStatus);
      setShowLostReasonModal(true);
      setIsOpen(false);
      return;
    }

    // Check if follow-up is required for non-closing statuses
    if (!CLOSING_STATUSES.includes(newStatus)) {
      setPendingStatus(newStatus);
      setShowFollowUpModal(true);
      setIsOpen(false);
      return;
    }

    // For other closing statuses, proceed directly
    await performStatusUpdate(newStatus, null, null, null);
  };

  const performStatusUpdate = async (
    newStatus: LeadStatus, 
    nextFollowUpAt: string | null,
    lostReason: LostReason | null = null,
    lostReasonNotes: string | null = null
  ) => {
    setIsUpdating(true);
    try {
      const body: any = { status: newStatus };
      if (nextFollowUpAt) {
        body.nextFollowUpAt = nextFollowUpAt;
      }
      if (lostReason) {
        body.lostReason = lostReason;
      }
      if (lostReasonNotes !== null) {
        body.lostReasonNotes = lostReasonNotes;
      }

      const response = await fetch(`/api/leads/${leadId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update status");
      }

      setStatus(newStatus);
      setHasChanged(true); // Mark that we've changed the status
      toast.success(`Status updated to ${newStatus}`);
      if (onStatusChange) {
        onStatusChange(newStatus);
      }
    } catch (error: any) {
      console.error("Error updating status:", error);
      toast.error(error.message || "Failed to update status");
    } finally {
      setIsUpdating(false);
      setIsOpen(false);
      setShowFollowUpModal(false);
      setShowLostReasonModal(false);
      setPendingStatus(null);
      setFollowUpDate("");
      setLostReason("");
      setLostReasonNotes("");
    }
  };

  const handleFollowUpSubmit = () => {
    if (!followUpDate) {
      toast.error("Please set a follow-up date");
      return;
    }
    if (pendingStatus) {
      performStatusUpdate(pendingStatus, followUpDate, null, null);
    }
  };

  const handleLostReasonSubmit = () => {
    if (!lostReason) {
      toast.error("Please select a lost reason");
      return;
    }
    if (pendingStatus) {
      performStatusUpdate(pendingStatus, null, lostReason as LostReason, lostReasonNotes || null);
    }
  };

  const formatDateTimeLocal = (date: Date) => {
    const pad = (value: number) => `${value}`.padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  return (
    <div className="relative inline-block">
      <div onClick={handleToggle} className="cursor-pointer">
        <LeadStatusBadge status={status} />
      </div>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown Menu - Dynamic positioning */}
          <div className={`absolute left-0 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20 max-h-64 overflow-y-auto ${
            dropdownPosition === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}>
            <div className="py-1" role="menu">
              {statusOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleStatusChange(option.value)}
                  className={`
                    block w-full text-left px-4 py-2 text-sm
                    ${
                      option.value === status
                        ? "bg-gray-100 text-gray-900"
                        : "text-gray-700 hover:bg-gray-50"
                    }
                  `}
                  role="menuitem"
                  disabled={isUpdating}
                >
                  <LeadStatusBadge status={option.value} />
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Follow-up Modal */}
      {showFollowUpModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Follow-up Required</h3>
              <button
                onClick={() => {
                  setShowFollowUpModal(false);
                  setPendingStatus(null);
                  setFollowUpDate("");
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              A follow-up date is required when changing status to a non-closing value. Please set when you should follow up with this lead.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Follow-up Date & Time
              </label>
              <input
                type="datetime-local"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                min={formatDateTimeLocal(new Date())}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowFollowUpModal(false);
                  setPendingStatus(null);
                  setFollowUpDate("");
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleFollowUpSubmit}
                disabled={!followUpDate || isUpdating}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                <Calendar className="h-4 w-4" />
                {isUpdating ? "Updating..." : "Update Status"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lost Reason Modal */}
      {showLostReasonModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Lost Reason Required</h3>
              <button
                onClick={() => {
                  setShowLostReasonModal(false);
                  setPendingStatus(null);
                  setLostReason("");
                  setLostReasonNotes("");
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Please select a reason why this lead was lost. This helps improve our understanding of why quotes don't convert.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Lost Reason <span className="text-red-500">*</span>
              </label>
              <select
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value as LostReason | "")}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes (Optional)
              </label>
              <textarea
                value={lostReasonNotes}
                onChange={(e) => setLostReasonNotes(e.target.value)}
                placeholder="Additional details about why this lead was lost..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={3}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowLostReasonModal(false);
                  setPendingStatus(null);
                  setLostReason("");
                  setLostReasonNotes("");
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLostReasonSubmit}
                disabled={!lostReason || isUpdating}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {isUpdating ? "Updating..." : "Mark as Lost"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

