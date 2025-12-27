"use client";

import { useState, useEffect } from "react";
import { 
  Phone, MessageSquare, Rocket, Clock, Target, 
  TrendingUp, Zap, Timer, CheckCircle
} from "lucide-react";

interface KPIData {
  callsThisHour: number;
  callsToday: number;
  conversationsToday: number;
  ctaAttemptsToday: number;
  ctaAcceptedToday: number;
  trialsToday: number;
  trialsStartedToday: number;
  onboardingsScheduledToday: number;
  onboardingsAttendedToday: number;
  showRatePercent: number;
  trialsConfirmedToday: number;
  trialsConfirmedThisWeek: number;
  avgCallDuration: number;
  callsPerHour: number;
}

interface DialerKPIStripProps {
  sessionStartTime: Date;
}

export function DialerKPIStrip({ sessionStartTime }: DialerKPIStripProps) {
  const [kpis, setKpis] = useState<KPIData>({
    callsThisHour: 0,
    callsToday: 0,
    conversationsToday: 0,
    ctaAttemptsToday: 0,
    ctaAcceptedToday: 0,
    trialsToday: 0,
    trialsStartedToday: 0,
    onboardingsScheduledToday: 0,
    onboardingsAttendedToday: 0,
    showRatePercent: 0,
    trialsConfirmedToday: 0,
    trialsConfirmedThisWeek: 0,
    avgCallDuration: 0,
    callsPerHour: 0,
  });
  const [sessionDuration, setSessionDuration] = useState("00:00:00");
  const [isLoading, setIsLoading] = useState(true);

  // Fetch KPIs on mount and every 30 seconds
  useEffect(() => {
    const fetchKPIs = async () => {
      try {
        const response = await fetch("/api/reports/dialer-kpis");
        if (response.ok) {
          const data = await response.json();
          setKpis({
            callsThisHour: data.callsThisHour || 0,
            callsToday: data.callsToday || 0,
            conversationsToday: data.conversationsToday || 0,
            ctaAttemptsToday: data.ctaAttemptsToday || 0,
            ctaAcceptedToday: data.ctaAcceptedToday || 0,
            trialsToday: data.trialsToday || 0,
            trialsStartedToday: data.trialsStartedToday || 0,
            onboardingsScheduledToday: data.onboardingsScheduledToday || 0,
            onboardingsAttendedToday: data.onboardingsAttendedToday || 0,
            showRatePercent: data.showRatePercent || 0,
            trialsConfirmedToday: data.trialsConfirmedToday || 0,
            trialsConfirmedThisWeek: data.trialsConfirmedThisWeek || 0,
            avgCallDuration: data.avgCallDuration || 0,
            callsPerHour: data.callsPerHour || 0,
          });
        }
      } catch (error) {
        console.error("Error fetching KPIs:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchKPIs();
    const interval = setInterval(fetchKPIs, 30000);
    return () => clearInterval(interval);
  }, []);

  // Update session timer every second
  useEffect(() => {
    const updateSessionTimer = () => {
      const now = new Date();
      const diff = Math.floor((now.getTime() - sessionStartTime.getTime()) / 1000);
      const hours = Math.floor(diff / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      const seconds = diff % 60;
      setSessionDuration(
        `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
      );
    };

    updateSessionTimer();
    const interval = setInterval(updateSessionTimer, 1000);
    return () => clearInterval(interval);
  }, [sessionStartTime]);

  // Format duration in seconds to mm:ss
  const formatAvgDuration = (seconds: number): string => {
    if (!seconds || seconds === 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="bg-slate-800 border-b border-slate-700 px-6 py-3">
      <div className="flex items-center justify-between">
        {/* Session Timer */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 rounded-lg">
            <Timer className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-mono text-white">{sessionDuration}</span>
          </div>
          <span className="text-xs text-slate-500">Session</span>
        </div>

        {/* KPI Metrics */}
        <div className="flex items-center gap-6">
          {/* Calls This Hour */}
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-500/20 rounded">
              <Phone className="h-4 w-4 text-blue-400" />
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-white leading-tight">
                {kpis.callsThisHour}
              </div>
              <div className="text-xs text-slate-500">this hour</div>
            </div>
          </div>

          {/* Calls Today */}
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-500/20 rounded">
              <TrendingUp className="h-4 w-4 text-indigo-400" />
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-white leading-tight">
                {kpis.callsToday}
              </div>
              <div className="text-xs text-slate-500">calls today</div>
            </div>
          </div>

          {/* Conversations */}
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-green-500/20 rounded">
              <MessageSquare className="h-4 w-4 text-green-400" />
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-white leading-tight">
                {kpis.conversationsToday}
              </div>
              <div className="text-xs text-slate-500">conversations</div>
            </div>
          </div>

          {/* CTA Rate */}
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-purple-500/20 rounded">
              <Target className="h-4 w-4 text-purple-400" />
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-white leading-tight">
                {kpis.ctaAcceptedToday}
                <span className="text-xs text-slate-500 font-normal">/{kpis.ctaAttemptsToday}</span>
              </div>
              <div className="text-xs text-slate-500">CTA accepted</div>
            </div>
          </div>

          {/* Install Appointments Booked */}
          <div className="flex items-center gap-2" title="Install appointments you scheduled today">
            <div className="p-1.5 bg-amber-500/20 rounded">
              <Rocket className="h-4 w-4 text-amber-400" />
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-white leading-tight">
                {kpis.onboardingsScheduledToday || kpis.trialsStartedToday}
              </div>
              <div className="text-xs text-slate-500">installs booked</div>
            </div>
          </div>

          {/* Install Appointments Attended / Show Rate */}
          <div className="flex items-center gap-2" title="Install appointments that were attended">
            <div className="p-1.5 bg-green-500/20 rounded">
              <CheckCircle className="h-4 w-4 text-green-400" />
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-white leading-tight">
                {kpis.onboardingsAttendedToday || 0}
                {kpis.onboardingsScheduledToday > 0 && (
                  <span className="text-xs text-slate-500 font-normal ml-1">
                    ({kpis.showRatePercent > 0 ? kpis.showRatePercent.toFixed(0) : 0}%)
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500">installs attended</div>
            </div>
          </div>

          {/* Trials Activated Today */}
          <div 
            className={`flex items-center gap-2 ${kpis.trialsConfirmedToday > 0 ? 'animate-pulse' : ''}`} 
            title="Trials where customer completed signup and logged in TODAY"
          >
            <div className={`p-1.5 rounded ${kpis.trialsConfirmedToday > 0 ? 'bg-green-500/30 ring-2 ring-green-500/50' : 'bg-green-500/20'}`}>
              <CheckCircle className="h-4 w-4 text-green-400" />
            </div>
            <div className="text-right">
              <div className={`text-lg font-bold leading-tight ${kpis.trialsConfirmedToday > 0 ? 'text-green-400' : 'text-white'}`}>
                {kpis.trialsConfirmedToday}
              </div>
              <div className="text-xs text-slate-500">activated today</div>
            </div>
          </div>

          {/* Trials Activated This Week */}
          <div 
            className="flex items-center gap-2" 
            title="Activations this sales week (Friday 5PM PT - Friday 5PM PT)"
          >
            <div className={`p-1.5 rounded ${kpis.trialsConfirmedThisWeek >= 3 ? 'bg-emerald-500/30 ring-2 ring-emerald-500/50' : 'bg-emerald-500/20'}`}>
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="text-right">
              <div className={`text-lg font-bold leading-tight ${kpis.trialsConfirmedThisWeek >= 3 ? 'text-emerald-400' : 'text-white'}`}>
                {kpis.trialsConfirmedThisWeek}
              </div>
              <div className="text-xs text-slate-500">activated this week</div>
            </div>
          </div>

          {/* Avg Call Duration */}
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-cyan-500/20 rounded">
              <Clock className="h-4 w-4 text-cyan-400" />
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-white leading-tight">
                {formatAvgDuration(kpis.avgCallDuration)}
              </div>
              <div className="text-xs text-slate-500">avg duration</div>
            </div>
          </div>

          {/* Calls/Hour Rate */}
          <div className="flex items-center gap-2 pl-4 border-l border-slate-600">
            <div className="p-1.5 bg-emerald-500/20 rounded">
              <Zap className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-white leading-tight">
                {kpis.callsPerHour.toFixed(1)}
              </div>
              <div className="text-xs text-slate-500">calls/hr</div>
            </div>
          </div>
        </div>

        {/* Goal Progress Indicator */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-slate-500 mb-1">Hourly Goal</div>
            <div className="w-32 h-2 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (kpis.callsThisHour / 50) * 100)}%` }}
              />
            </div>
          </div>
          <span className="text-sm text-slate-400">
            {kpis.callsThisHour}/50
          </span>
        </div>
      </div>
    </div>
  );
}

