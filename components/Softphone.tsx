"use client";

import { useState, useEffect, useRef } from "react";
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, Save, X } from "lucide-react";
import toast from "react-hot-toast";
import * as Twilio from "@twilio/voice-sdk";
import { CallOutcome } from "@/lib/types";

interface SoftphoneProps {
  leadId?: string;
  leadPhone?: string;
  leadName?: string;
  twilioNumber?: string;
  onCallStarted?: () => void;
  onCallEnded?: () => void;
}

export function Softphone({
  leadId,
  leadPhone,
  leadName,
  twilioNumber,
  onCallStarted,
  onCallEnded,
}: SoftphoneProps) {
  const [device, setDevice] = useState<Twilio.Device | null>(null);
  const [call, setCall] = useState<Twilio.Call | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callStatus, setCallStatus] = useState<string>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryOutcome, setSummaryOutcome] = useState<CallOutcome | "">("");
  const [summaryNotes, setSummaryNotes] = useState("");
  const [summaryCallbackDate, setSummaryCallbackDate] = useState("");
  const [summaryLeadStatus, setSummaryLeadStatus] = useState<string>("");
  const [summaryNextActionAt, setSummaryNextActionAt] = useState("");
  const [summaryNextActionNote, setSummaryNextActionNote] = useState("");
  const [isSavingSummary, setIsSavingSummary] = useState(false);
  const [showDialpad, setShowDialpad] = useState(false);
  const tokenRef = useRef<string | null>(null);

  const formatDateTimeLocal = (date: Date) => {
    const pad = (value: number) => `${value}`.padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate()
    )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const scheduleCallbackInDays = (days: number) => {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    targetDate.setHours(9, 0, 0, 0);
    const formatted = formatDateTimeLocal(targetDate);
    setSummaryCallbackDate(formatted);
    setSummaryNextActionAt(formatted);
    if (!summaryNextActionNote) {
      setSummaryNextActionNote(`Callback scheduled for ${targetDate.toLocaleDateString()}`);
    }
  };

  // Initialize Twilio Device
  useEffect(() => {
    async function initializeDevice() {
      try {
        // Get access token
        const response = await fetch("/api/twilio/voice/token");
        if (!response.ok) {
          throw new Error("Failed to get access token");
        }

        const data = await response.json();
        tokenRef.current = data.token;

        // Create device
        const newDevice = new Twilio.Device(data.token);

        // Set up event handlers
        newDevice.on("registered", () => {
          console.log("Twilio Device registered");
          setError(null);
        });

        newDevice.on("error", (error) => {
          console.error("Twilio Device error:", error);
          setError(error.message);
          toast.error(`Call error: ${error.message}`);
        });

        newDevice.on("incoming", (incomingCall) => {
          console.log("Incoming call:", incomingCall);
          setCall(incomingCall);
          setCallStatus("ringing");
          toast.success("Incoming call!");
        });

        // Register the device so Twilio can reach this client identity
        try {
          await newDevice.register();
        } catch (registerError: any) {
          console.error("Failed to register Twilio Device:", registerError);
          throw new Error(registerError.message || "Failed to register phone");
        }

        setDevice(newDevice);

        // Update agent status to logged in
        await fetch("/api/agents/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isLoggedIn: true,
            isAvailable: true,
            webrtcIdentity: data.identity,
          }),
        });

        return () => {
          newDevice.destroy();
        };
      } catch (err: any) {
        console.error("Error initializing device:", err);
        setError(err.message);
        toast.error(`Failed to initialize phone: ${err.message}`);
      }
    }

    initializeDevice();

    // Cleanup on unmount
    return () => {
      if (device) {
        device.destroy();
      }
      // Update agent status to logged out
      fetch("/api/agents/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isLoggedIn: false,
          isAvailable: false,
        }),
      }).catch(console.error);
    };
  }, []);

  // Set up call event handlers
  useEffect(() => {
    if (!call) return;

    const handleDisconnect = () => {
      console.log("Call disconnected");
      setCall(null);
      setCallStatus("disconnected");
      setIsMuted(false);
      setIsConnecting(false);
      
      // Show summary panel if we have a callId
      if (callId) {
        setShowSummary(true);
      } else {
        onCallEnded?.();
      }
    };

    const handleReject = () => {
      console.log("Call rejected");
      setCall(null);
      setCallStatus("disconnected");
      setIsConnecting(false);
      onCallEnded?.();
    };

    call.on("disconnect", handleDisconnect);
    call.on("reject", handleReject);
    call.on("cancel", handleDisconnect);
    call.on("error", (error) => {
      console.error("Call error:", error);
      toast.error(`Call error: ${error.message}`);
      handleDisconnect();
    });

    call.on("accept", () => {
      console.log("Call accepted");
      setCallStatus("connected");
      setIsConnecting(false);
      onCallStarted?.();
    });

    return () => {
      call.off("disconnect", handleDisconnect);
      call.off("reject", handleReject);
      call.off("cancel", handleDisconnect);
    };
  }, [call, onCallStarted, onCallEnded]);

  const makeCall = async () => {
    if (!device || !leadPhone || !leadId) {
      toast.error("Missing required information to make call");
      return;
    }

    if (call) {
      toast.error("Call already in progress");
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // Initiate call via API (this creates the Twilio call)
      const response = await fetch("/api/calls/webrtc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          phoneNumber: leadPhone,
          leadName,
          twilioNumber,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to initiate call");
      }

      const result = await response.json();
      
      // Store the call ID for later summary
      if (result.call?.id) {
        setCallId(result.call.id);
      }

      // The call will come through as an incoming call to the device
      // Wait for it to connect
      toast.success(`Calling ${leadName || leadPhone}...`);
    } catch (err: any) {
      console.error("Error making call:", err);
      setError(err.message);
      toast.error(`Failed to make call: ${err.message}`);
      setIsConnecting(false);
    }
  };

  const hangUp = () => {
    if (call) {
      call.disconnect();
      // handleDisconnect will be called by the event handler
    }
  };

  const handleSaveSummary = async () => {
    if (!callId) {
      toast.error("No call ID found");
      return;
    }

    setIsSavingSummary(true);
    try {
      const response = await fetch(`/api/calls/${callId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome: summaryOutcome || undefined,
          notes: summaryNotes || undefined,
          callbackDate: summaryCallbackDate || undefined,
          leadStatus: summaryLeadStatus || undefined,
          nextActionAt: summaryNextActionAt || undefined,
          nextActionNote: summaryNextActionNote || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save call summary");
      }

      toast.success("Call summary saved");
      setShowSummary(false);
      setCallId(null);
      setSummaryOutcome("");
      setSummaryNotes("");
      setSummaryCallbackDate("");
      setSummaryLeadStatus("");
      setSummaryNextActionAt("");
      setSummaryNextActionNote("");
      onCallEnded?.();
    } catch (err: any) {
      console.error("Error saving summary:", err);
      toast.error(err.message || "Failed to save call summary");
    } finally {
      setIsSavingSummary(false);
    }
  };

  const handleSkipSummary = () => {
    setShowSummary(false);
    setCallId(null);
    setSummaryOutcome("");
    setSummaryNotes("");
    setSummaryCallbackDate("");
    setSummaryLeadStatus("");
    setSummaryNextActionAt("");
    setSummaryNextActionNote("");
    onCallEnded?.();
  };

  const toggleMute = () => {
    if (!call) return;

    if (isMuted) {
      call.mute(false);
      setIsMuted(false);
    } else {
      call.mute(true);
      setIsMuted(true);
    }
  };

  const toggleSpeaker = () => {
    // Note: Speaker control is typically handled by the browser/OS
    // This is a UI state for user feedback
    setIsSpeakerOn(!isSpeakerOn);
  };

  const sendDTMF = (digit: string) => {
    if (call && callStatus === "connected") {
      call.sendDigits(digit);
      toast.success(`Sent: ${digit}`, { duration: 500 });
    }
  };

  const answerCall = () => {
    if (call && callStatus === "ringing") {
      call.accept();
      setCallStatus("connected");
      onCallStarted?.();
    }
  };

  const rejectCall = () => {
    if (call) {
      call.reject();
      setCall(null);
      setCallStatus("disconnected");
    }
  };

  const isInCall = callStatus === "connected" || callStatus === "ringing";

  // Show summary panel if call ended
  if (showSummary && callId) {
    return (
      <div className="flex flex-col bg-white rounded-lg shadow-lg border border-gray-200 w-full">
        {/* Header - fixed */}
        <div className="flex items-center justify-between p-2 border-b border-gray-100">
          <div>
            <span className="text-sm font-semibold text-gray-900">Call Summary</span>
            <span className="text-xs text-gray-500 ml-2">{leadName || "Lead"}</span>
          </div>
          <button onClick={handleSkipSummary} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content - compact */}
        <div className="p-2 space-y-2">
          {/* Outcome + Status in one row */}
          <div className="flex gap-2">
            <select
              value={summaryOutcome}
              onChange={(e) => setSummaryOutcome(e.target.value as CallOutcome | "")}
              className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
            >
              <option value="">Outcome *</option>
              <option value="interested">Interested</option>
              <option value="not_interested">Not Interested</option>
              <option value="callback_requested">Callback</option>
              <option value="no_answer">No Answer</option>
              <option value="busy">Busy</option>
              <option value="wrong_number">Wrong #</option>
            </select>
            <select
              value={summaryLeadStatus}
              onChange={(e) => setSummaryLeadStatus(e.target.value)}
              className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
            >
              <option value="">Status</option>
              <option value="contacted">Contacted</option>
              <option value="interested">Interested</option>
              <option value="follow_up">Follow-Up</option>
              <option value="closed_won">Won</option>
              <option value="closed_lost">Lost</option>
            </select>
          </div>

          {/* Notes - single line */}
          <input
            type="text"
            value={summaryNotes}
            onChange={(e) => setSummaryNotes(e.target.value)}
            placeholder="Notes..."
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
          />

          {/* Follow-up buttons + date in one row */}
          <div className="flex gap-1 items-center">
            <span className="text-xs text-gray-500">Follow-up:</span>
            <button type="button" onClick={() => scheduleCallbackInDays(1)} className="px-2 py-0.5 text-xs bg-gray-100 rounded hover:bg-gray-200">1d</button>
            <button type="button" onClick={() => scheduleCallbackInDays(7)} className="px-2 py-0.5 text-xs bg-gray-100 rounded hover:bg-gray-200">1w</button>
            <button type="button" onClick={() => scheduleCallbackInDays(14)} className="px-2 py-0.5 text-xs bg-gray-100 rounded hover:bg-gray-200">2w</button>
            <input
              type="datetime-local"
              value={summaryNextActionAt}
              onChange={(e) => { setSummaryNextActionAt(e.target.value); setSummaryCallbackDate(e.target.value); }}
              className="flex-1 px-1 py-0.5 text-xs border border-gray-300 rounded ml-1"
            />
          </div>
        </div>

        {/* Buttons - always visible at bottom */}
        <div className="flex gap-2 p-2 border-t border-gray-100 bg-gray-50">
          <button
            onClick={handleSkipSummary}
            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-100"
          >
            Skip
          </button>
          <button
            onClick={handleSaveSummary}
            disabled={isSavingSummary || !summaryOutcome}
            className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isSavingSummary ? "..." : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 p-4 bg-white rounded-lg shadow-lg border border-gray-200">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-2 rounded w-full text-center">
          {error}
        </div>
      )}

      <div className="text-center">
        <div className="text-lg font-semibold text-gray-900">
          {leadName || "No lead selected"}
        </div>
        {leadPhone && (
          <div className="text-sm text-gray-600">{leadPhone}</div>
        )}
        {callStatus !== "disconnected" && (
          <div className="text-xs text-gray-500 mt-1">
            Status: {callStatus}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        {!isInCall ? (
          <button
            onClick={makeCall}
            disabled={!device || !leadPhone || !leadId || isConnecting}
            className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Phone className="h-5 w-5" />
            {isConnecting ? "Connecting..." : "Call"}
          </button>
        ) : callStatus === "ringing" ? (
          <>
            <button
              onClick={answerCall}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-full flex items-center gap-2"
            >
              <Phone className="h-5 w-5" />
              Answer
            </button>
            <button
              onClick={rejectCall}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center gap-2"
            >
              <PhoneOff className="h-5 w-5" />
              Reject
            </button>
          </>
        ) : (
          <>
            <button
              onClick={toggleMute}
              className={`px-4 py-3 rounded-full flex items-center gap-2 ${
                isMuted
                  ? "bg-red-100 text-red-700 hover:bg-red-200"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {isMuted ? (
                <MicOff className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </button>
            <button
              onClick={toggleSpeaker}
              className={`px-4 py-3 rounded-full flex items-center gap-2 ${
                isSpeakerOn
                  ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {isSpeakerOn ? (
                <Volume2 className="h-5 w-5" />
              ) : (
                <VolumeX className="h-5 w-5" />
              )}
            </button>
            <button
              onClick={hangUp}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center gap-2"
            >
              <PhoneOff className="h-5 w-5" />
              Hang Up
            </button>
          </>
        )}
      </div>

      {/* Dialpad for IVR navigation */}
      {callStatus === "connected" && (
        <div className="mt-4">
          <button
            onClick={() => setShowDialpad(!showDialpad)}
            className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            {showDialpad ? "Hide Keypad" : "Show Keypad"}
          </button>
          
          {showDialpad && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((digit) => (
                <button
                  key={digit}
                  onClick={() => sendDTMF(digit)}
                  className="p-4 bg-white border-2 border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 active:bg-gray-100 font-bold text-xl text-gray-900 transition-all"
                >
                  {digit}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!device && (
        <div className="text-xs text-gray-500 text-center">
          Initializing phone system...
        </div>
      )}
    </div>
  );
}

