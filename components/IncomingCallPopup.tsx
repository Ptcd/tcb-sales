"use client";

import { useState, useEffect } from "react";
import { Phone, PhoneOff, User, MapPin, Clock, UserPlus } from "lucide-react";
import { useCall } from "./CallProvider";
import toast from "react-hot-toast";

interface LeadInfo {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  leadStatus?: string;
  assignedRepName?: string;
  lastContactedAt?: string;
  campaign?: {
    id: string;
    name: string;
  };
  lastCall?: {
    status: string;
    outcome?: string;
    initiatedAt: string;
    duration?: number;
  };
}

export function IncomingCallPopup() {
  const { incomingCall, incomingCallerId, answerCall, rejectCall } = useCall();
  const [leadInfo, setLeadInfo] = useState<LeadInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [ringAnimation, setRingAnimation] = useState(false);
  const [showCreateLead, setShowCreateLead] = useState(false);
  const [newLeadName, setNewLeadName] = useState("");
  const [isCreatingLead, setIsCreatingLead] = useState(false);

  useEffect(() => {
    if (incomingCall && incomingCallerId) {
      setIsLoading(true);
      setRingAnimation(true);
      
      // Lookup lead by phone number
      fetch(`/api/calls/lookup?phoneNumber=${encodeURIComponent(incomingCallerId)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.found && data.lead) {
            setLeadInfo(data.lead);
          }
          setIsLoading(false);
        })
        .catch((err) => {
          console.error("Error looking up lead:", err);
          setIsLoading(false);
        });
    } else {
      setLeadInfo(null);
      setRingAnimation(false);
    }
  }, [incomingCall, incomingCallerId]);

  const handleCreateLead = async () => {
    if (!newLeadName.trim() || !incomingCallerId) return;
    
    setIsCreatingLead(true);
    try {
      const response = await fetch("/api/leads/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newLeadName.trim(),
          phone: incomingCallerId,
          lead_source: "inbound_call",
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create lead");
      }
      
      const data = await response.json();
      toast.success("Lead created successfully!");
      
      // Set the new lead info
      setLeadInfo({
        id: data.lead.id,
        name: newLeadName.trim(),
        phone: incomingCallerId,
        leadStatus: "new",
      });
      setShowCreateLead(false);
      setNewLeadName("");
    } catch (err: any) {
      console.error("Error creating lead:", err);
      toast.error(err.message || "Failed to create lead");
    } finally {
      setIsCreatingLead(false);
    }
  };

  if (!incomingCall) return null;

  const formatPhoneNumber = (phone: string) => {
    // Format phone number for display
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
      <div className={`bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 transform transition-all ${ringAnimation ? 'animate-pulse' : ''}`}>
        {/* Header with ring animation */}
        <div className="bg-gradient-to-r from-green-500 to-green-600 p-6 rounded-t-2xl">
          <div className="flex items-center justify-center mb-4">
            <div className={`w-20 h-20 rounded-full bg-white/20 flex items-center justify-center ${ringAnimation ? 'animate-ping' : ''}`}>
              <Phone className="h-10 w-10 text-white" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white text-center">Incoming Call</h2>
        </div>

        {/* Caller Info */}
        <div className="p-6">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Looking up caller...</p>
            </div>
          ) : leadInfo ? (
            <div className="space-y-4">
              {/* Lead Name */}
              <div className="text-center">
                <h3 className="text-2xl font-bold text-gray-900">{leadInfo.name}</h3>
                <p className="text-lg text-gray-600 mt-1">{formatPhoneNumber(incomingCallerId || "")}</p>
              </div>

              {/* Lead Details */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                {leadInfo.address && (
                  <div className="flex items-center text-sm text-gray-700">
                    <MapPin className="h-4 w-4 mr-2 text-gray-400" />
                    <span className="truncate">{leadInfo.address}</span>
                  </div>
                )}
                
                {leadInfo.assignedRepName && (
                  <div className="flex items-center text-sm text-gray-700">
                    <User className="h-4 w-4 mr-2 text-gray-400" />
                    <span>Assigned to: {leadInfo.assignedRepName}</span>
                  </div>
                )}

                {leadInfo.campaign && (
                  <div className="flex items-center text-sm text-gray-700">
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                      {leadInfo.campaign.name}
                    </span>
                  </div>
                )}

                {leadInfo.lastCall && (
                  <div className="flex items-center text-sm text-gray-700 pt-2 border-t border-gray-200">
                    <Clock className="h-4 w-4 mr-2 text-gray-400" />
                    <span>Last call: {formatDate(leadInfo.lastCall.initiatedAt)}</span>
                    {leadInfo.lastCall.outcome && (
                      <span className="ml-2 px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-xs">
                        {leadInfo.lastCall.outcome}
                      </span>
                    )}
                  </div>
                )}

                {leadInfo.leadStatus && (
                  <div className="flex items-center text-sm text-gray-700">
                    <span className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs">
                      Status: {leadInfo.leadStatus}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <div className="text-2xl font-bold text-gray-900 mb-2">
                {formatPhoneNumber(incomingCallerId || "")}
              </div>
              <p className="text-gray-600 mb-4">Unknown caller</p>
              
              {showCreateLead ? (
                <div className="bg-gray-50 rounded-lg p-4 text-left">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Lead Name
                  </label>
                  <input
                    type="text"
                    value={newLeadName}
                    onChange={(e) => setNewLeadName(e.target.value)}
                    placeholder="Enter business or person name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    autoFocus
                  />
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => setShowCreateLead(false)}
                      className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateLead}
                      disabled={!newLeadName.trim() || isCreatingLead}
                      className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isCreatingLead ? "Creating..." : "Create Lead"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCreateLead(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition-colors"
                >
                  <UserPlus className="h-4 w-4" />
                  Create Lead
                </button>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4 mt-6">
            <button
              onClick={rejectCall}
              className="flex-1 px-6 py-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <PhoneOff className="h-5 w-5" />
              Decline
            </button>
            <button
              onClick={answerCall}
              className="flex-1 px-6 py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <Phone className="h-5 w-5" />
              Answer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

