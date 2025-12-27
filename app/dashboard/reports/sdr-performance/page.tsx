"use client";

import { useState, useEffect } from "react";
import {
  Calendar,
  Clock,
  Phone,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { formatScoreBand, formatTrend } from "@/lib/utils/performanceMetrics";

interface SDRMetrics {
  hoursWorked: number;
  installAppointmentsAttended: number;
  installAppointmentsBooked: number;
  showRate: number;
  conversations: number;
  dials: number;
}

interface SDRScoring {
  expectedAttendedMin: number;
  expectedAttendedMax: number;
  scoreBand: "green" | "yellow" | "orange" | "red";
  trend: "up" | "down" | "flat";
}

export default function SDRPerformancePage() {
  const [metrics, setMetrics] = useState<SDRMetrics | null>(null);
  const [scoring, setScoring] = useState<SDRScoring | null>(null);
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

      const response = await fetch(`/api/reports/sdr-performance?${params}`);
      if (!response.ok) throw new Error("Failed to fetch metrics");

      const data = await response.json();
      if (data.success) {
        setMetrics(data.metrics);
        setScoring(data.scoring);
      }
    } catch (error) {
      console.error("Error fetching SDR performance:", error);
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

  const scoreBandDisplay = scoring ? formatScoreBand(scoring.scoreBand) : null;
  const trendDisplay = scoring ? formatTrend(scoring.trend) : null;

  return (
    <>
      <Toaster position="top-right" />
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">SDR Performance</h1>
          <p className="text-sm text-gray-600 mt-1">
            Measure what you control: install appointments attended
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
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-8 border border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-700 mb-2">
                    Primary KPI
                  </p>
                  <h2 className="text-5xl font-bold text-blue-900 mb-2">
                    {metrics.installAppointmentsAttended}
                  </h2>
                  <p className="text-lg text-blue-700">
                    Install Appointments Attended
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
              <div className="mt-4 pt-4 border-t border-blue-200">
                <div className="flex items-center gap-4 text-sm text-blue-700">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>Hours Worked: <strong>{formatHours(metrics.hoursWorked)}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>Expected Range: <strong>{scoring.expectedAttendedMin} - {scoring.expectedAttendedMax}</strong></span>
                  </div>
                </div>
              </div>
            </div>

            {/* Secondary Metrics - Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Appointments Booked */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center gap-2 text-gray-600 text-sm mb-2">
                  <Calendar className="h-4 w-4" />
                  <span>Appointments Booked</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {metrics.installAppointmentsBooked}
                </p>
              </div>

              {/* Show Rate */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center gap-2 text-gray-600 text-sm mb-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Show Rate</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {metrics.showRate.toFixed(1)}%
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {metrics.installAppointmentsAttended} / {metrics.installAppointmentsBooked}
                </p>
              </div>

              {/* Conversations */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center gap-2 text-gray-600 text-sm mb-2">
                  <MessageSquare className="h-4 w-4" />
                  <span>Conversations</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {metrics.conversations}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Calls ≥ 30 seconds
                </p>
              </div>

              {/* Dials */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center gap-2 text-gray-600 text-sm mb-2">
                  <Phone className="h-4 w-4" />
                  <span>Dials</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {metrics.dials}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Context only
                </p>
              </div>
            </div>

            {/* Removed Metrics Notice */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> Trials, Installs, Paid, and Revenue metrics are not shown here as they are downstream outcomes not fully controlled by SDRs.
              </p>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !metrics && (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
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


