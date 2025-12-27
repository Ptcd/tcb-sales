"use client";

import { useState, useEffect } from "react";
import {
  Calendar,
  Clock,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  AlertTriangle,
  Timer,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { formatScoreBand, formatTrend } from "@/lib/utils/performanceMetrics";

interface ActivatorMetrics {
  hoursWorked: number;
  attendedAppointments: number;
  completedInstalls: number;
  completionRate: number;
  avgTimeToLiveHours: number;
  pctLeadWithin72h: number;
  stalledInstalls: number;
}

interface ActivatorScoring {
  expectedInstallsMin: number;
  expectedInstallsMax: number;
  scoreBand: "green" | "yellow" | "orange" | "red";
  trend: "up" | "down" | "flat";
}

export default function ActivatorPerformancePage() {
  const [metrics, setMetrics] = useState<ActivatorMetrics | null>(null);
  const [scoring, setScoring] = useState<ActivatorScoring | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  useEffect(() => {
    // Set default to current week
    const now = new Date();
    const weekStart = new Date(now);
    const dayOfWeek = weekStart.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    weekStart.setDate(weekStart.getDate() - daysFromMonday);
    weekStart.setHours(0, 0, 0, 0);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    setStartDate(weekStart.toISOString().split("T")[0]);
    setEndDate(weekEnd.toISOString().split("T")[0]);
  }, []);

  useEffect(() => {
    if (startDate && endDate) {
      fetchMetrics();
    }
  }, [startDate, endDate]);

  const fetchMetrics = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
      });

      const response = await fetch(`/api/reports/activator-performance?${params}`);
      if (!response.ok) throw new Error("Failed to fetch metrics");

      const data = await response.json();
      if (data.success) {
        setMetrics(data.metrics);
        setScoring(data.scoring);
      }
    } catch (error) {
      console.error("Error fetching Activator performance:", error);
      toast.error("Failed to load performance data");
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

  const formatTimeToLive = (hours: number): string => {
    if (hours === 0) return "—";
    if (hours < 24) {
      return `${Math.round(hours)}h`;
    }
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    if (remainingHours === 0) {
      return `${days}d`;
    }
    return `${days}d ${remainingHours}h`;
  };

  const scoreBandDisplay = scoring ? formatScoreBand(scoring.scoreBand) : null;
  const trendDisplay = scoring ? formatTrend(scoring.trend) : null;

  return (
    <>
      <Toaster position="top-right" />
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Activator Performance</h1>
          <p className="text-sm text-gray-600 mt-1">
            Measure install completion: calculators live with first lead
          </p>
        </div>

        {/* Date Range Selector */}
        <div className="mb-6 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-500" />
            <label className="text-sm font-medium text-gray-700">Start Date:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">End Date:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
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

        {/* Metrics Display */}
        {!isLoading && metrics && scoring && (
          <div className="space-y-6">
            {/* Primary KPI - Hero Section */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-8 border border-green-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-700 mb-2">
                    Primary KPI
                  </p>
                  <h2 className="text-5xl font-bold text-green-900 mb-2">
                    {metrics.completedInstalls}
                  </h2>
                  <p className="text-lg text-green-700">
                    Completed Installs
                  </p>
                  <p className="text-sm text-green-600 mt-1">
                    (First lead received = calculator live)
                  </p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-2xl ${scoreBandDisplay?.color || ""}`}>
                      {scoreBandDisplay?.emoji || "⚪"}
                    </span>
                    <span className={`text-lg font-semibold ${scoreBandDisplay?.color || ""}`}>
                      {scoreBandDisplay?.label || "Unknown"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-gray-600">
                    {trendDisplay?.icon === "↑" && <TrendingUp className="h-4 w-4 text-green-600" />}
                    {trendDisplay?.icon === "↓" && <TrendingDown className="h-4 w-4 text-red-600" />}
                    {trendDisplay?.icon === "→" && <Minus className="h-4 w-4 text-gray-600" />}
                    <span className="text-sm">{trendDisplay?.label || "No trend"}</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-green-200">
                <div className="flex items-center gap-4 text-sm text-green-700">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>Hours Worked: <strong>{formatHours(metrics.hoursWorked)}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>Expected Range: <strong>{scoring.expectedInstallsMin} - {scoring.expectedInstallsMax}</strong></span>
                  </div>
                </div>
              </div>
            </div>

            {/* Secondary Metrics - Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Attended Appointments */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center gap-2 text-gray-600 text-sm mb-2">
                  <Calendar className="h-4 w-4" />
                  <span>Attended</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {metrics.attendedAppointments}
                </p>
              </div>

              {/* Completion Rate */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center gap-2 text-gray-600 text-sm mb-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Completion Rate</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {metrics.completionRate.toFixed(1)}%
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {metrics.completedInstalls} / {metrics.attendedAppointments}
                </p>
              </div>

              {/* Avg Time to Live */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center gap-2 text-gray-600 text-sm mb-2">
                  <Timer className="h-4 w-4" />
                  <span>Avg Time to Live</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {formatTimeToLive(metrics.avgTimeToLiveHours)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Attended → First Lead
                </p>
              </div>

              {/* % Lead in 72h */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center gap-2 text-gray-600 text-sm mb-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Lead in 72h</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {metrics.pctLeadWithin72h.toFixed(1)}%
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Within 72 hours
                </p>
              </div>

              {/* Stalled Installs */}
              <div className={`rounded-lg border p-6 ${
                metrics.stalledInstalls > 0 
                  ? "bg-red-50 border-red-200" 
                  : "bg-white border-gray-200"
              }`}>
                <div className="flex items-center gap-2 text-gray-600 text-sm mb-2">
                  <AlertTriangle className={`h-4 w-4 ${
                    metrics.stalledInstalls > 0 ? "text-red-600" : "text-gray-500"
                  }`} />
                  <span>Stalled</span>
                </div>
                <p className={`text-3xl font-bold ${
                  metrics.stalledInstalls > 0 ? "text-red-600" : "text-gray-900"
                }`}>
                  {metrics.stalledInstalls}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  7+ days no lead
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !metrics && (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <CheckCircle2 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600">No performance data available</p>
            <p className="text-sm text-gray-400 mt-1">
              Select a date range to view metrics
            </p>
          </div>
        )}
      </div>
    </>
  );
}


