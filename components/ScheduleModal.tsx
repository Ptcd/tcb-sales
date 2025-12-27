"use client";

import { useState, useEffect } from "react";
import { ALL_TIMEZONES, COMMON_TIMEZONES, localToUtc, formatInTimezone } from "@/lib/timezones";
import { X, Search, Globe, Clock, User } from "lucide-react";

interface ScheduleModalProps {
  onClose: () => void;
  onSave: (data: {
    scheduled_install_at: string;
    customer_timezone: string;
    technical_owner_name: string;
  }) => void;
  isSaving: boolean;
  initialTimezone?: string | null;
  initialTechOwner?: string | null;
}

export function ScheduleModal({
  onClose,
  onSave,
  isSaving,
  initialTimezone,
  initialTechOwner,
}: ScheduleModalProps) {
  const [step, setStep] = useState(1);
  const [timezone, setTimezone] = useState(initialTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [dateStr, setDateStr] = useState("");
  const [techOwner, setTechOwner] = useState(initialTechOwner || "");
  const [searchTz, setSearchTz] = useState("");

  const filteredTz = ALL_TIMEZONES.filter(tz => 
    tz.label.toLowerCase().includes(searchTz.toLowerCase()) || 
    tz.value.toLowerCase().includes(searchTz.toLowerCase())
  );

  const handleSave = () => {
    if (!dateStr || !timezone || !techOwner) return;
    
    const utcDate = localToUtc(dateStr, timezone);
    onSave({
      scheduled_install_at: utcDate,
      customer_timezone: timezone,
      technical_owner_name: techOwner,
    });
  };

  const getDualTimePreview = () => {
    if (!dateStr) return null;
    
    // dateStr is in customer timezone
    const [datePart, timePart] = dateStr.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);
    
    // This is the chosen time in customer TZ
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    };

    // To show "Your time", we need the UTC date first
    const utcStr = localToUtc(dateStr, timezone);
    const localTime = new Intl.DateTimeFormat('en-US', options).format(new Date(utcStr));
    
    // Customer time label
    const customerTime = formatInTimezone(new Date(utcStr), timezone, {
      ...options,
      timeZoneName: 'short',
    });

    return (
      <div className="mt-4 p-4 bg-slate-900 rounded-lg border border-slate-700 space-y-2">
        <div>
          <div className="text-xs text-slate-500 uppercase font-semibold">Customer Time</div>
          <div className="text-lg text-white font-bold">{customerTime}</div>
        </div>
        <div className="pt-2 border-t border-slate-800">
          <div className="text-xs text-slate-500 uppercase font-semibold">Your Local Time</div>
          <div className="text-sm text-slate-300">{localTime}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-slate-700">
        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-400" />
            Schedule Install
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Step 1: Timezone */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Globe className="h-4 w-4" />
              1. Customer Timezone
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search timezones..."
                value={searchTz}
                onChange={(e) => setSearchTz(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                style={{ backgroundColor: '#0f172a', color: '#ffffff' }}
              />
            </div>
            <div className="max-h-32 overflow-y-auto border border-slate-700 rounded-lg bg-slate-900 divide-y divide-slate-800">
              {filteredTz.map(tz => (
                <button
                  key={tz.value}
                  onClick={() => setTimezone(tz.value)}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-slate-800 transition-colors ${
                    timezone === tz.value ? "bg-blue-600/20 text-blue-400 font-bold" : "text-slate-300"
                  }`}
                >
                  {tz.label}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2 & 3: Date & Time */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              2. Date & Time (in {timezone})
            </label>
            <input
              type="datetime-local"
              value={dateStr}
              step="900" // 15-minute increments
              onChange={(e) => setDateStr(e.target.value)}
              className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none [color-scheme:dark]"
              style={{ backgroundColor: '#0f172a', color: '#ffffff', colorScheme: 'dark' }}
            />
            {getDualTimePreview()}
          </div>

          {/* Step 4: Who with? */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <User className="h-4 w-4" />
              3. Who is this meeting with?
            </label>
            <input
              type="text"
              placeholder="e.g. Mike (Web Guy), Owner, etc."
              value={techOwner}
              onChange={(e) => setTechOwner(e.target.value)}
              className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              style={{ backgroundColor: '#0f172a', color: '#ffffff' }}
            />
          </div>
        </div>

        <div className="p-4 bg-slate-900/50 border-t border-slate-700 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !dateStr || !timezone || !techOwner}
            className="flex-2 px-8 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20"
          >
            {isSaving ? "Scheduling..." : "Save Schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}

