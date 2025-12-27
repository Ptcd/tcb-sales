"use client";

import { useState, useEffect, useRef } from "react";
import { Phone, Filter, Search, Calendar, User, MapPin, Clock, CheckCircle, XCircle, AlertCircle, Play, Pause, Download } from "lucide-react";
import { Call } from "@/lib/types";
import toast from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";

export default function CallHistoryPage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    status: "",
    outcome: "",
    dateRange: "",
    needsFollowup: false,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);

  const limit = 20;

  useEffect(() => {
    fetchCalls();
  }, [currentPage, filters]);

  const fetchCalls = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: ((currentPage - 1) * limit).toString(),
      });

      if (filters.status) params.append("status", filters.status);
      if (filters.outcome) params.append("outcome", filters.outcome);
      if (filters.needsFollowup) params.append("needsFollowup", "true");

      const response = await fetch(`/api/calls/history?${params}`);
      if (!response.ok) throw new Error("Failed to fetch call history");

      const data = await response.json();
      setCalls(data.calls || []);
      setTotalCount(data.total || 0);
    } catch (error) {
      console.error("Error fetching call history:", error);
      setError("Failed to load call history");
      toast.error("Failed to load call history");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCall = async (callId: string) => {
    if (!confirm("Are you sure you want to delete this call record?")) {
      return;
    }

    try {
      const response = await fetch(`/api/calls/history/${callId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete call");
      }

      toast.success("Call deleted successfully");
      fetchCalls(); // Refresh the list
    } catch (error) {
      console.error("Error deleting call:", error);
      toast.error("Failed to delete call");
    }
  };

  const filteredCalls = calls.filter((call) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      call.leadName?.toLowerCase().includes(searchLower) ||
      call.phoneNumber.includes(searchTerm) ||
      call.notes?.toLowerCase().includes(searchLower)
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "answered":
      case "completed":
        return "bg-green-100 text-green-800";
      case "ringing":
      case "initiated":
        return "bg-yellow-100 text-yellow-800";
      case "no_answer":
      case "busy":
        return "bg-orange-100 text-orange-800";
      case "failed":
      case "cancelled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "answered":
      case "completed":
        return <CheckCircle className="h-4 w-4" />;
      case "no_answer":
      case "busy":
        return <XCircle className="h-4 w-4" />;
      case "failed":
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "0s";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const totalPages = Math.ceil(totalCount / limit);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="text-red-600 text-6xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Call History</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={() => {
                setError(null);
                fetchCalls();
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Phone className="h-8 w-8 text-green-600" />
            <h1 className="text-3xl font-bold text-gray-900">Call History</h1>
          </div>
          <p className="text-gray-600">
            View and manage all calls made to your leads
          </p>
        </div>

        {/* Filters and Search */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by lead name, phone, or notes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="">All Statuses</option>
                <option value="answered">Answered</option>
                <option value="completed">Completed</option>
                <option value="no_answer">No Answer</option>
                <option value="busy">Busy</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            {/* Outcome Filter */}
            <div>
              <select
                value={filters.outcome}
                onChange={(e) => setFilters({ ...filters, outcome: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="">All Outcomes</option>
                <option value="interested">Interested</option>
                <option value="not_interested">Not Interested</option>
                <option value="callback_requested">Callback Requested</option>
                <option value="wrong_number">Wrong Number</option>
                <option value="do_not_call">Do Not Call</option>
              </select>
            </div>
          </div>
          
          {/* Needs Follow-up Filter */}
          <div className="mt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.needsFollowup}
                onChange={(e) => setFilters({ ...filters, needsFollowup: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                Show only calls needing follow-up (no outcome logged)
              </span>
            </label>
          </div>
        </div>

        {/* Calls Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center">
              <LoadingSpinner />
              <p className="text-gray-500 mt-2">Loading call history...</p>
            </div>
          ) : filteredCalls.length === 0 ? (
            <div className="p-8 text-center">
              <Phone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Calls Made</h3>
              <p className="text-gray-600">
                {searchTerm || filters.status || filters.outcome
                  ? "No calls match your filters"
                  : "Start making calls to see them here"}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-hidden">
                <table className="w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Lead
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                        Phone
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Duration
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">
                        Outcome
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden xl:table-cell">
                        Notes
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">
                        Date
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredCalls.map((call) => (
                      <tr key={call.id} className="hover:bg-gray-50">
                        <td className="px-3 py-3">
                          <div className="flex items-center">
                            <User className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">
                                {call.leadName || "Unknown Lead"}
                              </div>
                              {call.leadAddress && (
                                <div className="text-xs text-gray-500 flex items-center md:hidden">
                                  <Phone className="h-3 w-3 mr-1" />
                                  {call.phoneNumber}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap hidden md:table-cell">
                          <div className="text-sm text-gray-900">
                            {call.phoneNumber}
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
                                call.status
                              )}`}
                            >
                              {getStatusIcon(call.status)}
                              <span className="ml-1 hidden sm:inline">{call.status}</span>
                            </span>
                            {!call.outcome && call.initiatedAt && (() => {
                              const initiated = new Date(call.initiatedAt);
                              const now = new Date();
                              const minutesAgo = (now.getTime() - initiated.getTime()) / (1000 * 60);
                              if (minutesAgo > 10) {
                                return (
                                  <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                    Needs Follow-up
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                          {formatDuration(call.duration)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap hidden lg:table-cell">
                          <span className="text-sm text-gray-600">
                            {call.outcome || "—"}
                          </span>
                        </td>
                        <td className="px-3 py-3 max-w-xs truncate hidden xl:table-cell">
                          <span className="text-sm text-gray-600" title={call.notes || ""}>
                            {call.notes ? (call.notes.length > 40 ? `${call.notes.substring(0, 40)}...` : call.notes) : "—"}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500 hidden lg:table-cell">
                          {formatDate(call.initiatedAt)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSelectedCall(call)}
                              className="text-blue-600 hover:text-blue-900 text-xs"
                            >
                              View
                            </button>
                            <button
                              onClick={() => handleDeleteCall(call.id)}
                              className="text-red-600 hover:text-red-900 text-xs"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="bg-white px-4 py-3 border-t border-gray-200 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-700">
                      Showing {((currentPage - 1) * limit) + 1} to{" "}
                      {Math.min(currentPage * limit, totalCount)} of {totalCount} results
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setCurrentPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                      >
                        Previous
                      </button>
                      <span className="px-3 py-1 text-sm text-gray-700">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Call Detail Modal */}
        {selectedCall && (
          <CallDetailModal
            call={selectedCall}
            onClose={() => setSelectedCall(null)}
            onUpdate={() => {
              setSelectedCall(null);
              fetchCalls(); // Refresh data after update
            }}
          />
        )}
      </div>
    </div>
  );
}

interface CallDetailModalProps {
  call: Call;
  onClose: () => void;
  onUpdate: () => void;
}

function CallDetailModal({ call, onClose, onUpdate }: CallDetailModalProps) {
  const [notes, setNotes] = useState(call.notes || "");
  const [outcome, setOutcome] = useState(call.outcome || "");
  const [callbackDate, setCallbackDate] = useState(
    call.callbackDate ? call.callbackDate.split("T")[0] : ""
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [isLoadingRecording, setIsLoadingRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/calls/${call.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: notes.trim(),
          outcome: outcome || null,
          callbackDate: callbackDate || null,
        }),
      });

      if (!response.ok) throw new Error("Failed to update call");

      toast.success("Call updated successfully");
      onUpdate(); // This will close modal AND refresh data
    } catch (error) {
      console.error("Error updating call:", error);
      toast.error("Failed to update call");
    } finally {
      setIsUpdating(false);
    }
  };

  const loadRecording = async () => {
    if (recordingUrl) return; // Already loaded
    
    setIsLoadingRecording(true);
    try {
      const response = await fetch(`/api/calls/${call.id}/recording`);
      if (response.ok) {
        const data = await response.json();
        if (data.recordingUrl) {
          setRecordingUrl(data.recordingUrl);
        } else {
          toast.error("No recording available for this call");
        }
      } else {
        toast.error("Failed to load recording");
      }
    } catch (error) {
      console.error("Error loading recording:", error);
      toast.error("Failed to load recording");
    } finally {
      setIsLoadingRecording(false);
    }
  };

  const togglePlayback = () => {
    if (!audioRef.current) {
      if (recordingUrl) {
        const audio = new Audio(recordingUrl);
        audioRef.current = audio;
        audio.onended = () => setIsPlaying(false);
        audio.onpause = () => setIsPlaying(false);
        audio.play();
        setIsPlaying(true);
      }
    } else {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Call Details</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Lead Info */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">Lead Information</h4>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex items-center">
                  <User className="h-4 w-4 text-gray-400 mr-2" />
                  <span className="text-sm font-medium text-gray-900">
                    {call.leadName || "Unknown Lead"}
                  </span>
                </div>
                {call.leadAddress && (
                  <div className="flex items-center">
                    <MapPin className="h-4 w-4 text-gray-400 mr-2" />
                    <span className="text-sm text-gray-600">{call.leadAddress}</span>
                  </div>
                )}
                <div className="flex items-center">
                  <Phone className="h-4 w-4 text-gray-400 mr-2" />
                  <span className="text-sm text-gray-600">{call.phoneNumber}</span>
                </div>
              </div>
            </div>

            {/* Call Details */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">Call Details</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider">Status</label>
                  <p className="text-sm text-gray-900">{call.status}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider">Duration</label>
                  <p className="text-sm text-gray-900">
                    {call.duration ? `${Math.floor(call.duration / 60)}m ${call.duration % 60}s` : "0s"}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider">Initiated</label>
                  <p className="text-sm text-gray-900">
                    {new Date(call.initiatedAt).toLocaleString()}
                  </p>
                </div>
                {call.answeredAt && (
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider">Answered</label>
                    <p className="text-sm text-gray-900">
                      {new Date(call.answeredAt).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Recording */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">Call Recording</h4>
              {!recordingUrl && !isLoadingRecording && (
                <button
                  onClick={loadRecording}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                  <Play className="h-4 w-4" />
                  Load Recording
                </button>
              )}
              {isLoadingRecording && (
                <div className="flex items-center gap-2 text-gray-600">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <span className="text-sm">Loading recording...</span>
                </div>
              )}
              {recordingUrl && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={togglePlayback}
                      className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700"
                    >
                      {isPlaying ? (
                        <Pause className="h-5 w-5" />
                      ) : (
                        <Play className="h-5 w-5" />
                      )}
                    </button>
                    <a
                      href={recordingUrl}
                      download
                      className="p-2 bg-gray-200 text-gray-700 rounded-full hover:bg-gray-300"
                    >
                      <Download className="h-5 w-5" />
                    </a>
                    <span className="text-sm text-gray-600">Call Recording</span>
                  </div>
                  <audio ref={audioRef} src={recordingUrl} className="hidden" />
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Call Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about the call..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                rows={4}
              />
            </div>

            {/* Outcome */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Call Outcome
              </label>
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="">Select outcome...</option>
                <option value="interested">Interested</option>
                <option value="not_interested">Not Interested</option>
                <option value="callback_requested">Callback Requested</option>
                <option value="wrong_number">Wrong Number</option>
                <option value="do_not_call">Do Not Call</option>
              </select>
            </div>

            {/* Callback Date */}
            {outcome === "callback_requested" && (
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Callback Date
                </label>
                <input
                  type="date"
                  value={callbackDate}
                  onChange={(e) => setCallbackDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdate}
              disabled={isUpdating}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {isUpdating ? "Updating..." : "Update Call"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
