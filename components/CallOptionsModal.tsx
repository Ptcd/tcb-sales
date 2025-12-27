"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Phone, Voicemail, Users, X, Monitor } from "lucide-react";
import toast from "react-hot-toast";
import { LoadingSpinner } from "./LoadingSpinner";
import { useCall } from "./CallProvider";

interface CallOptionsModalProps {
  leadId: string;
  leadName: string;
  leadPhone: string;
  onClose: () => void;
  onCallInitiated?: () => void;
}

export function CallOptionsModal({
  leadId,
  leadName,
  leadPhone,
  onClose,
  onCallInitiated,
}: CallOptionsModalProps) {
  const { makeCall, isInitialized } = useCall();
  const [callMode, setCallMode] = useState<"voicemail" | "live" | "webrtc" | null>(null);
  const [userPhone, setUserPhone] = useState("");
  const [voicemailMessage, setVoicemailMessage] = useState(
    `Hi, this is a message for ${leadName}. We'd like to discuss a potential business opportunity. Please call us back at your earliest convenience. Thank you!`
  );
  const [isInitiating, setIsInitiating] = useState(false);
  const [twilioNumbers, setTwilioNumbers] = useState<Array<{ phoneNumber: string; friendlyName: string }>>([]);
  const [selectedTwilioNumber, setSelectedTwilioNumber] = useState<string>("");
  const [userAssignedNumber, setUserAssignedNumber] = useState<string | null>(null);
  const [loadingNumbers, setLoadingNumbers] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userSettings, setUserSettings] = useState({
    preferredOutboundNumber: "",
    rememberOutboundNumber: false,
    autoCallSingleNumber: true,
    preferredCallMode: "webrtc" as "webrtc" | "live" | "voicemail",
  });
  const [rememberChoice, setRememberChoice] = useState(false);
  const [showNumberSelector, setShowNumberSelector] = useState(true);
  const [availableCallerIds, setAvailableCallerIds] = useState<string[]>([]);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);
  
  // Track auto-call state
  const autoCallTriggeredRef = useRef(false);
  const autoCallDataRef = useRef<{
    callerIdToUse: string;
    canAutoCall: boolean;
    modeToUse: "webrtc" | "live" | "voicemail";
  } | null>(null);

  // Stable callback refs to avoid effect dependency issues  
  const onCloseRef = useRef(onClose);
  const onCallInitiatedRef = useRef(onCallInitiated);
  useEffect(() => {
    onCloseRef.current = onClose;
    onCallInitiatedRef.current = onCallInitiated;
  }, [onClose, onCallInitiated]);

  // STEP 1: Load settings and phone numbers on mount (runs once)
  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setIsLoadingSettings(true);
      setLoadingNumbers(true);

      try {
        // Fetch user settings
        let settings = {
          preferredOutboundNumber: "",
          rememberOutboundNumber: false,
          autoCallSingleNumber: true,
          preferredCallMode: "webrtc" as "webrtc" | "live" | "voicemail",
        };

        const settingsRes = await fetch("/api/settings/user");
        if (cancelled) return;
        
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          settings = {
            preferredOutboundNumber: settingsData.settings?.preferredOutboundNumber || "",
            rememberOutboundNumber: settingsData.settings?.rememberOutboundNumber ?? false,
            autoCallSingleNumber: settingsData.settings?.autoCallSingleNumber ?? true,
            preferredCallMode: (settingsData.settings?.preferredCallMode as "webrtc" | "live" | "voicemail") || "webrtc",
          };
          console.log("[Dialer] Loaded settings:", settings);
        }

        setUserSettings(settings);
        setRememberChoice(settings.rememberOutboundNumber);

        // Fetch phone numbers
        let assignedNumber: string | null = null;
        let userRole: string = "member";
        let availableNumbers: string[] = [];

        const profileRes = await fetch("/api/auth/profile");
        if (cancelled) return;
        
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          userRole = profileData.role || "member";
          setIsAdmin(userRole === "admin");

          // Check assigned_twilio_number (set by admin in Team Management)
          // Fallback to phone_number for backwards compatibility
          const phoneNum = profileData.profile?.assigned_twilio_number || profileData.profile?.phone_number;
          if (phoneNum) {
            assignedNumber = phoneNum as string;
            setUserAssignedNumber(assignedNumber);
            availableNumbers.push(assignedNumber);
          }
        }

        if (userRole === "admin") {
          const numbersRes = await fetch("/api/twilio/numbers");
          if (cancelled) return;
          
          if (numbersRes.ok) {
            const numbersData = await numbersRes.json();
            setTwilioNumbers(numbersData.numbers || []);
            if (Array.isArray(numbersData.numbers)) {
              availableNumbers.push(
                ...numbersData.numbers.map((n: { phoneNumber: string }) => n.phoneNumber)
              );
            }
          }
        }

        const uniqueNumbers = Array.from(new Set(availableNumbers.filter(Boolean)));
        setAvailableCallerIds(uniqueNumbers);
        console.log("[Dialer] Available numbers:", uniqueNumbers);

        // Determine caller ID to use
        const preferred = settings.preferredOutboundNumber;
        const singleNumber = uniqueNumbers.length === 1 ? uniqueNumbers[0] : null;

        let callerIdToUse = "";
        if (preferred && uniqueNumbers.includes(preferred)) {
          callerIdToUse = preferred;
        } else if (singleNumber) {
          callerIdToUse = singleNumber;
        } else if (assignedNumber) {
          callerIdToUse = assignedNumber;
        } else if (uniqueNumbers.length > 0) {
          callerIdToUse = uniqueNumbers[0];
        }

        setSelectedTwilioNumber(callerIdToUse);

        // Determine if we can skip the UI entirely
        const canSkipCallType = !!settings.preferredCallMode;
        const canSkipNumberSelector =
          (!!preferred && settings.rememberOutboundNumber && uniqueNumbers.includes(preferred)) ||
          (!!singleNumber && settings.autoCallSingleNumber);

        setShowNumberSelector(!canSkipNumberSelector);

        // Store auto-call decision for the next effect to use
        const canAutoCall = canSkipCallType && canSkipNumberSelector && !!callerIdToUse;
        autoCallDataRef.current = {
          callerIdToUse,
          canAutoCall,
          modeToUse: settings.preferredCallMode,
        };
        
        console.log("[Dialer] Auto-call decision:", {
          canSkipCallType,
          canSkipNumberSelector,
          callerIdToUse,
          canAutoCall,
          rememberOutboundNumber: settings.rememberOutboundNumber,
          preferred,
          singleNumber,
        });

        setDataLoaded(true);
      } catch (error) {
        console.error("Error initializing dialer:", error);
      } finally {
        if (!cancelled) {
          setIsLoadingSettings(false);
          setLoadingNumbers(false);
        }
      }
    };

    loadData();
    
    return () => {
      cancelled = true;
    };
  }, []); // Only run once on mount

  // STEP 2: Auto-call when data is loaded AND Twilio is initialized
  useEffect(() => {
    if (!dataLoaded || !isInitialized || autoCallTriggeredRef.current) {
      console.log("[Dialer] Auto-call check skipped:", { dataLoaded, isInitialized, alreadyTriggered: autoCallTriggeredRef.current });
      return;
    }

    const autoCallData = autoCallDataRef.current;
    if (!autoCallData || !autoCallData.canAutoCall) {
      console.log("[Dialer] Auto-call not enabled:", autoCallData);
      return;
    }

    // Mark as triggered before async work to prevent double-calls
    autoCallTriggeredRef.current = true;
    console.log("[Dialer] Triggering auto-call with:", autoCallData);

    const { callerIdToUse, modeToUse } = autoCallData;

    if (modeToUse === "webrtc") {
      // Immediately place WebRTC call
      makeCall(leadId, leadPhone, leadName, callerIdToUse)
        .then(() => {
          console.log("[Dialer] Auto-call succeeded");
          onCallInitiatedRef.current?.();
          onCloseRef.current();
        })
        .catch((err) => {
          console.error("[Dialer] Auto-call failed:", err);
          // Reset so user can manually call
          autoCallTriggeredRef.current = false;
        });
    } else {
      // For live/voicemail, set mode and let user complete the flow
      setCallMode(modeToUse);
    }
  }, [dataLoaded, isInitialized, leadId, leadPhone, leadName, makeCall]);

  // Secondary effect: update selector visibility when user manually selects a call mode
  useEffect(() => {
    if (!callMode) {
      return;
    }

    const preferred = userSettings.preferredOutboundNumber;
    const singleNumber = availableCallerIds.length === 1 ? availableCallerIds[0] : null;

    const shouldSkipSelector =
      (!!preferred && userSettings.rememberOutboundNumber && availableCallerIds.includes(preferred)) ||
      (!!singleNumber && userSettings.autoCallSingleNumber);

    setShowNumberSelector(!shouldSkipSelector);
  }, [callMode, userSettings, availableCallerIds]);

  const getSelectedCallerId = () => selectedTwilioNumber || userAssignedNumber || "";

  const persistDialerPreference = async (numberToSave: string | null, rememberFlag: boolean) => {
    try {
      const response = await fetch("/api/settings/user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferredOutboundNumber: numberToSave,
          rememberOutboundNumber: rememberFlag,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const normalized = {
          preferredOutboundNumber: data.settings?.preferredOutboundNumber || "",
          rememberOutboundNumber: data.settings?.rememberOutboundNumber ?? false,
          autoCallSingleNumber: data.settings?.autoCallSingleNumber ?? true,
          preferredCallMode: (data.settings?.preferredCallMode as "webrtc" | "live" | "voicemail") || "webrtc",
        };
        setUserSettings(normalized);
        setRememberChoice(normalized.rememberOutboundNumber);
      }
    } catch (error) {
      console.error("Error saving dialer preference:", error);
    }
  };

  const handleRememberToggle = async (checked: boolean) => {
    setRememberChoice(checked);
    if (!checked) {
      setShowNumberSelector(true);
      await persistDialerPreference(null, false);
    } else {
      const callerId = getSelectedCallerId();
      if (callerId) {
        setShowNumberSelector(false);
        await persistDialerPreference(callerId, true);
      }
    }
  };

  const handleInitiateCall = async () => {
    // Prevent double-clicks
    if (isInitiating) {
      return;
    }

    // Non-admins must have an assigned number
    if (!isAdmin && !userAssignedNumber) {
      toast.error("No phone number assigned. Contact your admin.");
      return;
    }

    if (callMode === "live" && !userPhone.trim()) {
      toast.error("Please enter your phone number");
      return;
    }

    setIsInitiating(true);
    try {
      const response = await fetch("/api/calls/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          phoneNumber: leadPhone,
          leadName,
          callMode,
          userPhone: callMode === "live" ? userPhone : undefined,
          voicemailMessage: callMode === "voicemail" ? voicemailMessage : undefined,
          twilioNumber: selectedTwilioNumber || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to initiate call");
      }

      if (callMode === "live") {
        toast.success(`Your phone will ring first. Answer to connect with ${leadName}.`);
      } else {
        toast.success(`Voicemail drop initiated to ${leadName}`);
      }

      if (rememberChoice) {
        const callerId = getSelectedCallerId();
        await persistDialerPreference(callerId || null, true);
      }

      onCallInitiated?.();
      onClose();
    } catch (error: any) {
      console.error("Error initiating call:", error);
      toast.error(error.message || "Failed to initiate call");
    } finally {
      setIsInitiating(false);
    }
  };

  const placeWebrtcCall = async (overrideCallerId?: string) => {
    const callerId = overrideCallerId || getSelectedCallerId();
    if (!callerId) {
      toast.error("Choose a caller ID first");
      return;
    }

    try {
      await makeCall(leadId, leadPhone, leadName, callerId);
      if (rememberChoice) {
        await persistDialerPreference(callerId, true);
      }
      onCallInitiated?.();
      onClose();
    } catch (error) {
      console.error("Error making WebRTC call:", error);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Call {leadName}
              </h3>
              <p className="text-sm text-gray-600">{leadPhone}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            {!callMode ? (
              <>
                <p className="text-sm text-gray-600 mb-4">
                  Choose how you want to call this lead:
                </p>

                {/* WebRTC Browser Call Option */}
                <button
                  onClick={() => setCallMode("webrtc")}
                  className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all text-left group"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg group-hover:bg-purple-200">
                      <Monitor className="h-6 w-6 text-purple-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900 mb-1">
                        Browser Call (Recommended)
                      </div>
                      <div className="text-sm text-gray-600">
                        Call directly from your computer using your microphone.
                        No phone needed. Best for office use.
                      </div>
                    </div>
                  </div>
                </button>

                {/* Live Call Option */}
                <button
                  onClick={() => setCallMode("live")}
                  className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition-all text-left group"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-green-100 rounded-lg group-hover:bg-green-200">
                      <Users className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900 mb-1">
                        Live Call (Phone)
                      </div>
                      <div className="text-sm text-gray-600">
                        Your phone rings first. Answer to talk with the lead.
                        Best for important conversations.
                      </div>
                    </div>
                  </div>
                </button>

                {/* Voicemail Drop Option */}
                <button
                  onClick={() => setCallMode("voicemail")}
                  className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200">
                      <Voicemail className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900 mb-1">
                        Voicemail Drop (Mass Outreach)
                      </div>
                      <div className="text-sm text-gray-600">
                        Automated message. Great for high-volume outreach and
                        leaving consistent messages.
                      </div>
                    </div>
                  </div>
                </button>
              </>
            ) : callMode === "webrtc" ? (
              <>
                <button
                  onClick={() => setCallMode(null)}
                  className="text-sm text-blue-600 hover:text-blue-700 mb-2"
                >
                  ← Back to options
                </button>

                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-2">
                    <Monitor className="h-5 w-5 text-purple-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-purple-800">
                      <p className="font-medium mb-1">How Browser Calls Work:</p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>Allow microphone access when prompted</li>
                        <li>Click "Call" to dial the lead</li>
                        <li>Talk directly through your computer</li>
                        <li>Call is recorded automatically</li>
                      </ol>
                    </div>
                  </div>
                </div>

                {!showNumberSelector && getSelectedCallerId() && (
                  <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          Using caller ID: {getSelectedCallerId()}
                        </div>
                        <p className="text-xs text-gray-600">
                          {rememberChoice
                            ? "Saved from your preference. Change it anytime in Settings."
                            : "Only one caller ID is available right now."}
                        </p>
                      </div>
                      <button
                        onClick={() => placeWebrtcCall()}
                        disabled={!isInitialized || !getSelectedCallerId()}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        <Phone className="h-4 w-4" />
                        Call now
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setShowNumberSelector(true)}
                        className="px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                      >
                        Change number
                      </button>
                      {!rememberChoice && (
                        <button
                          onClick={() => handleRememberToggle(true)}
                          className="px-3 py-2 text-sm border border-green-200 text-green-700 bg-green-50 rounded-lg hover:bg-green-100"
                        >
                          Remember this choice
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {(showNumberSelector || !getSelectedCallerId()) && (
                  <div className="mb-4 space-y-2">
                    <label className="block text-sm font-medium text-gray-900">
                      Call From Number
                    </label>
                    {isAdmin ? (
                      twilioNumbers.length > 0 ? (
                        <>
                          <select
                            value={selectedTwilioNumber}
                            onChange={(e) => setSelectedTwilioNumber(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            disabled={loadingNumbers}
                          >
                            {userAssignedNumber && (
                              <option value={userAssignedNumber}>
                                {userAssignedNumber} (Your Assigned)
                              </option>
                            )}
                            {twilioNumbers
                              .filter((n) => n.phoneNumber !== userAssignedNumber)
                              .map((number) => (
                                <option key={number.phoneNumber} value={number.phoneNumber}>
                                  {number.phoneNumber}
                                </option>
                              ))}
                          </select>
                          <p className="text-xs text-gray-500">
                            This number will appear as the caller ID to the lead
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-gray-500">No phone numbers available</p>
                      )
                    ) : userAssignedNumber ? (
                      <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg">
                        <span className="text-sm text-gray-700">
                          Calling from: <span className="font-medium">{userAssignedNumber}</span>
                        </span>
                      </div>
                    ) : (
                      <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-600">
                          No phone number assigned. Contact your admin.
                        </p>
                      </div>
                    )}
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={rememberChoice}
                        onChange={(e) => handleRememberToggle(e.target.checked)}
                        disabled={isLoadingSettings}
                      />
                      <span>Remember this caller ID for future calls</span>
                    </label>
                  </div>
                )}

                {(showNumberSelector || !getSelectedCallerId()) && (
                  <div className="flex flex-col items-center gap-4 p-4">
                    {!isInitialized ? (
                      <div className="text-sm text-gray-500">Initializing phone system...</div>
                    ) : (
                      <button
                        onClick={() => placeWebrtcCall()}
                        disabled={!getSelectedCallerId()}
                        className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-lg font-semibold"
                      >
                        <Phone className="h-5 w-5" />
                        Call {leadName || leadPhone}
                      </button>
                    )}
                    <p className="text-xs text-gray-500 text-center">
                      Call will appear in the panel on the right
                    </p>
                  </div>
                )}
              </>
            ) : callMode === "live" ? (
              <>
                <button
                  onClick={() => setCallMode(null)}
                  className="text-sm text-blue-600 hover:text-blue-700 mb-2"
                >
                  ← Back to options
                </button>

                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-2">
                    <Users className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-green-800">
                      <p className="font-medium mb-1">How Live Calls Work:</p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>Your phone rings first</li>
                        <li>You answer and wait</li>
                        <li>Lead's phone rings</li>
                        <li>When lead answers, you're connected</li>
                        <li>Call is recorded automatically</li>
                      </ol>
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Call From Number
                  </label>
                  {isAdmin ? (
                    twilioNumbers.length > 0 ? (
                      <>
                        <select
                          value={selectedTwilioNumber}
                          onChange={(e) => setSelectedTwilioNumber(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          disabled={loadingNumbers}
                        >
                          {userAssignedNumber && (
                            <option value={userAssignedNumber}>
                              {userAssignedNumber} (Your Assigned)
                            </option>
                          )}
                          {twilioNumbers
                            .filter((n) => n.phoneNumber !== userAssignedNumber)
                            .map((number) => (
                              <option key={number.phoneNumber} value={number.phoneNumber}>
                                {number.phoneNumber}
                              </option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                          This number will appear as the caller ID to the lead
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-gray-500">No phone numbers available</p>
                    )
                  ) : userAssignedNumber ? (
                    <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg">
                      <span className="text-sm text-gray-700">
                        Calling from: <span className="font-medium">{userAssignedNumber}</span>
                      </span>
                    </div>
                  ) : (
                    <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-600">
                        No phone number assigned. Contact your admin.
                      </p>
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-sm text-gray-700 mt-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={rememberChoice}
                      onChange={(e) => handleRememberToggle(e.target.checked)}
                      disabled={isLoadingSettings}
                    />
                    <span>Remember this caller ID for future calls</span>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Your Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={userPhone}
                    onChange={(e) => setUserPhone(e.target.value)}
                    placeholder="+1 (262) 777-0909"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    We'll call this number to connect you with the lead
                  </p>
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={() => setCallMode(null)}
                  className="text-sm text-blue-600 hover:text-blue-700 mb-2"
                >
                  ← Back to options
                </button>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-2">
                    <Voicemail className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-800">
                      <p className="font-medium mb-1">How Voicemail Drops Work:</p>
                      <p>
                        Lead receives a call and hears your pre-recorded message.
                        Great for high-volume outreach without manual calling.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Call From Number
                  </label>
                  {isAdmin ? (
                    twilioNumbers.length > 0 ? (
                      <>
                        <select
                          value={selectedTwilioNumber}
                          onChange={(e) => setSelectedTwilioNumber(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          disabled={loadingNumbers}
                        >
                          {userAssignedNumber && (
                            <option value={userAssignedNumber}>
                              {userAssignedNumber} (Your Assigned)
                            </option>
                          )}
                          {twilioNumbers
                            .filter((n) => n.phoneNumber !== userAssignedNumber)
                            .map((number) => (
                              <option key={number.phoneNumber} value={number.phoneNumber}>
                                {number.phoneNumber}
                              </option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                          This number will appear as the caller ID to the lead
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-gray-500">No phone numbers available</p>
                    )
                  ) : userAssignedNumber ? (
                    <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg">
                      <span className="text-sm text-gray-700">
                        Calling from: <span className="font-medium">{userAssignedNumber}</span>
                      </span>
                    </div>
                  ) : (
                    <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-600">
                        No phone number assigned. Contact your admin.
                      </p>
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-sm text-gray-700 mt-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={rememberChoice}
                      onChange={(e) => handleRememberToggle(e.target.checked)}
                      disabled={isLoadingSettings}
                    />
                    <span>Remember this caller ID for future calls</span>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Voicemail Message
                  </label>
                  <textarea
                    value={voicemailMessage}
                    onChange={(e) => setVoicemailMessage(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    rows={5}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    This message will be read to the lead using text-to-speech
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          {callMode && callMode !== "webrtc" && (
            <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleInitiateCall}
                disabled={isInitiating || (!isAdmin && !userAssignedNumber)}
                className={`px-4 py-2 ${
                  callMode === "live" ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"
                } text-white rounded-lg disabled:opacity-50 flex items-center gap-2`}
              >
                {isInitiating ? (
                  <>
                    <LoadingSpinner />
                    Initiating...
                  </>
                ) : (
                  <>
                    <Phone className="h-4 w-4" />
                    {callMode === "live" ? "Start Live Call" : "Send Voicemail"}
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

