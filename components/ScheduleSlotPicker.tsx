"use client";

import { useState, useEffect } from "react";
import { ALL_TIMEZONES, COMMON_TIMEZONES, formatInTimezone } from "@/lib/timezones";
import { X, Search, Globe, Clock, User, Calendar, Phone, Mail, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { AvailableSlot, ATTENDEE_ROLE_OPTIONS, WEBSITE_PLATFORM_OPTIONS } from "@/lib/types";

interface ScheduleSlotPickerProps {
  onClose: () => void;
  onSave: (data: {
    scheduled_install_at: string;
    customer_timezone: string;
    technical_owner_name: string;
  }) => void;
  isSaving: boolean;
  leadId?: string;
  trialPipelineId?: string;
  initialTimezone?: string | null;
  initialTechOwner?: string | null;
  initialPhone?: string | null;
  initialEmail?: string | null;
  isDialerMode?: boolean;
  onRefusal?: (reason: 'SCHEDULE_REFUSED' | 'DM_UNAVAILABLE', details?: string) => void;
}

export function ScheduleSlotPicker({
  onClose,
  onSave,
  isSaving,
  leadId,
  trialPipelineId,
  initialTimezone,
  initialTechOwner,
  initialPhone,
  initialEmail,
  isDialerMode = false,
  onRefusal,
}: ScheduleSlotPickerProps) {
  const [step, setStep] = useState(1);
  const [timezone, setTimezone] = useState(initialTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [searchTz, setSearchTz] = useState("");
  const [showRefusalOptions, setShowRefusalOptions] = useState(false);
  const [refusalReason, setRefusalReason] = useState<'SCHEDULE_REFUSED' | 'DM_UNAVAILABLE' | ''>('');
  const [refusalDetails, setRefusalDetails] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');

  // Form fields (REQUIRED)
  const [attendeeName, setAttendeeName] = useState(initialTechOwner || "");
  const [attendeeRole, setAttendeeRole] = useState<"owner" | "web_guy" | "office_manager" | "other">("owner");
  const [phone, setPhone] = useState(initialPhone || "");
  const [email, setEmail] = useState(initialEmail || "");
  const [websitePlatform, setWebsitePlatform] = useState<"wordpress" | "wix" | "squarespace" | "shopify" | "none" | "unknown" | "other">("unknown");
  const [goal, setGoal] = useState("");
  const [objections, setObjections] = useState("");
  const [notes, setNotes] = useState("");
  
  // SDR Confirmation Checklist
  const [sdrConfirmedUnderstandsInstall, setSdrConfirmedUnderstandsInstall] = useState(false);
  const [sdrConfirmedAgreedInstall, setSdrConfirmedAgreedInstall] = useState(false);
  const [sdrConfirmedWillAttend, setSdrConfirmedWillAttend] = useState(false);
  const [accessMethodCredentials, setAccessMethodCredentials] = useState(false);
  const [accessMethodWebPerson, setAccessMethodWebPerson] = useState(false);
  const [webPersonEmail, setWebPersonEmail] = useState("");

  const filteredTz = ALL_TIMEZONES.filter(tz => 
    tz.label.toLowerCase().includes(searchTz.toLowerCase()) || 
    tz.value.toLowerCase().includes(searchTz.toLowerCase())
  );

  // Fetch slots when date/timezone changes
  useEffect(() => {
    if (selectedDate && timezone) {
      fetchSlots();
    }
  }, [selectedDate, timezone]);

  const fetchSlots = async () => {
    if (!selectedDate) return;

    setLoadingSlots(true);
    try {
      const startDate = selectedDate;
      const endDate = new Date(selectedDate);
      endDate.setDate(endDate.getDate() + 7);

      const res = await fetch(
        `/api/activator-availability/slots?startDate=${startDate}&endDate=${endDate.toISOString().split("T")[0]}&timezone=${timezone}`
      );
      const data = await res.json();
      
      if (data.success) {
        // Filter to only show slots on selected date (using viewer timezone date)
        const dateSlots = data.slots.filter((slot: AvailableSlot) => 
          slot.viewerDate === selectedDate
        );
        setAvailableSlots(dateSlots);
      } else {
        toast.error("Failed to load available slots");
      }
    } catch (error) {
      console.error("Error fetching slots:", error);
      toast.error("Failed to load available slots");
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleSlotSelect = (slot: AvailableSlot) => {
    setSelectedSlot(slot);
    setStep(3);
  };

  const handleConfirm = async () => {
    // Validation
    if (!selectedSlot) {
      toast.error("Please select a time slot");
      return;
    }
    if (!attendeeName || !attendeeRole || !phone || !websitePlatform || !goal) {
      toast.error("Please fill all required fields");
      return;
    }
    
    // SDR Confirmation Checklist Validation
    if (!sdrConfirmedUnderstandsInstall || !sdrConfirmedAgreedInstall || !sdrConfirmedWillAttend) {
      toast.error("Please confirm all Install Commitment items");
      return;
    }
    
    if (!accessMethodCredentials && !accessMethodWebPerson) {
      toast.error("Please select at least one Access/Prep option");
      return;
    }
    
    if (accessMethodWebPerson && !webPersonEmail.trim()) {
      toast.error("Please provide the website person's email");
      return;
    }

    try {
      // Create meeting via API
      const res = await fetch("/api/activation-meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledStartAt: selectedSlot.start,
          scheduledTimezone: timezone,
          activatorUserId: selectedSlot.activatorId,
          trialPipelineId: trialPipelineId || null,
          leadId: leadId || null,
          attendeeName,
          attendeeRole,
          phone,
          email: email || null,
          websitePlatform,
          goal,
          objections: objections || null,
          notes: notes || null,
          scheduledVia: isDialerMode ? 'dialer' : 'activations_page',
          sdrConfirmedUnderstandsInstall,
          sdrConfirmedAgreedInstall,
          sdrConfirmedWillAttend,
          accessMethod: accessMethodCredentials && accessMethodWebPerson ? 'both' : 
                       accessMethodCredentials ? 'credentials' : 
                       accessMethodWebPerson ? 'web_person' : null,
          webPersonEmail: accessMethodWebPerson ? webPersonEmail.trim() : null,
        }),
      });

      const data = await res.json();
      if (data.success) {
        // Call original onSave for backward compatibility
        onSave({
          scheduled_install_at: selectedSlot.start,
          customer_timezone: timezone,
          technical_owner_name: attendeeName,
        });
        toast.success("Meeting scheduled!");
        onClose();
      } else {
        toast.error(data.error || "Failed to schedule meeting");
      }
    } catch (error) {
      console.error("Error scheduling meeting:", error);
      toast.error("Failed to schedule meeting");
    }
  };

  const getDualTimePreview = () => {
    if (!selectedSlot) return null;

    const slotDate = new Date(selectedSlot.start);
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    };

    const localTime = new Intl.DateTimeFormat('en-US', options).format(slotDate);
    const customerTime = formatInTimezone(slotDate, timezone, {
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

  // Get next 7 days for date picker
  const getDateOptions = () => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-700">
        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-400" />
            Schedule Onboarding
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Refusal Options (Dialer Mode Only) */}
          {showRefusalOptions && isDialerMode && (
            <div className="space-y-4">
              <h4 className="text-lg font-semibold text-white">Customer Refused to Schedule</h4>
              <p className="text-sm text-slate-400">Please select a reason and provide details:</p>
              
              <div className="space-y-3">
                <label className="flex items-start gap-3 p-3 bg-slate-900 rounded-lg border border-slate-700 cursor-pointer hover:border-orange-500">
                  <input
                    type="radio"
                    name="refusal"
                    value="SCHEDULE_REFUSED"
                    checked={refusalReason === 'SCHEDULE_REFUSED'}
                    onChange={(e) => setRefusalReason(e.target.value as 'SCHEDULE_REFUSED')}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-white">Customer Refused to Schedule</div>
                    <div className="text-xs text-slate-400 mt-1">Customer explicitly declined to schedule</div>
                  </div>
                </label>
                
                <label className="flex items-start gap-3 p-3 bg-slate-900 rounded-lg border border-slate-700 cursor-pointer hover:border-orange-500">
                  <input
                    type="radio"
                    name="refusal"
                    value="DM_UNAVAILABLE"
                    checked={refusalReason === 'DM_UNAVAILABLE'}
                    onChange={(e) => setRefusalReason(e.target.value as 'DM_UNAVAILABLE')}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-white">Decision Maker Not Available</div>
                    <div className="text-xs text-slate-400 mt-1">Decision maker needs to be present</div>
                  </div>
                </label>
              </div>

              {refusalReason && (
                <div className="space-y-3">
                  {refusalReason === 'DM_UNAVAILABLE' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">
                        Follow-up Date Required *
                      </label>
                      <input
                        type="datetime-local"
                        value={followUpDate}
                        onChange={(e) => setFollowUpDate(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        style={{ backgroundColor: '#0f172a', color: '#ffffff', colorScheme: 'dark' }}
                        required
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Details / Reason
                    </label>
                    <textarea
                      value={refusalDetails}
                      onChange={(e) => setRefusalDetails(e.target.value)}
                      placeholder="Why did they refuse? What did they say?"
                      rows={3}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 1: Timezone */}
          {!showRefusalOptions && step === 1 && (
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
                    onClick={() => {
                      setTimezone(tz.value);
                      setStep(2);
                    }}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-slate-800 transition-colors ${
                      timezone === tz.value ? "bg-blue-600/20 text-blue-400 font-bold" : "text-slate-300"
                    }`}
                  >
                    {tz.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Date & Time Slot */}
          {!showRefusalOptions && step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  2. Select Date
                  <span className="text-xs font-normal text-blue-400">
                    (Viewing in {COMMON_TIMEZONES.find(tz => tz.value === timezone)?.label || timezone})
                  </span>
                </label>
                <button
                  onClick={() => setStep(1)}
                  className="text-xs text-slate-400 hover:text-slate-300"
                >
                  Change timezone
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                {getDateOptions().map(date => {
                  // Format date in the selected customer timezone
                  const dateInTz = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
                  const year = dateInTz.getFullYear();
                  const month = String(dateInTz.getMonth() + 1).padStart(2, '0');
                  const day = String(dateInTz.getDate()).padStart(2, '0');
                  const dateStr = `${year}-${month}-${day}`;
                  const isSelected = selectedDate === dateStr;
                  
                  // Format display label in customer timezone
                  const displayLabel = formatInTimezone(date, timezone, { 
                    weekday: "short", 
                    month: "short", 
                    day: "numeric" 
                  });
                  
                  return (
                    <button
                      key={dateStr}
                      onClick={() => setSelectedDate(dateStr)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isSelected
                          ? "bg-blue-600 text-white"
                          : "bg-slate-900 text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      {displayLabel}
                    </button>
                  );
                })}
              </div>

              {selectedDate && (
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-slate-300">
                    3. Select Time Slot
                  </label>
                  {loadingSlots ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
                    </div>
                  ) : availableSlots.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      No available slots for this date
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                      {availableSlots.map((slot, i) => {
                        const slotDate = new Date(slot.start);
                        const timeStr = formatInTimezone(slotDate, timezone, {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                        });
                        return (
                          <button
                            key={i}
                            onClick={() => handleSlotSelect(slot)}
                            className="px-4 py-3 bg-slate-900 hover:bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-300 hover:text-white transition-colors"
                          >
                            <div className="font-medium">{timeStr}</div>
                            <div className="text-xs text-slate-500">{slot.activatorName}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Required Fields */}
          {!showRefusalOptions && step === 3 && selectedSlot && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-300">4. Meeting Details (Required)</h4>
                <button
                  onClick={() => setStep(2)}
                  className="text-xs text-slate-400 hover:text-slate-300"
                >
                  Change time
                </button>
              </div>

              {getDualTimePreview()}

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Attendee Name *
                  </label>
                  <input
                    type="text"
                    value={attendeeName}
                    onChange={(e) => setAttendeeName(e.target.value)}
                    placeholder="e.g. Mike, Owner, etc."
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    style={{ backgroundColor: '#0f172a', color: '#ffffff' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Attendee Role *
                  </label>
                  <select
                    value={attendeeRole}
                    onChange={(e) => setAttendeeRole(e.target.value as any)}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    style={{ backgroundColor: '#0f172a', color: '#ffffff', colorScheme: 'dark' }}
                  >
                    {ATTENDEE_ROLE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Phone *
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    style={{ backgroundColor: '#0f172a', color: '#ffffff' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Email (optional)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="customer@example.com"
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    style={{ backgroundColor: '#0f172a', color: '#ffffff' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Website Platform *
                  </label>
                  <select
                    value={websitePlatform}
                    onChange={(e) => setWebsitePlatform(e.target.value as any)}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    style={{ backgroundColor: '#0f172a', color: '#ffffff', colorScheme: 'dark' }}
                  >
                    {WEBSITE_PLATFORM_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Goal *
                  </label>
                  <input
                    type="text"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="e.g. More leads, replace Wheelzy, test offers"
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    style={{ backgroundColor: '#0f172a', color: '#ffffff' }}
                  />
                </div>

                {/* SDR-CONFIRMED CHECKLIST */}
                <div className="mt-6 pt-6 border-t border-slate-700">
                  <div className="mb-4">
                    <h4 className="text-sm font-bold text-white mb-1">SDR-CONFIRMED (THIS IS THE REAL VALUE)</h4>
                    <p className="text-xs text-slate-400">These are the only things SDRs must confirm live on the call</p>
                  </div>

                  {/* Install Commitment Section */}
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-slate-300 mb-2">
                      Install Commitment (all required) *
                    </label>
                    <div className="space-y-2">
                      <label className="flex items-start gap-2 p-2 bg-slate-900 rounded-lg border border-slate-700 hover:border-blue-500 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sdrConfirmedUnderstandsInstall}
                          onChange={(e) => setSdrConfirmedUnderstandsInstall(e.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-300">Customer understands the calculator will be installed on their website</span>
                      </label>
                      <label className="flex items-start gap-2 p-2 bg-slate-900 rounded-lg border border-slate-700 hover:border-blue-500 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sdrConfirmedAgreedInstall}
                          onChange={(e) => setSdrConfirmedAgreedInstall(e.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-300">Customer agreed to install during the setup call</span>
                      </label>
                      <label className="flex items-start gap-2 p-2 bg-slate-900 rounded-lg border border-slate-700 hover:border-blue-500 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sdrConfirmedWillAttend}
                          onChange={(e) => setSdrConfirmedWillAttend(e.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-300">Customer confirmed they will attend the install appointment</span>
                      </label>
                    </div>
                  </div>

                  {/* Access / Prep Section */}
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-slate-300 mb-2">
                      Access / Prep (HARD REQUIREMENT - at least ONE) *
                    </label>
                    <div className="space-y-2">
                      <label className="flex items-start gap-2 p-2 bg-slate-900 rounded-lg border border-slate-700 hover:border-blue-500 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={accessMethodCredentials}
                          onChange={(e) => setAccessMethodCredentials(e.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-300">Customer will bring website login credentials</span>
                      </label>
                      <div>
                        <label className="flex items-start gap-2 p-2 bg-slate-900 rounded-lg border border-slate-700 hover:border-blue-500 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={accessMethodWebPerson}
                            onChange={(e) => setAccessMethodWebPerson(e.target.checked)}
                            className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-slate-300">Customer will add their website person to the call</span>
                        </label>
                        {accessMethodWebPerson && (
                          <div className="mt-2 ml-6">
                            <label className="block text-xs font-medium text-slate-400 mb-1">
                              Website person email *
                            </label>
                            <input
                              type="email"
                              value={webPersonEmail}
                              onChange={(e) => setWebPersonEmail(e.target.value)}
                              placeholder="webperson@example.com"
                              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                              style={{ backgroundColor: '#0f172a', color: '#ffffff' }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                    {!accessMethodCredentials && !accessMethodWebPerson && (
                      <p className="text-xs text-red-400 mt-2">⚠️ If neither option is checked → appointment cannot be booked</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Objections (optional)
                  </label>
                  <textarea
                    value={objections}
                    onChange={(e) => setObjections(e.target.value)}
                    placeholder="Any objections mentioned?"
                    rows={2}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                    style={{ backgroundColor: '#0f172a', color: '#ffffff' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Notes (optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Additional context..."
                    rows={2}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                    style={{ backgroundColor: '#0f172a', color: '#ffffff' }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-900/50 border-t border-slate-700 flex gap-3">
          {isDialerMode && !showRefusalOptions && step < 3 && (
            <button
              onClick={() => setShowRefusalOptions(true)}
              className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Customer Refused
            </button>
          )}
          <button
            onClick={() => {
              if (isDialerMode && !showRefusalOptions && step < 3) {
                // In dialer mode, must choose refusal option
                setShowRefusalOptions(true);
              } else {
                onClose();
              }
            }}
            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {isDialerMode && !showRefusalOptions && step < 3 ? "Cancel" : "Close"}
          </button>
          {showRefusalOptions ? (
            <button
              onClick={() => {
                if (!refusalReason) {
                  toast.error("Please select a refusal reason");
                  return;
                }
                if (refusalReason === 'DM_UNAVAILABLE' && !followUpDate) {
                  toast.error("Please provide a follow-up date");
                  return;
                }
                if (onRefusal) {
                  onRefusal(refusalReason, refusalDetails || undefined);
                }
                onClose();
              }}
              disabled={!refusalReason || (refusalReason === 'DM_UNAVAILABLE' && !followUpDate)}
              className="flex-2 px-8 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Record Refusal
            </button>
          ) : step === 3 && (
            <button
              onClick={handleConfirm}
              disabled={
                isSaving || 
                !selectedSlot || 
                !attendeeName || 
                !phone || 
                !websitePlatform || 
                !goal ||
                !sdrConfirmedUnderstandsInstall ||
                !sdrConfirmedAgreedInstall ||
                !sdrConfirmedWillAttend ||
                (!accessMethodCredentials && !accessMethodWebPerson) ||
                (accessMethodWebPerson && !webPersonEmail.trim())
              }
              className="flex-2 px-8 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20"
            >
              {isSaving ? "Scheduling..." : "Confirm Booking"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

