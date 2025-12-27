"use client";

import { useState, useEffect } from "react";
import { Phone, Calendar, RefreshCw, Play, Pause, Filter, TrendingUp, Users, Target, DollarSign, Zap, Code, Download } from "lucide-react";
import toast from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import Input from "@/components/Input";
import Button from "@/components/Button";

interface SDRPerformance {
  id: string;
  name: string;
  email: string;
  dials: number;
  conversations: number;
  trials: number;
  activated: number;
  paid: number;
  mrr: number;
  activationRate: number | null;
  activatedWithin24h: number;
  hasEnoughTrials: boolean;
}

interface Summary {
  totalDials: number;
  totalConversations: number;
  totalTrials: number;
  totalActivated: number;
  totalPaid: number;
  totalMRR: number;
  activationRate: number | null;
  activationRatio: string;
  activatedWithin24h: number;
  activatedWithin24hRate: number | null;
}

interface InstallCall {
  id: string;
  date: string;
  sdrId: string;
  sdrName: string;
  leadId: string;
  leadName: string;
  leadPhone: string;
  duration: number;
  hasRecording: boolean;
  recordingUrl: string | null;
  qualityTag: string;
  campaignName: string;
  meetingId: string;
  meetingDate: string;
  meetingStatus: string;
}

interface Campaign {
  id: string;
  name: string;
}

function getActivationColor(rate: number | null): { bg: string; text: string; emoji: string } {
  if (rate === null) return { bg: "bg-gray-100", text: "text-gray-600", emoji: "" };
  if (rate < 25) return { bg: "bg-red-100", text: "text-red-700", emoji: "🔴" };
  if (rate < 45) return { bg: "bg-yellow-100", text: "text-yellow-700", emoji: "🟡" };
  if (rate < 65) return { bg: "bg-green-100", text: "text-green-700", emoji: "🟢" };
  return { bg: "bg-emerald-200", text: "text-emerald-800", emoji: "🟢🟢" };
}

interface WeeklyGoals {
  provenInstalls: number;
  provenInstallsGoal: number;
  sdrHours: number;
  sdrHoursGoal: number;
  weekStart: string;
  weekEnd: string;
}

