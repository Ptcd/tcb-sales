"use client";

import { useState, useEffect } from "react";
import {
  Calendar,
  Phone,
  MessageSquare,
  CheckCircle2,
  TrendingDown,
  Loader2,
  AlertCircle,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

interface FunnelData {
  dials: number;
  conversations: number;
  booked: number;
  attended: number;
  installed: number;
  firstLead: number;
}

interface ConversionRates {
  dialsToConversations: string;
  conversationsToBooked: string;
  bookedToAttended: string;
  attendedToInstalled: string;
  installedToFirstLead: string;
}

export default function FunnelPage() {
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [conversionRates, setConversionRates] = useState<ConversionRates | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

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
      fetchFunnel();
    }
  }, [startDate, endDate]);

  const fetchFunnel = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
      });

      const response = await fetch(`/api/reports/funnel?${params}`);
      
      if (response.status === 403) {
        setIsAuthorized(false);
        return;
      }
      
      if (!response.ok) throw new Error("Failed to fetch funnel");

      const data = await response.json();
      if (data.success) {
        setFunnel(data.funnel);
        setConversionRates(data.conversionRates);
        setIsAuthorized(true);
      }
    } catch (error) {
      console.error("Error fetching funnel:", error);
      toast.error("Failed to load funnel data");
    } finally {
      setIsLoading(false);
    }
  };

  const stages = [
    { key: "dials", label: "Dials", icon: Phone },
    { key: "conversations", label: "Conversations", icon: MessageSquare },
    { key: "booked", label: "Booked", icon: Calendar },
    { key: "attended", label: "Attended", icon: CheckCircle2 },
    { key: "installed", label: "Installed", icon: CheckCircle2 },
    { key: "firstLead", label: "First Lead", icon: CheckCircle2 },
  ];

  const getConversionRate = (fromKey: string, toKey: string): string => {
    if (!conversionRates || !funnel) return "0.0";
    
    const rateKey = `${fromKey}To${toKey.charAt(0).toUpperCase() + toKey.slice(1)}` as keyof ConversionRates;
    return conversionRates[rateKey] || "0.0";
  };

  return (
    <>
      <Toaster position="top-right" />
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Company Funnel</h1>
          <p className="text-sm text-gray-600 mt-1">
            Diagnostic view to identify where the system is breaking (Leadership only)
          </p>
        </div>

        {/* Unauthorized State */}
        {isAuthorized === false && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
            <p className="text-red-800 font-medium">Access Denied</p>
            <p className="text-sm text-red-600 mt-1">
              This view is only available to administrators.
            </p>
          </div>
        )}

        {/* Date Range Selector */}
        {isAuthorized !== false && (
          <>
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

            {/* Funnel Visualization */}
            {!isLoading && funnel && (
              <div className="space-y-4">
                {/* Horizontal Funnel */}
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="flex items-center justify-between gap-4 overflow-x-auto">
                    {stages.map((stage, index) => {
                      const Icon = stage.icon;
                      const value = funnel[stage.key as keyof FunnelData];
                      const prevStage = index > 0 ? stages[index - 1] : null;
                      const prevValue = prevStage ? funnel[prevStage.key as keyof FunnelData] : null;
                      const conversionRate = prevStage && prevValue && prevValue > 0
                        ? ((value / prevValue) * 100).toFixed(1)
                        : null;

                      return (
                        <div key={stage.key} className="flex-1 min-w-[120px]">
                          <div className="text-center">
                            <div className="flex items-center justify-center gap-2 mb-2">
                              <Icon className="h-5 w-5 text-gray-500" />
                              <h3 className="text-sm font-semibold text-gray-700">
                                {stage.label}
                              </h3>
                            </div>
                            <div className="bg-blue-50 rounded-lg p-4 mb-2">
                              <p className="text-3xl font-bold text-blue-900">{value}</p>
                            </div>
                            {conversionRate && (
                              <p className="text-xs text-gray-500">
                                {conversionRate}% from {prevStage?.label}
                              </p>
                            )}
                          </div>
                          {index < stages.length - 1 && (
                            <div className="flex items-center justify-center my-4">
                              <TrendingDown className="h-6 w-6 text-gray-400" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Conversion Rates Table */}
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Conversion Rates
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-700">Dials → Conversations</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {conversionRates?.dialsToConversations || "0.0"}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-700">Conversations → Booked</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {conversionRates?.conversationsToBooked || "0.0"}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-700">Booked → Attended</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {conversionRates?.bookedToAttended || "0.0"}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-700">Attended → Installed</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {conversionRates?.attendedToInstalled || "0.0"}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-sm text-gray-700">Installed → First Lead</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {conversionRates?.installedToFirstLead || "0.0"}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Note */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Note:</strong> This is a diagnostic view only. It does not attribute performance to individuals.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}


