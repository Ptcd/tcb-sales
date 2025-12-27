"use client";

import { useState, useEffect } from "react";
import { X, Settings, Clock, Calendar, CheckCircle2, AlertCircle, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { ActivatorAvailabilitySettings as SettingsType } from "@/lib/types";
import { COMMON_TIMEZONES } from "@/lib/timezones";

interface ActivatorAvailabilitySettingsProps {
  onClose: () => void;
}

const DAYS = [
  { value: 0, label: "Sunday", short: "Sun" },
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
];

export function ActivatorAvailabilitySettings({ onClose }: ActivatorAvailabilitySettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [previewSlots, setPreviewSlots] = useState<any[]>([]);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/activator/availability");
      const data = await res.json();
      if (data.success) {
        setSettings(data.settings);
        fetchPreviewSlots(data.settings);
      } else {
        toast.error("Failed to load settings");
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const fetchPreviewSlots = async (currentSettings: SettingsType) => {
    try {
      const today = new Date();
      const endDate = new Date(today);
      endDate.setDate(today.getDate() + 7);
      
      const res = await fetch(
        `/api/activator-availability/slots?startDate=${today.toISOString().split("T")[0]}&endDate=${endDate.toISOString().split("T")[0]}&timezone=America/New_York`
      );
      const data = await res.json();
      if (data.success) {
        setPreviewSlots(data.slots.slice(0, 5));
      }
    } catch (error) {
      console.error("Error fetching preview slots:", error);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    // Validate all active working hours - ensure none cross midnight
    const invalidDays = settings.workingHours
      .filter(wh => wh.isActive)
      .filter(wh => {
        if (!wh.startTime || !wh.endTime) return true; // Missing times are invalid
        const [startHour, startMin] = wh.startTime.split(":").map(Number);
        const [endHour, endMin] = wh.endTime.split(":").map(Number);
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;
        return endMinutes <= startMinutes; // Invalid if end <= start
      });

    if (invalidDays.length > 0) {
      const dayNames = invalidDays.map(wh => {
        const day = DAYS.find(d => d.value === wh.dayOfWeek);
        return day?.label || `Day ${wh.dayOfWeek}`;
      }).join(", ");
      toast.error(`Invalid availability windows on ${dayNames}. End time must be after start time on the same day.`, { duration: 5000 });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/activator/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      const data = await res.json();
      if (data.success) {
        toast.success("Settings saved!", { duration: 2000 });
        fetchPreviewSlots(settings);
        onClose(); // Close the modal after successful save
      } else {
        toast.error("Failed to save settings");
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  // Add a new shift for a day
  const addShift = (dayOfWeek: number) => {
    if (!settings) return;
    const updated = { ...settings };
    updated.workingHours.push({
      dayOfWeek,
      startTime: "09:00",
      endTime: "17:00",
      isActive: true,
    });
    setSettings(updated);
  };

  // Remove a shift by index
  const removeShift = (index: number) => {
    if (!settings) return;
    const updated = { ...settings };
    updated.workingHours.splice(index, 1);
    setSettings(updated);
  };

  // Update a specific shift
  const updateShift = (index: number, field: string, value: any) => {
    if (!settings) return;
    const updated = { ...settings };
    const shift = updated.workingHours[index];
    
    if (!shift) return;
    
    const newShift = {
      ...shift,
      [field]: value,
    };
    
    // Validate: prevent midnight-crossing availability windows
    if (field === "startTime" || field === "endTime") {
      const startTime = field === "startTime" ? value : shift.startTime;
      const endTime = field === "endTime" ? value : shift.endTime;
      
      if (startTime && endTime) {
        const [startHour, startMin] = startTime.split(":").map(Number);
        const [endHour, endMin] = endTime.split(":").map(Number);
        
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;
        
        // Check if end time is before start time (crosses midnight)
        if (endMinutes <= startMinutes) {
          toast.error("Availability windows cannot cross midnight. Please set end time after start time on the same day.", { duration: 4000 });
          return; // Don't update if invalid
        }
      }
    }
    
    updated.workingHours[index] = newShift;
    setSettings(updated);
  };

  // Get all shifts for a specific day
  const getShiftsForDay = (dayOfWeek: number) => {
    if (!settings) return [];
    return settings.workingHours
      .map((wh, index) => ({ ...wh, index }))
      .filter(wh => wh.dayOfWeek === dayOfWeek)
      .sort((a, b) => {
        // Sort by start time
        const [aHour, aMin] = a.startTime.split(":").map(Number);
        const [bHour, bMin] = b.startTime.split(":").map(Number);
        return (aHour * 60 + aMin) - (bHour * 60 + bMin);
      });
  };

  // Format time from 24hr to 12hr format
  const formatTime12 = (time: string): string => {
    if (!time) return "--:--";
    const [hours, minutes] = time.split(":").map(Number);
    const ampm = hours >= 12 ? "PM" : "AM";
    const hour12 = hours % 12 || 12;
    return `${hour12}:${String(minutes).padStart(2, "0")} ${ampm}`;
  };

  // Convert a time from user's timezone to US Eastern, given source day of week
  const convertToEastern = (time: string, sourceDayOfWeek: number, fromTimezone: string): { time: string; dayName: string } => {
    if (!time || !fromTimezone) return { time: "--:--", dayName: "---" };
    
    try {
      const [hours, minutes] = time.split(":").map(Number);
      
      // Use a fixed reference date: Jan 14, 2024 is a Sunday (day 0)
      const year = 2024, month = 1, day = 14 + sourceDayOfWeek;
      
      // Create a date string representing the user's local time
      const localDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
      
      // Start with a guess: treat the input as if it were UTC
      const guessUTC = new Date(`${localDateStr}Z`);
      
      // Format our guess in the SOURCE timezone to see what local time it represents
      const sourceFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: fromTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      
      const parts = sourceFormatter.formatToParts(guessUTC);
      const formatted = {
        year: parseInt(parts.find(p => p.type === 'year')?.value || '0'),
        month: parseInt(parts.find(p => p.type === 'month')?.value || '0'),
        day: parseInt(parts.find(p => p.type === 'day')?.value || '0'),
        hour: parseInt(parts.find(p => p.type === 'hour')?.value || '0'),
        minute: parseInt(parts.find(p => p.type === 'minute')?.value || '0'),
      };
      
      // Calculate difference between what user wanted and what we got
      const wantedMs = Date.UTC(year, month - 1, day, hours, minutes, 0);
      const gotMs = Date.UTC(formatted.year, formatted.month - 1, formatted.day, formatted.hour, formatted.minute, 0);
      const offsetMs = wantedMs - gotMs;
      
      // Adjust by the offset to get the CORRECT UTC time
      const correctUTC = new Date(guessUTC.getTime() + offsetMs);
      
      // Now format the correct UTC time in Eastern timezone
      const easternFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      
      const easternDayFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
      });
      
      const easternTime = easternFormatter.format(correctUTC);
      const easternDay = easternDayFormatter.format(correctUTC);
      
      return { time: easternTime, dayName: easternDay };
    } catch (e) {
      return { time: "--:--", dayName: "---" };
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="bg-slate-800 rounded-xl p-6">
          <div className="text-white">Loading settings...</div>
        </div>
      </div>
    );
  }

  if (!settings) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-700">
        {/* Header */}
        <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Settings className="h-5 w-5 text-blue-400" />
            Availability Settings
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Global Settings */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-white flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Meeting Settings
            </h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Buffer Before (minutes)
                </label>
                <select
                  value={settings.bufferBeforeMinutes}
                  onChange={(e) => setSettings({ ...settings, bufferBeforeMinutes: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  style={{ backgroundColor: '#0f172a', color: '#ffffff', colorScheme: 'dark' }}
                >
                  <option value="0">0 min</option>
                  <option value="5">5 min</option>
                  <option value="10">10 min</option>
                  <option value="15">15 min</option>
                  <option value="30">30 min</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Buffer After (minutes)
                </label>
                <select
                  value={settings.bufferAfterMinutes}
                  onChange={(e) => setSettings({ ...settings, bufferAfterMinutes: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  style={{ backgroundColor: '#0f172a', color: '#ffffff', colorScheme: 'dark' }}
                >
                  <option value="0">0 min</option>
                  <option value="5">5 min</option>
                  <option value="10">10 min</option>
                  <option value="15">15 min</option>
                  <option value="30">30 min</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Max Meetings Per Day
                </label>
                <select
                  value={settings.maxMeetingsPerDay}
                  onChange={(e) => setSettings({ ...settings, maxMeetingsPerDay: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  style={{ backgroundColor: '#0f172a', color: '#ffffff', colorScheme: 'dark' }}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Accepting Meetings
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.isAcceptingMeetings}
                    onChange={(e) => setSettings({ ...settings, isAcceptingMeetings: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-300">
                    {settings.isAcceptingMeetings ? "Yes" : "No"}
                  </span>
                </label>
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Your Timezone
                </label>
                <select
                  value={settings.timezone || "America/New_York"}
                  onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  style={{ backgroundColor: '#0f172a', color: '#ffffff', colorScheme: 'dark' }}
                >
                  {COMMON_TIMEZONES.map(tz => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  Your working hours will be interpreted in this timezone
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Min Notice Hours
                </label>
                <select
                  value={settings.minNoticeHours || 2}
                  onChange={(e) => setSettings({ ...settings, minNoticeHours: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  style={{ backgroundColor: '#0f172a', color: '#ffffff', colorScheme: 'dark' }}
                >
                  {[0, 1, 2, 4, 6, 12, 24].map(h => (
                    <option key={h} value={h}>{h} hour{h !== 1 ? 's' : ''}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  Minimum hours notice required for booking
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Booking Window (days)
                </label>
                <select
                  value={settings.bookingWindowDays || 14}
                  onChange={(e) => setSettings({ ...settings, bookingWindowDays: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  style={{ backgroundColor: '#0f172a', color: '#ffffff', colorScheme: 'dark' }}
                >
                  {[7, 14, 21, 30].map(d => (
                    <option key={d} value={d}>{d} days</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  How many days ahead to show slots
                </p>
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Meeting Link (Whereby URL)
                </label>
                <input
                  type="url"
                  value={settings.meetingLink || ""}
                  onChange={(e) => setSettings({ ...settings, meetingLink: e.target.value })}
                  placeholder="https://whereby.com/your-room-name"
                  className="w-full px-4 py-2 border border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  style={{ backgroundColor: '#0f172a', color: '#ffffff' }}
                />
                <p className="text-xs text-slate-500 mt-1">
                  This link will be included in all confirmation and reminder emails
                </p>
              </div>
            </div>
          </div>

          {/* Working Hours */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-white flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Your Local Working Hours
            </h4>
            <p className="text-xs text-slate-400 -mt-2">
              Enter times in your timezone ({COMMON_TIMEZONES.find(tz => tz.value === settings.timezone)?.label || settings.timezone})
            </p>
            
            {/* Explainer Box */}
            <div className="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium text-blue-300">Availability Window Rules</p>
                  <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
                    <li>Availability windows <strong className="text-blue-200">cannot cross midnight</strong> - end time must be after start time on the same day</li>
                    <li>For overnight shifts, split into two same-day blocks (e.g., 9 PM - 11:59 PM and 12:00 AM - 5 AM)</li>
                    <li>These hours <strong className="text-blue-200">only affect booking availability</strong> - they do not impact hours-worked calculations</li>
                    <li>Invalid time slots will be automatically filtered out and not shown to SDRs</li>
                  </ul>
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              {DAYS.map(day => {
                const shifts = getShiftsForDay(day.value);
                const hasActiveShifts = shifts.some(s => s.isActive);

                return (
                  <div key={day.value} className="bg-slate-900 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hasActiveShifts}
                          onChange={(e) => {
                            if (e.target.checked && shifts.length === 0) {
                              // Add first shift if none exist
                              addShift(day.value);
                            } else if (!e.target.checked) {
                              // Deactivate all shifts for this day
                              shifts.forEach(shift => {
                                updateShift(shift.index, "isActive", false);
                              });
                            }
                          }}
                          className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-slate-300">{day.short}</span>
                      </label>
                      {hasActiveShifts && (
                        <button
                          onClick={() => addShift(day.value)}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                        >
                          <Plus className="h-3 w-3" />
                          Add Shift
                        </button>
                      )}
                    </div>
                    
                    {shifts.length > 0 && (
                      <div className="space-y-2 pl-6">
                        {shifts.map((shift, shiftIdx) => (
                          <div key={shift.index} className="flex items-center gap-2">
                            <input
                              type="time"
                              value={shift.startTime}
                              onChange={(e) => updateShift(shift.index, "startTime", e.target.value)}
                              className="px-3 py-1.5 border border-slate-600 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                              style={{ backgroundColor: '#1e293b', color: '#ffffff', colorScheme: 'dark' }}
                            />
                            <span className="text-slate-500 text-xs">to</span>
                            <input
                              type="time"
                              value={shift.endTime}
                              onChange={(e) => updateShift(shift.index, "endTime", e.target.value)}
                              className="px-3 py-1.5 border border-slate-600 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                              style={{ backgroundColor: '#1e293b', color: '#ffffff', colorScheme: 'dark' }}
                            />
                            <button
                              onClick={() => removeShift(shift.index)}
                              className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded transition-colors"
                              title="Remove this shift"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Timezone Conversion Helper */}
            {settings.timezone && settings.timezone !== "America/New_York" && (
              <div className="mt-4 p-4 bg-blue-900/30 border border-blue-700/50 rounded-lg">
                <h5 className="text-sm font-semibold text-blue-300 mb-3">
                  🌍 What US customers will see
                </h5>
                <div className="space-y-2 text-sm">
                  {DAYS.map(day => {
                    const shifts = settings.workingHours
                      .filter(wh => wh.dayOfWeek === day.value && wh.isActive);
                    
                    if (shifts.length === 0) return null;
                    
                    return (
                      <div key={day.value} className="bg-slate-800/50 rounded p-3">
                        <div className="text-slate-300 text-xs font-medium mb-2">{day.label}</div>
                        {shifts.map((wh, idx) => {
                          const startEastern = convertToEastern(wh.startTime, wh.dayOfWeek, settings.timezone!);
                          const endEastern = convertToEastern(wh.endTime, wh.dayOfWeek, settings.timezone!);
                          
                          return (
                            <div key={idx} className="mb-2 last:mb-0">
                              <div className="text-slate-400 text-xs mb-1">
                                Your time: {formatTime12(wh.startTime)} – {formatTime12(wh.endTime)}
                              </div>
                              <div className="text-green-400 font-medium text-xs">
                                US Eastern: {startEastern.dayName} {startEastern.time} – {endEastern.dayName} {endEastern.time}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
                {settings.workingHours.filter(wh => wh.isActive).length === 0 && (
                  <p className="text-slate-400 text-sm">Enable working days above to see conversion</p>
                )}
                <p className="text-xs text-slate-500 mt-3 border-t border-slate-700 pt-2">
                  💡 US business hours: Mon–Fri, 9 AM – 6 PM Eastern
                </p>
              </div>
            )}
          </div>

          {/* Preview */}
          {previewSlots.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-lg font-semibold text-white flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Preview: Next Available Slots (What SDRs Will See)
              </h4>
              <div className="bg-slate-900 rounded-lg p-4 space-y-2">
                {previewSlots.map((slot, i) => (
                  <div key={i} className="text-sm text-slate-300">
                    {new Date(slot.start).toLocaleString()} - {slot.activatorName}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-slate-900/50 border-t border-slate-700 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-2 px-8 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