export default function PerformanceDashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sdrs, setSdrs] = useState<SDRPerformance[]>([]);
  const [installCalls, setInstallCalls] = useState<InstallCall[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [weeklyGoals, setWeeklyGoals] = useState<WeeklyGoals | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingInstallCalls, setIsLoadingInstallCalls] = useState(false);
  
  // Filters
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("all");
  const [selectedSdrId, setSelectedSdrId] = useState<string>("all");
  const [selectedQualityTag, setSelectedQualityTag] = useState<string>("all");
  
  // Audio player state
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  useEffect(() => {
    fetchPerformanceData();
    fetchWeeklyGoals();
  }, [startDate, endDate, selectedCampaignId]);

  useEffect(() => {
    fetchWeeklyGoals();
  }, []);

  useEffect(() => {
    fetchInstallCalls();
  }, [startDate, endDate, selectedCampaignId, selectedSdrId, selectedQualityTag]);

  const fetchCampaigns = async () => {
    try {
      const response = await fetch("/api/campaigns");
      if (response.ok) {
        const data = await response.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (error) {
      console.error("Error fetching campaigns:", error);
    }
  };

  const fetchPerformanceData = async () => {
    setIsLoading(true);
    try {
      const campaignParam = selectedCampaignId !== "all" ? `&campaign_id=${selectedCampaignId}` : "";
      const response = await fetch(
        `/api/admin/sdr-performance?start_date=${startDate}&end_date=${endDate}${campaignParam}`
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to load performance data");
      }
      
      const data = await response.json();
      setSummary(data.summary);
      setSdrs(data.sdrs || []);
    } catch (error: any) {
      console.error("Error fetching performance data:", error);
      toast.error(error.message || "Failed to load performance data");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchWeeklyGoals = async () => {
    try {
      // Get current week (Monday to Sunday)
      const today = new Date();
      const dayOfWeek = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      const weekStart = monday.toISOString().split("T")[0];
      const weekEnd = sunday.toISOString().split("T")[0];

      // Fetch goals from all campaigns (or selected campaign)
      const campaignFilter = selectedCampaignId !== "all" ? selectedCampaignId : null;
      
      const response = await fetch("/api/governance/weekly-goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: weekStart,
          endDate: weekEnd,
          campaignId: campaignFilter,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setWeeklyGoals({
          provenInstalls: data.provenInstalls || 0,
          provenInstallsGoal: data.provenInstallsGoal || 4,
          sdrHours: data.sdrHours || 0,
          sdrHoursGoal: data.sdrHoursGoal || 40,
          weekStart: weekStart,
          weekEnd: weekEnd,
        });
      }
    } catch (error) {
      console.error("Error fetching weekly goals:", error);
    }
  };

  const fetchInstallCalls = async () => {
    setIsLoadingInstallCalls(true);
    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
      });
      
      if (selectedCampaignId !== "all") {
        params.append("campaign_id", selectedCampaignId);
      }
      
      if (selectedSdrId !== "all") {
        params.append("sdr_id", selectedSdrId);
      }
      
      if (selectedQualityTag !== "all") {
        params.append("quality_tag", selectedQualityTag);
      }
      
      const response = await fetch(`/api/admin/install-calls?${params.toString()}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to load install calls");
      }
      
      const data = await response.json();
      setInstallCalls(data.calls || []);
    } catch (error: any) {
      console.error("Error fetching install calls:", error);
      toast.error(error.message || "Failed to load install calls");
    } finally {
      setIsLoadingInstallCalls(false);
    }
  };

  const handlePlay = async (call: InstallCall) => {
    // Stop current audio if playing
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }

    if (playingId === call.id) {
      // Same recording - just stop
      setPlayingId(null);
      setAudioElement(null);
      return;
    }

    if (!call.hasRecording) {
      toast.error("No recording available for this call");
      return;
    }

    // Use proxy endpoint for authenticated playback
    try {
      const proxyUrl = `/api/calls/${call.id}/recording?stream=true`;
      const audio = new Audio(proxyUrl);
      audio.play();
      setPlayingId(call.id);
      setAudioElement(audio);

      audio.onended = () => {
        setPlayingId(null);
        setAudioElement(null);
      };

      audio.onpause = () => {
        setPlayingId(null);
        setAudioElement(null);
      };

      audio.onerror = () => {
        toast.error("Failed to play recording");
        setPlayingId(null);
        setAudioElement(null);
      };
    } catch (err) {
      console.error("Error playing recording:", err);
      toast.error("Failed to load recording");
    }
  };

  const handleDownload = async (call: InstallCall) => {
    if (!call.hasRecording) {
      toast.error("No recording available for this call");
      return;
    }

    try {
      // Fetch the MP3 file through proxy endpoint
      const proxyUrl = `/api/calls/${call.id}/recording?stream=true`;
      const audioResponse = await fetch(proxyUrl);
      
      if (!audioResponse.ok) {
        throw new Error("Failed to fetch recording");
      }

      const blob = await audioResponse.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      
      // Create filename: {leadName}-{date}.mp3
      const dateStr = formatDate(call.date).replace(/\s+/g, "-");
      const leadNameSafe = call.leadName.replace(/[^a-z0-9]/gi, "-").toLowerCase();
      a.download = `${leadNameSafe}-${dateStr}.mp3`;
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.success("Recording downloaded");
    } catch (err) {
      console.error("Error downloading recording:", err);
      toast.error("Failed to download recording");
    }
  };

  const handleQualityTagChange = async (callId: string, newTag: string) => {
    try {
      const response = await fetch(`/api/admin/trial-calls/${callId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qualityTag: newTag }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update quality tag");
      }

      // Update local state
      setInstallCalls(prev =>
        prev.map(call =>
          call.id === callId ? { ...call, qualityTag: newTag } : call
        )
      );
      
      toast.success("Quality tag updated");
    } catch (error: any) {
      console.error("Error updating quality tag:", error);
      toast.error(error.message || "Failed to update quality tag");
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getQualityTagColor = (tag: string) => {
    switch (tag) {
      case "strong":
        return "bg-green-100 text-green-800";
      case "average":
        return "bg-blue-100 text-blue-800";
      case "email_grab":
        return "bg-yellow-100 text-yellow-800";
      case "forced":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">SDR Performance</h2>
          <p className="text-sm text-gray-600 mt-1">
            Track SDR activity, trial pipeline, and call quality
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <select
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Campaigns</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-40"
            />
            <span className="text-gray-500">to</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-40"
            />
          </div>
          <Button onClick={fetchPerformanceData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Weekly Goals Progress Card */}
      {weeklyGoals && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Target className="h-5 w-5 text-blue-600" />
                Weekly Goals Progress
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                {new Date(weeklyGoals.weekStart).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}{" "}
                -{" "}
                {new Date(weeklyGoals.weekEnd).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Proven Installs */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  Proven Installs
                </span>
                <span className="text-sm font-bold text-gray-900">
                  {weeklyGoals.provenInstalls} / {weeklyGoals.provenInstallsGoal}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full ${
                    weeklyGoals.provenInstalls >= weeklyGoals.provenInstallsGoal
                      ? "bg-green-500"
                      : weeklyGoals.provenInstalls >=
                        weeklyGoals.provenInstallsGoal * 0.75
                      ? "bg-yellow-500"
                      : "bg-red-500"
                  }`}
                  style={{
                    width: `${
                      Math.min(
                        (weeklyGoals.provenInstalls /
                          weeklyGoals.provenInstallsGoal) *
                          100,
                        100
                      ) || 0
                    }%`,
                  }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {Math.round(
                  (weeklyGoals.provenInstalls /
                    weeklyGoals.provenInstallsGoal) *
                    100
                ) || 0}
                % of goal
              </p>
            </div>

            {/* SDR Hours */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  SDR Hours
                </span>
                <span className="text-sm font-bold text-gray-900">
                  {weeklyGoals.sdrHours.toFixed(1)} / {weeklyGoals.sdrHoursGoal}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full ${
                    weeklyGoals.sdrHours >= weeklyGoals.sdrHoursGoal
                      ? "bg-green-500"
                      : weeklyGoals.sdrHours >= weeklyGoals.sdrHoursGoal * 0.75
                      ? "bg-yellow-500"
                      : "bg-red-500"
                  }`}
                  style={{
                    width: `${
                      Math.min(
                        (weeklyGoals.sdrHours / weeklyGoals.sdrHoursGoal) * 100,
                        100
                      ) || 0
                    }%`,
                  }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {Math.round(
                  (weeklyGoals.sdrHours / weeklyGoals.sdrHoursGoal) * 100
                ) || 0}
                % of goal
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Phone className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Dials</p>
                  <p className="text-2xl font-bold text-gray-900">{summary.totalDials.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Users className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Conversations</p>
                  <p className="text-2xl font-bold text-gray-900">{summary.totalConversations.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <Target className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Trials</p>
                  <p className="text-2xl font-bold text-gray-900">{summary.totalTrials}</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Zap className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Activated</p>
                  <p className="text-2xl font-bold text-gray-900">{summary.totalActivated}</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <DollarSign className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Paid</p>
                  <p className="text-2xl font-bold text-gray-900">{summary.totalPaid}</p>
                  <p className="text-xs text-green-600 font-medium mt-1">
                    ${summary.totalMRR.toFixed(0)} MRR
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Activation Rate Card */}
          {summary && (
            <div className={`p-6 rounded-lg border shadow-sm ${getActivationColor(summary.activationRate).bg}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className={`text-3xl font-bold ${getActivationColor(summary.activationRate).text}`}>
                      {summary.activationRate !== null ? `${summary.activationRate}%` : "—"}
                    </h2>
                    <span className="text-2xl">{getActivationColor(summary.activationRate).emoji}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">Activation Rate</p>
                  <p className="text-xs text-gray-500 mt-2">
                    {summary.activationRatio} trials activated
                  </p>
                  {summary.activatedWithin24hRate !== null && (
                    <p className="text-xs text-gray-500">
                      {summary.activatedWithin24h} activated within 24h ({summary.activatedWithin24hRate}%)
                    </p>
                  )}
                </div>
                {summary.activationRate !== null && summary.activationRate < 25 && (
                  <div className="text-xs text-red-600 max-w-xs">
                    Low activation suggests trials may be low-intent. Review call quality.
                  </div>
                )}
              </div>
              {(summary.totalTrials || 0) < 5 && (
                <p className="text-xs text-gray-400 mt-3 italic">
                  Need at least 5 trials for meaningful rate (n={summary.totalTrials})
                </p>
              )}
            </div>
          )}

          {/* SDR Breakdown Table */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5" />
                SDR Performance
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {sdrs.length} SDR{sdrs.length !== 1 ? "s" : ""} with activity
              </p>
            </div>
            {sdrs.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600">No SDR activity found for this period</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">SDR</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase">Dials</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase">Convos</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase">
                        <Target className="inline h-3 w-3 mr-1" />
                        Trials
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase">
                        <Zap className="inline h-3 w-3 mr-1" />
                        Activated
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase">
                        <DollarSign className="inline h-3 w-3 mr-1" />
                        Paid
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase">MRR</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase">
                        Act. Rate
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {sdrs.map((sdr) => (
                      <tr key={sdr.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="text-sm font-medium text-gray-900">{sdr.name}</p>
                          <p className="text-xs text-gray-500">{sdr.email}</p>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-center text-sm text-gray-900">
                          {sdr.dials.toLocaleString()}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-center text-sm text-gray-900">
                          {sdr.conversations}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-center">
                          <span className="text-sm font-semibold text-indigo-600">{sdr.trials}</span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-center">
                          <span className="text-sm font-semibold text-yellow-600">{sdr.activated}</span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-center">
                          <span className="text-sm font-semibold text-green-600">{sdr.paid}</span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-center">
                          <span className="text-sm font-semibold text-green-700">
                            ${sdr.mrr.toFixed(0)}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-center">
                          {sdr.hasEnoughTrials ? (
                            <span className={`text-sm font-semibold px-2 py-1 rounded ${getActivationColor(sdr.activationRate).bg} ${getActivationColor(sdr.activationRate).text}`}>
                              {sdr.activationRate}%
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">n&lt;5</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Install Appointment Calls Section */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Phone className="w-5 h-5" />
                    Install Appointment Calls
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Listen to calls that resulted in scheduled installs and tag quality
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-gray-400" />
                  <select
                    value={selectedSdrId}
                    onChange={(e) => setSelectedSdrId(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All SDRs</option>
                    {sdrs.map((sdr) => (
                      <option key={sdr.id} value={sdr.id}>
                        {sdr.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={selectedQualityTag}
                    onChange={(e) => setSelectedQualityTag(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Quality</option>
                    <option value="strong">Strong</option>
                    <option value="average">Average</option>
                    <option value="email_grab">Email Grab</option>
                    <option value="forced">Forced</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
              </div>
            </div>
            {isLoadingInstallCalls ? (
              <div className="flex justify-center items-center py-12">
                <LoadingSpinner size="lg" />
              </div>
            ) : installCalls.length === 0 ? (
              <div className="text-center py-12">
                <Phone className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600">No install calls found for this period</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Call Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">SDR</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Lead</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase">Duration</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Install Date</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase">Recording</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Quality</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {installCalls.map((call) => (
                      <tr key={call.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {formatDate(call.date)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {call.sdrName}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{call.leadName}</div>
                          {call.leadPhone && (
                            <div className="text-xs text-gray-500">{call.leadPhone}</div>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-center text-sm text-gray-600">
                          {formatDuration(call.duration)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {call.meetingDate ? formatDate(call.meetingDate) : "—"}
                          <div className="text-xs text-gray-500 mt-1">
                            {call.meetingStatus}
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-center">
                          {call.hasRecording ? (
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handlePlay(call)}
                                className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                                title={playingId === call.id ? "Pause" : "Play"}
                              >
                                {playingId === call.id ? (
                                  <Pause className="h-4 w-4" />
                                ) : (
                                  <Play className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                onClick={() => handleDownload(call)}
                                className="p-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                                title="Download MP3"
                              >
                                <Download className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">No recording</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <select
                            value={call.qualityTag}
                            onChange={(e) => handleQualityTagChange(call.id, e.target.value)}
                            className={`px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${getQualityTagColor(call.qualityTag)}`}
                          >
                            <option value="unknown">Unknown</option>
                            <option value="strong">Strong</option>
                            <option value="average">Average</option>
                            <option value="email_grab">Email Grab</option>
                            <option value="forced">Forced</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-gray-500">
          No performance data available
        </div>
      )}
    </div>
  );
}


