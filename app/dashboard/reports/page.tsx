"use client";

import { useState, useEffect } from "react";
import { 
  Calendar, 
  Clock, 
  TrendingUp, 
  Phone, 
  MessageSquare, 
  Zap, 
  CreditCard, 
  Loader2,
  ChevronDown,
  ChevronUp,
  User,
  Users
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

interface DailySummary {
  id: string;
  sdr_user_id: string;
  date: string;
  paid_hours: number;
  active_hours: number;
  efficiency: number;
  total_dials: number;
  conversations: number;
  trials_started: number;
  paid_signups_week_to_date: number;
  created_at: string;
  // For admin view
  sdr_name?: string;
  sdr_email?: string;
}

interface WeeklySummary {
  id: string;
  sdr_user_id: string;
  week_start: string;
  week_end: string;
  paid_hours: number;
  active_hours: number;
  average_efficiency: number;
  total_dials: number;
  conversations: number;
  trials_started: number;
  paid_signups: number;
  created_at: string;
  // For admin view
  sdr_name?: string;
  sdr_email?: string;
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<"daily" | "weekly">("daily");
  const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([]);
  const [weeklySummaries, setWeeklySummaries] = useState<WeeklySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<"admin" | "member" | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchUserRole();
    fetchSummaries();
  }, [activeTab]);

  const fetchUserRole = async () => {
    try {
      const response = await fetch("/api/auth/profile");
      if (response.ok) {
        const data = await response.json();
        setUserRole(data.role || "member");
      }
    } catch (error) {
      console.error("Error fetching user role:", error);
    }
  };

  const fetchSummaries = async () => {
    setIsLoading(true);
    try {
      const endpoint = activeTab === "daily" 
        ? "/api/reports/summaries?type=daily" 
        : "/api/reports/summaries?type=weekly";
      
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error("Failed to fetch summaries");
      
      const data = await response.json();
      
      if (activeTab === "daily") {
        setDailySummaries(data.summaries || []);
      } else {
        setWeeklySummaries(data.summaries || []);
      }
    } catch (error) {
      console.error("Error fetching summaries:", error);
      toast.error("Failed to load reports");
    } finally {
      setIsLoading(false);
    }
  };

  const formatHours = (hours: number): string => {
    if (!hours || hours === 0) return "0h";
    if (hours < 1) {
      return `${Math.round(hours * 60)}m`;
    }
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (m === 0) {
      return `${h}h`;
    }
    return `${h}h ${m}m`;
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatDateRange = (start: string, end: string): string => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    return `${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  };

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  return (
    <>
      <Toaster position="top-right" />
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">SDR Reports</h1>
          <p className="text-sm text-gray-600 mt-1">
            View your daily and weekly performance summaries
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("daily")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === "daily"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Daily Reports
            </div>
          </button>
          <button
            onClick={() => setActiveTab("weekly")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === "weekly"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Weekly Reports
            </div>
          </button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        )}

        {/* Daily Reports */}
        {!isLoading && activeTab === "daily" && (
          <div className="space-y-4">
            {dailySummaries.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600">No daily reports yet</p>
                <p className="text-sm text-gray-400 mt-1">
                  Reports are generated at the end of each day
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {userRole === "admin" && (
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          SDR
                        </th>
                      )}
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                        Date
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                        Paid Hours
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                        Efficiency
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                        Dials
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                        Conversations
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                        Trials
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                        Paid (WTD)
                      </th>
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {dailySummaries.map((summary) => (
                      <>
                        <tr
                          key={summary.id}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => toggleRow(summary.id)}
                        >
                          {userRole === "admin" && (
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-gray-400" />
                                <span className="text-sm font-medium text-gray-900">
                                  {summary.sdr_name || summary.sdr_email || "Unknown"}
                                </span>
                              </div>
                            </td>
                          )}
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {formatDate(summary.date)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm font-semibold text-blue-600">
                              {formatHours(summary.paid_hours)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-sm font-semibold ${
                              summary.efficiency >= 50 ? "text-green-600" : 
                              summary.efficiency >= 30 ? "text-amber-600" : "text-red-600"
                            }`}>
                              {Math.round(summary.efficiency)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-gray-900">
                            {summary.total_dials}
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-gray-900">
                            {summary.conversations}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm font-semibold text-indigo-600">
                              {summary.trials_started}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm font-semibold text-green-600">
                              {summary.paid_signups_week_to_date}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {expandedRows.has(summary.id) ? (
                              <ChevronUp className="h-4 w-4 text-gray-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-gray-400" />
                            )}
                          </td>
                        </tr>
                        {expandedRows.has(summary.id) && (
                          <tr key={`${summary.id}-expanded`}>
                            <td colSpan={userRole === "admin" ? 9 : 8} className="px-4 py-4 bg-gray-50">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-white p-3 rounded-lg border border-gray-200">
                                  <div className="flex items-center gap-2 text-gray-600 text-xs mb-1">
                                    <Clock className="h-3 w-3" />
                                    Active Hours
                                  </div>
                                  <p className="text-lg font-semibold text-gray-900">
                                    {formatHours(summary.active_hours)}
                                  </p>
                                </div>
                                <div className="bg-white p-3 rounded-lg border border-gray-200">
                                  <div className="flex items-center gap-2 text-gray-600 text-xs mb-1">
                                    <Phone className="h-3 w-3" />
                                    Total Dials
                                  </div>
                                  <p className="text-lg font-semibold text-gray-900">
                                    {summary.total_dials}
                                  </p>
                                </div>
                                <div className="bg-white p-3 rounded-lg border border-gray-200">
                                  <div className="flex items-center gap-2 text-gray-600 text-xs mb-1">
                                    <MessageSquare className="h-3 w-3" />
                                    Conversations (30s+)
                                  </div>
                                  <p className="text-lg font-semibold text-gray-900">
                                    {summary.conversations}
                                  </p>
                                </div>
                                <div className="bg-white p-3 rounded-lg border border-gray-200">
                                  <div className="flex items-center gap-2 text-gray-600 text-xs mb-1">
                                    <Zap className="h-3 w-3" />
                                    JCC Trials
                                  </div>
                                  <p className="text-lg font-semibold text-indigo-600">
                                    {summary.trials_started}
                                  </p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Weekly Reports */}
        {!isLoading && activeTab === "weekly" && (
          <div className="space-y-4">
            {weeklySummaries.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                <TrendingUp className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600">No weekly reports yet</p>
                <p className="text-sm text-gray-400 mt-1">
                  Weekly reports are generated on Fridays
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {userRole === "admin" && (
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          SDR
                        </th>
                      )}
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                        Week
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                        Paid Hours
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                        Avg Efficiency
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                        Dials
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                        Conversations
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                        Trials
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                        Paid Signups
                      </th>
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {weeklySummaries.map((summary) => (
                      <>
                        <tr
                          key={summary.id}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => toggleRow(summary.id)}
                        >
                          {userRole === "admin" && (
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-gray-400" />
                                <span className="text-sm font-medium text-gray-900">
                                  {summary.sdr_name || summary.sdr_email || "Unknown"}
                                </span>
                              </div>
                            </td>
                          )}
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {formatDateRange(summary.week_start, summary.week_end)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm font-semibold text-blue-600">
                              {formatHours(summary.paid_hours)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-sm font-semibold ${
                              summary.average_efficiency >= 50 ? "text-green-600" : 
                              summary.average_efficiency >= 30 ? "text-amber-600" : "text-red-600"
                            }`}>
                              {Math.round(summary.average_efficiency)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-gray-900">
                            {summary.total_dials}
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-gray-900">
                            {summary.conversations}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm font-semibold text-indigo-600">
                              {summary.trials_started}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm font-semibold text-green-600">
                              {summary.paid_signups}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {expandedRows.has(summary.id) ? (
                              <ChevronUp className="h-4 w-4 text-gray-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-gray-400" />
                            )}
                          </td>
                        </tr>
                        {expandedRows.has(summary.id) && (
                          <tr key={`${summary.id}-expanded`}>
                            <td colSpan={userRole === "admin" ? 9 : 8} className="px-4 py-4 bg-gray-50">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-white p-3 rounded-lg border border-gray-200">
                                  <div className="flex items-center gap-2 text-gray-600 text-xs mb-1">
                                    <Clock className="h-3 w-3" />
                                    Active Hours
                                  </div>
                                  <p className="text-lg font-semibold text-gray-900">
                                    {formatHours(summary.active_hours)}
                                  </p>
                                </div>
                                <div className="bg-white p-3 rounded-lg border border-gray-200">
                                  <div className="flex items-center gap-2 text-gray-600 text-xs mb-1">
                                    <Phone className="h-3 w-3" />
                                    Total Dials
                                  </div>
                                  <p className="text-lg font-semibold text-gray-900">
                                    {summary.total_dials}
                                  </p>
                                </div>
                                <div className="bg-white p-3 rounded-lg border border-gray-200">
                                  <div className="flex items-center gap-2 text-gray-600 text-xs mb-1">
                                    <MessageSquare className="h-3 w-3" />
                                    Conversations
                                  </div>
                                  <p className="text-lg font-semibold text-gray-900">
                                    {summary.conversations}
                                  </p>
                                </div>
                                <div className="bg-white p-3 rounded-lg border border-gray-200">
                                  <div className="flex items-center gap-2 text-gray-600 text-xs mb-1">
                                    <CreditCard className="h-3 w-3" />
                                    JCC Paid Signups
                                  </div>
                                  <p className="text-lg font-semibold text-green-600">
                                    {summary.paid_signups}
                                  </p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

