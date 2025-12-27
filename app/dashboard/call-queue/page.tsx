"use client";

import { useState, useEffect } from "react";
import { Phone, User, MapPin, Mail, Globe, Star, ArrowRight, CheckCircle, XCircle, Clock } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import Button from "@/components/Button";
import { BusinessResult } from "@/lib/types";
import { CallOptionsModal } from "@/components/CallOptionsModal";

export default function CallQueuePage() {
  const [currentLead, setCurrentLead] = useState<BusinessResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [callOptionsOpen, setCallOptionsOpen] = useState(false);
  const [stats, setStats] = useState({
    callsToday: 0,
    connections: 0,
    conversions: 0,
  });

  useEffect(() => {
    fetchNextLead();
    fetchTodayStats();
  }, []);

  const fetchNextLead = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/leads/next");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch next lead");
      }

      if (data.lead) {
        // Transform to BusinessResult format
        const lead: BusinessResult = {
          id: data.lead.id,
          placeId: data.lead.place_id,
          name: data.lead.name,
          address: data.lead.address,
          phone: data.lead.phone,
          email: data.lead.email,
          website: data.lead.website,
          rating: data.lead.rating,
          reviewCount: data.lead.review_count,
          latitude: data.lead.latitude,
          longitude: data.lead.longitude,
          leadStatus: data.lead.lead_status,
          assignedTo: data.lead.assigned_to,
          lastContactedAt: data.lead.last_contacted_at,
        };
        setCurrentLead(lead);
      } else {
        setCurrentLead(null);
        toast(data.message || "No leads available");
      }
    } catch (error: any) {
      console.error("Error fetching next lead:", error);
      toast.error(error.message || "Failed to load next lead");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTodayStats = async () => {
    try {
      const response = await fetch("/api/calls/stats?period=today");
      const data = await response.json();
      if (response.ok && data.stats) {
        setStats({
          callsToday: data.stats.calls_today || 0,
          connections: data.stats.answered_calls || 0,
          conversions: 0, // Would need separate endpoint
        });
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const handleCallInitiated = () => {
    // Refresh stats and get next lead
    fetchTodayStats();
    setTimeout(() => {
      fetchNextLead();
    }, 1000);
  };

  const handleQuickDisposition = async (outcome: string) => {
    if (!currentLead) return;

    try {
      // Update lead status based on outcome
      let newStatus = currentLead.leadStatus;
      if (outcome === "interested" || outcome === "qualified") {
        newStatus = "interested";
      } else if (outcome === "not_interested") {
        newStatus = "not_interested";
      } else if (outcome === "callback_requested") {
        newStatus = "contacted";
      }

      const response = await fetch(`/api/leads/${currentLead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_status: newStatus,
          last_contacted_at: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update lead");
      }

      toast.success("Lead updated");
      fetchNextLead();
      fetchTodayStats();
    } catch (error: any) {
      console.error("Error updating lead:", error);
      toast.error(error.message || "Failed to update lead");
    }
  };

  if (isLoading && !currentLead) {
    return (
      <div className="flex justify-center items-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!currentLead) {
    return (
      <>
        <Toaster position="top-right" />
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-full mb-6 shadow-lg">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            All Caught Up!
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            You've processed all available leads. Check back later for new leads.
          </p>
          <Button onClick={fetchNextLead} leftIcon={<ArrowRight className="w-4 h-4" />}>
            Refresh
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <Toaster position="top-right" />
      <div className="space-y-6">
        {/* Today's Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Phone className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Calls Today</p>
                <p className="text-2xl font-bold text-gray-900">{stats.callsToday}</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Connections</p>
                <p className="text-2xl font-bold text-gray-900">{stats.connections}</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Star className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Conversions</p>
                <p className="text-2xl font-bold text-gray-900">{stats.conversions}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Next Lead Card */}
        <div className="bg-white rounded-lg border-2 border-blue-200 shadow-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Next Lead to Call</h2>
              <p className="text-sm text-gray-600 mt-1">
                {currentLead.leadStatus === "new" ? "New lead" : "Follow-up needed"}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={fetchNextLead}
              leftIcon={<ArrowRight className="w-4 h-4" />}
            >
              Skip
            </Button>
          </div>

          {/* Lead Details */}
          <div className="space-y-4 mb-6">
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">{currentLead.name}</h3>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <MapPin className="w-4 h-4" />
                {currentLead.address}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {currentLead.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-900">{currentLead.phone}</span>
                </div>
              )}
              {currentLead.email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-700">{currentLead.email}</span>
                </div>
              )}
              {currentLead.website && (
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-gray-400" />
                  <a
                    href={currentLead.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Visit Website
                  </a>
                </div>
              )}
              {currentLead.rating && (
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-yellow-400 fill-current" />
                  <span className="text-sm text-gray-700">
                    {currentLead.rating.toFixed(1)} ({currentLead.reviewCount || 0} reviews)
                  </span>
                </div>
              )}
            </div>

            {currentLead.lastContactedAt && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="w-4 h-4" />
                Last contacted: {new Date(currentLead.lastContactedAt).toLocaleDateString()}
              </div>
            )}
          </div>

          {/* Call Button */}
          <div className="flex gap-3">
            <Button
              size="lg"
              onClick={() => setCallOptionsOpen(true)}
              leftIcon={<Phone className="w-5 h-5" />}
              className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
            >
              Call Now
            </Button>
          </div>

          {/* Quick Disposition Buttons */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-xs font-medium text-gray-700 mb-2">Quick Actions:</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleQuickDisposition("interested")}
                className="px-3 py-1.5 text-xs font-medium bg-green-100 text-green-800 rounded-lg hover:bg-green-200 transition-colors"
              >
                Interested
              </button>
              <button
                onClick={() => handleQuickDisposition("not_interested")}
                className="px-3 py-1.5 text-xs font-medium bg-red-100 text-red-800 rounded-lg hover:bg-red-200 transition-colors"
              >
                Not Interested
              </button>
              <button
                onClick={() => handleQuickDisposition("callback_requested")}
                className="px-3 py-1.5 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 transition-colors"
              >
                Callback
              </button>
              <button
                onClick={() => handleQuickDisposition("no_answer")}
                className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 transition-colors"
              >
                No Answer
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Call Options Modal */}
      {callOptionsOpen && currentLead && currentLead.phone && (
        <CallOptionsModal
          leadId={currentLead.id}
          leadName={currentLead.name}
          leadPhone={currentLead.phone}
          onClose={() => setCallOptionsOpen(false)}
          onCallInitiated={handleCallInitiated}
        />
      )}
    </>
  );
}

