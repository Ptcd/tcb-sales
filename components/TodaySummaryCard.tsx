"use client";

import { useState, useEffect } from "react";
import { Clock, Zap, CreditCard, TrendingUp, Loader2, Phone, MessageSquare } from "lucide-react";
import Link from "next/link";

interface DailySummary {
  paid_hours: number;
  active_hours: number;
  efficiency: number;
  total_dials: number;
  conversations: number;
  install_appointments_booked: number;
  install_appointments_attended: number;
  paid_signups_week_to_date: number;
}

export default function TodaySummaryCard() {
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTodaySummary();
  }, []);

  const fetchTodaySummary = async () => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const response = await fetch(`/api/reports/daily-summary?date=${today}`);
      if (!response.ok) {
        if (response.status === 404) {
          // No summary for today yet - that's okay
          setSummary(null);
        } else {
          throw new Error("Failed to fetch summary");
        }
      } else {
        const data = await response.json();
        setSummary(data.summary);
      }
    } catch (err: any) {
      console.error("Error fetching today's summary:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const formatHours = (hours: number): string => {
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

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <p className="text-center text-gray-500 py-4">Unable to load summary</p>
      </div>
    );
  }

  // Show placeholder if no summary yet
  if (!summary) {
    return (
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl shadow-sm border border-blue-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Today's Summary</h3>
          <span className="text-xs text-gray-500">
            {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          </span>
        </div>
        <div className="text-center py-6">
          <Clock className="h-10 w-10 text-blue-300 mx-auto mb-3" />
          <p className="text-gray-600">No activity recorded yet today</p>
          <p className="text-sm text-gray-400 mt-1">Start making calls to see your stats</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl shadow-sm border border-blue-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Today's Summary</h3>
        <Link
          href="/dashboard/reports"
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          View Reports →
        </Link>
      </div>

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Paid Hours */}
        <div className="bg-white/80 rounded-lg p-4 border border-blue-100">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-blue-600" />
            <span className="text-xs text-gray-600 uppercase tracking-wide">Tracked Time</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatHours(summary.paid_hours)}</p>
          <p className="text-xs text-gray-500 mt-1">Includes calls, emails & SMS</p>
        </div>

        {/* Install Appointments Attended */}
        <div className="bg-white/80 rounded-lg p-4 border border-blue-100">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-4 w-4 text-indigo-600" />
            <span className="text-xs text-gray-600 uppercase tracking-wide">Installs Attended</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{summary.install_appointments_attended || 0}</p>
        </div>

        {/* Install Appointments Booked */}
        <div className="bg-white/80 rounded-lg p-4 border border-blue-100">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="h-4 w-4 text-green-600" />
            <span className="text-xs text-gray-600 uppercase tracking-wide">Booked Today</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{summary.install_appointments_booked || 0}</p>
        </div>

        {/* Efficiency */}
        <div className="bg-white/80 rounded-lg p-4 border border-blue-100">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-amber-600" />
            <span className="text-xs text-gray-600 uppercase tracking-wide">Efficiency</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{Math.round(summary.efficiency)}%</p>
        </div>
      </div>

      {/* Secondary Stats */}
      <div className="flex items-center justify-between text-sm text-gray-600 pt-3 border-t border-blue-100">
        <div className="flex items-center gap-1">
          <Phone className="h-4 w-4" />
          <span>{summary.total_dials} dials</span>
        </div>
        <div className="flex items-center gap-1">
          <MessageSquare className="h-4 w-4" />
          <span>{summary.conversations} conversations</span>
        </div>
        <div>
          <span className="text-gray-400">Active:</span> {formatHours(summary.active_hours)}
        </div>
      </div>
    </div>
  );
}

