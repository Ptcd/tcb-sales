"use client";

import { useState, useEffect } from "react";
import { Calendar, Users, Rocket, TrendingUp, AlertTriangle, 
  Phone, Mail, Globe, MapPin, Clock, Loader2, RefreshCw } from "lucide-react";
import { BADGE_CONFIG } from "@/lib/badges";
import type { BadgeKey } from "@/lib/types";

interface Lead {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  badge_key?: BadgeKey;
  next_follow_up_at?: string;
}

type View = "followups" | "trials" | "converted" | "all-trials" | "stalled" | "by-sdr";

const SDR_TABS: { id: View; label: string; icon: React.ReactNode }[] = [
  { id: "followups", label: "Follow-Ups Due", icon: <Calendar className="h-4 w-4" /> },
  { id: "trials", label: "My Trials", icon: <Rocket className="h-4 w-4" /> },
  { id: "converted", label: "Converted (7d)", icon: <TrendingUp className="h-4 w-4" /> },
];

const ADMIN_TABS: { id: View; label: string; icon: React.ReactNode }[] = [
  { id: "all-trials", label: "All Trials", icon: <Rocket className="h-4 w-4" /> },
  { id: "stalled", label: "Stalled", icon: <AlertTriangle className="h-4 w-4" /> },
  { id: "by-sdr", label: "By SDR", icon: <Users className="h-4 w-4" /> },
];

export default function PipelinePage() {
  const [view, setView] = useState<View>("followups");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const fetchData = async (v: View) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pipeline?view=${v}`);
      const data = await res.json();
      if (data.success) {
        setLeads(data.leads || []);
        setIsAdmin(data.isAdmin || false);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(view); }, [view]);

  const fmtDate = (d?: string) => {
    if (!d) return "—";
    const diff = Math.floor((new Date(d).getTime() - Date.now()) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff < 0) return `${Math.abs(diff)}d overdue`;
    return new Date(d).toLocaleDateString();
  };

  const Badge = ({ k }: { k?: BadgeKey }) => {
    if (!k || !BADGE_CONFIG[k]) return null;
    const c = BADGE_CONFIG[k];
    return <span className={`px-2 py-0.5 rounded-full text-xs ${c.bg} ${c.color}`}>{c.label}</span>;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Pipeline</h1>
        <button onClick={() => fetchData(view)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
          <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        {SDR_TABS.map(t => (
          <button key={t.id} onClick={() => setView(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${view === t.id ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {isAdmin && (
        <div className="flex gap-2 mb-6">
          <span className="text-xs text-slate-500 self-center mr-2">Admin:</span>
          {ADMIN_TABS.map(t => (
            <button key={t.id} onClick={() => setView(t.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${view === t.id ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
      ) : leads.length === 0 ? (
        <div className="text-center py-12 text-slate-400">No leads in this view</div>
      ) : (
        <div className="bg-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-900/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Lead</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Badge</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Follow-Up</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Contact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {leads.map(l => (
                <tr key={l.id} className="hover:bg-slate-700/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{l.name}</div>
                    {l.address && <div className="text-xs text-slate-400 flex items-center gap-1"><MapPin className="h-3 w-3" />{l.address}</div>}
                  </td>
                  <td className="px-4 py-3"><Badge k={l.badge_key} /></td>
                  <td className="px-4 py-3"><div className="flex items-center gap-1 text-sm text-slate-300"><Clock className="h-3.5 w-3.5 text-slate-500" />{fmtDate(l.next_follow_up_at)}</div></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      {l.phone && <a href={`tel:${l.phone}`} className="text-slate-400 hover:text-blue-400"><Phone className="h-4 w-4" /></a>}
                      {l.email && <a href={`mailto:${l.email}`} className="text-slate-400 hover:text-blue-400"><Mail className="h-4 w-4" /></a>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
