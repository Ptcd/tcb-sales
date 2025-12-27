"use client";

import { useState, useEffect } from "react";
import { UserPlus, Filter, Loader2, MapPin, User } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import DataTable from "@/components/DataTable";
import { BusinessResult } from "@/lib/types";
import AddLeadModal from "@/components/AddLeadModal";

export default function AllLeadsPage() {
  const [leads, setLeads] = useState<BusinessResult[]>([]);
  const [allLeads, setAllLeads] = useState<BusinessResult[]>([]); // For stat counts
  const [isLoading, setIsLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [dueTodayFilter, setDueTodayFilter] = useState<boolean>(false);
  const [upcomingFilter, setUpcomingFilter] = useState<boolean>(false);
  const [myTrialsFilter, setMyTrialsFilter] = useState(false);
  const [dueTodayCount, setDueTodayCount] = useState<number>(0);
  const [upcomingCount, setUpcomingCount] = useState<number>(0);
  const [myTrialsCount, setMyTrialsCount] = useState<number>(0);
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);

  useEffect(() => {
    fetchLeads();
    fetchAllLeadsForStats();
  }, [sourceFilter, statusFilter, dueTodayFilter, upcomingFilter, myTrialsFilter]);

  const fetchLeads = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (sourceFilter !== "all") params.append("source", sourceFilter);
      if (statusFilter) params.append("status", statusFilter);
      if (dueTodayFilter) {
        params.append("due_today", "true");
      } else if (upcomingFilter) {
        params.append("due_within_days", "2"); // upcoming window
      }
      if (myTrialsFilter) {
        params.append("my_trials", "true");
      }
      params.append("tzOffset", `${new Date().getTimezoneOffset()}`);

      const response = await fetch(`/api/leads?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch leads");
      }

      // Transform to BusinessResult format
      const businessResults: BusinessResult[] = (data.leads || []).map((lead: any) => ({
        id: lead.id,
        placeId: lead.place_id,
        name: lead.name,
        address: lead.address,
        phone: lead.phone || undefined,
        email: lead.email || undefined,
        website: lead.website || undefined,
        rating: lead.rating || undefined,
        reviewCount: lead.review_count || undefined,
        latitude: lead.latitude || undefined,
        longitude: lead.longitude || undefined,
        leadStatus: lead.lead_status || "new",
        assignedTo: lead.assigned_to || undefined,
        lastContactedAt: lead.last_call_made_at || lead.last_contacted_at || undefined,
        updatedAt: lead.updated_at || undefined,
        nextActionAt: lead.next_action_at || undefined,
        nextActionNote: lead.next_action_note || undefined,
        badgeKey: lead.badge_key || undefined,
        trialPipeline: lead.trial_pipeline ? {
          trialStartedAt: lead.trial_pipeline.trial_started_at || undefined,
          trialEndsAt: lead.trial_pipeline.trial_ends_at || undefined,
          convertedAt: lead.trial_pipeline.converted_at || undefined,
          plan: lead.trial_pipeline.plan || undefined,
          mrr: lead.trial_pipeline.mrr || undefined,
          bonusState: lead.trial_pipeline.bonus_state || undefined,
          lastEventAt: lead.trial_pipeline.last_event_at || undefined,
        } : null,
      }));

      setLeads(businessResults);
      setDueTodayCount(data.dueTodayCount || 0);
      setUpcomingCount(data.upcomingCount || 0);
      setMyTrialsCount(data.myTrialsCount || 0);
    } catch (error: any) {
      console.error("Error fetching leads:", error);
      toast.error(error.message || "Failed to load leads");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAllLeadsForStats = async () => {
    try {
      // Fetch ALL leads (no filters) for stats
      const response = await fetch("/api/leads");
      const data = await response.json();

      if (response.ok) {
        const businessResults: BusinessResult[] = (data.leads || []).map((lead: any) => ({
          id: lead.id,
          placeId: lead.place_id,
          name: lead.name,
          address: lead.address,
          phone: lead.phone || undefined,
          email: lead.email || undefined,
          website: lead.website || undefined,
          rating: lead.rating || undefined,
          reviewCount: lead.review_count || undefined,
          latitude: lead.latitude || undefined,
          longitude: lead.longitude || undefined,
          leadStatus: lead.lead_status || "new",
          assignedTo: lead.assigned_to || undefined,
          lastContactedAt: lead.last_call_made_at || lead.last_contacted_at || undefined,
          updatedAt: lead.updated_at || undefined,
          nextActionAt: lead.next_action_at || undefined,
          nextActionNote: lead.next_action_note || undefined,
        }));
        setAllLeads(businessResults);
      }
    } catch (error) {
      console.error("Error fetching all leads for stats:", error);
    }
  };

  const handleLeadAdded = () => {
    toast.success("Lead added successfully!");
    fetchLeads(); // Refresh the list
    fetchAllLeadsForStats(); // Refresh stats
  };

  return (
    <>
      <Toaster position="top-right" />
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">All Leads</h1>
              <p className="text-sm text-gray-600 mt-1">
                View and manage all your leads from Google Maps searches and manual entries
              </p>
            </div>
            <button
              onClick={() => setShowAddLeadModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200"
            >
              <UserPlus className="h-5 w-5" />
              Add Lead Manually
            </button>
          </div>

          {/* Filters */}
          <div className="flex gap-4 flex-wrap items-center">
            {/* Source Filter */}
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-gray-500" />
              <label className="text-sm font-medium text-gray-700">Source:</label>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              >
                <option value="all">All Sources</option>
                <option value="google_maps">Google Maps</option>
                <option value="manual">Manual Entry</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              >
                <option value="">All Statuses</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="interested">Interested</option>
                <option value="converted">Converted</option>
                <option value="not_interested">Not Interested</option>
              </select>
            </div>

            {/* Due Today Toggle */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Follow-ups due today:</label>
              <button
                onClick={() => {
                  setDueTodayFilter(!dueTodayFilter);
                  if (!dueTodayFilter) setUpcomingFilter(false); // make mutually exclusive
                }}
                className={`px-3 py-2 text-sm font-medium rounded-lg border transition ${
                  dueTodayFilter
                    ? "border-amber-500 bg-amber-50 text-amber-700"
                    : "border-gray-300 text-gray-700 hover:border-amber-400"
                }`}
              >
                {dueTodayFilter ? "Showing Due Today" : "Show Due Today"} {dueTodayCount ? `(${dueTodayCount})` : ""}
              </button>
            </div>

            {/* Upcoming Toggle */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Upcoming (next 2 days):</label>
              <button
                onClick={() => {
                  setUpcomingFilter(!upcomingFilter);
                  if (!upcomingFilter) setDueTodayFilter(false); // mutually exclusive
                }}
                className={`px-3 py-2 text-sm font-medium rounded-lg border transition ${
                  upcomingFilter
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300 text-gray-700 hover:border-blue-400"
                }`}
              >
                {upcomingFilter ? "Showing Upcoming" : "Show Upcoming"}{" "}
                {upcomingCount ? `(${upcomingCount})` : ""}
              </button>
            </div>

            {/* My Trials Button */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">My Trials:</label>
              <button
                onClick={() => {
                  setMyTrialsFilter(!myTrialsFilter);
                  if (!myTrialsFilter) {
                    setDueTodayFilter(false);
                    setUpcomingFilter(false);
                  }
                }}
                className={`px-3 py-2 text-sm font-medium rounded-lg border transition ${
                  myTrialsFilter
                    ? "border-purple-500 bg-purple-50 text-purple-700"
                    : "border-gray-300 text-gray-700 hover:border-purple-400"
                }`}
              >
                {myTrialsFilter ? "Showing My Trials" : "My Trials"}
                {myTrialsCount > 0 && ` (${myTrialsCount})`}
              </button>
            </div>
          </div>
        </div>

        {/* Stats - Clickable Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Total Leads */}
          <button
            onClick={() => setSourceFilter("all")}
            className={`bg-white p-4 rounded-lg border-2 transition-all hover:shadow-md ${
              sourceFilter === "all"
                ? "border-blue-500 ring-2 ring-blue-200 shadow-md"
                : "border-gray-200 hover:border-blue-300"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <User className="h-5 w-5 text-blue-600" />
              </div>
              <div className="text-left">
                <p className="text-sm text-gray-600">Total Leads</p>
                <p className="text-2xl font-bold text-gray-900">{allLeads.length}</p>
              </div>
            </div>
          </button>

          {/* From Google Maps */}
          <button
            onClick={() => setSourceFilter("google_maps")}
            className={`bg-white p-4 rounded-lg border-2 transition-all hover:shadow-md ${
              sourceFilter === "google_maps"
                ? "border-green-500 ring-2 ring-green-200 shadow-md"
                : "border-gray-200 hover:border-green-300"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <MapPin className="h-5 w-5 text-green-600" />
              </div>
              <div className="text-left">
                <p className="text-sm text-gray-600">From Google Maps</p>
                <p className="text-2xl font-bold text-gray-900">
                  {allLeads.filter(l => !l.placeId?.startsWith("manual_")).length}
                </p>
              </div>
            </div>
          </button>

          {/* Manual Entry */}
          <button
            onClick={() => setSourceFilter("manual")}
            className={`bg-white p-4 rounded-lg border-2 transition-all hover:shadow-md ${
              sourceFilter === "manual"
                ? "border-purple-500 ring-2 ring-purple-200 shadow-md"
                : "border-gray-200 hover:border-purple-300"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <UserPlus className="h-5 w-5 text-purple-600" />
              </div>
              <div className="text-left">
                <p className="text-sm text-gray-600">Manual Entry</p>
                <p className="text-2xl font-bold text-gray-900">
                  {allLeads.filter(l => l.placeId?.startsWith("manual_")).length}
                </p>
              </div>
            </div>
          </button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && leads.length === 0 && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-full mb-6 shadow-lg">
              <User className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No Leads Yet
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Start by searching Google Maps or adding leads manually
            </p>
            <button
              onClick={() => setShowAddLeadModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <UserPlus className="h-4 w-4" />
              Add Your First Lead
            </button>
          </div>
        )}

        {/* Leads Table */}
        {!isLoading && leads.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <DataTable data={leads} isTrialsView={myTrialsFilter} />
          </div>
        )}
      </div>

      {/* Add Lead Modal */}
      <AddLeadModal
        isOpen={showAddLeadModal}
        onClose={() => setShowAddLeadModal(false)}
        onLeadAdded={handleLeadAdded}
      />
    </>
  );
}

