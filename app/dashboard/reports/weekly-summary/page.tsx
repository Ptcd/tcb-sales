"use client";

import { useState, useEffect } from "react";
import {
  Calendar,
  Download,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { formatScoreBand, formatTrend } from "@/lib/utils/performanceMetrics";

interface WeeklySummary {
  userId: string;
  name: string;
  role: "SDR" | "Activator";
  hoursWorked: number;
  keyMetric: number;
  expectedMin: number;
  expectedMax: number;
  scoreBand: "green" | "yellow" | "orange" | "red";
  trend: "up" | "down" | "flat";
  note: string | null;
}

export default function WeeklySummaryPage() {
  const [summaries, setSummaries] = useState<WeeklySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [weekStart, setWeekStart] = useState<string>("");
  const [userRole, setUserRole] = useState<"admin" | "member" | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchUserRole();
    // Set default to current week
    const now = new Date();
    const weekStartDate = new Date(now);
    const dayOfWeek = weekStartDate.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    weekStartDate.setDate(weekStartDate.getDate() - daysFromMonday);
    weekStartDate.setHours(0, 0, 0, 0);
    setWeekStart(weekStartDate.toISOString().split("T")[0]);
  }, []);

  useEffect(() => {
    if (weekStart) {
      fetchSummaries();
    }
  }, [weekStart]);

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
      const params = new URLSearchParams({ weekStart });
      const response = await fetch(`/api/reports/weekly-summary?${params}`);
      if (!response.ok) throw new Error("Failed to fetch summaries");

      const data = await response.json();
      if (data.success) {
        setSummaries(data.summaries || []);
      }
    } catch (error) {
      console.error("Error fetching weekly summary:", error);
      toast.error("Failed to load weekly summary");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams({ weekStart });
      const response = await fetch(`/api/reports/weekly-summary/export?${params}`);
      if (!response.ok) throw new Error("Failed to export");

      const data = await response.json();
      if (data.success) {
        // Copy to clipboard
        await navigator.clipboard.writeText(data.markdown);
        toast.success("Markdown copied to clipboard!");
      }
    } catch (error) {
      console.error("Error exporting:", error);
      toast.error("Failed to export");
    }
  };

  const toggleRow = (userId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
    } else {
      newExpanded.add(userId);
    }
    setExpandedRows(newExpanded);
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

  return (
    <>
      <Toaster position="top-right" />
      <div className="p-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Weekly Summary</h1>
            <p className="text-sm text-gray-600 mt-1">
              Performance overview for quick decision-making
            </p>
          </div>
          {userRole === "admin" && (
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          )}
        </div>

        {/* Week Selector */}
        <div className="mb-6 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-500" />
            <label className="text-sm font-medium text-gray-700">Week Start:</label>
            <input
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        )}

        {/* Summary Table */}
        {!isLoading && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                    Role
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                    Hours
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                    Key Metric
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                    Expected
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                    Actual
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                    Band
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                    Trend
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                    Notes
                  </th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {summaries.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                      No performance data available for this week
                    </td>
                  </tr>
                ) : (
                  summaries.map((summary) => {
                    const scoreBandDisplay = formatScoreBand(summary.scoreBand);
                    const trendDisplay = formatTrend(summary.trend);
                    const isExpanded = expandedRows.has(summary.userId);

                    return (
                      <>
                        <tr
                          key={summary.userId}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => toggleRow(summary.userId)}
                        >
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {summary.name}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {summary.role}
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-gray-900">
                            {formatHours(summary.hoursWorked)}
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-gray-900">
                            {summary.keyMetric}
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-gray-600">
                            {summary.expectedMin} - {summary.expectedMax}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm font-semibold text-gray-900">
                              {summary.keyMetric}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-lg ${scoreBandDisplay.color}`}>
                              {scoreBandDisplay.emoji}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {trendDisplay.icon === "↑" && (
                              <TrendingUp className="h-4 w-4 text-green-600 mx-auto" />
                            )}
                            {trendDisplay.icon === "↓" && (
                              <TrendingDown className="h-4 w-4 text-red-600 mx-auto" />
                            )}
                            {trendDisplay.icon === "→" && (
                              <Minus className="h-4 w-4 text-gray-600 mx-auto" />
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {summary.note ? (
                              <span className="text-xs text-blue-600">Has note</span>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-gray-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-gray-400" />
                            )}
                          </td>
                        </tr>
                        {isExpanded && summary.note && (
                          <tr key={`${summary.userId}-expanded`}>
                            <td colSpan={10} className="px-4 py-3 bg-gray-50">
                              <div className="text-sm text-gray-700">
                                <strong>Note:</strong> {summary.note}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}


