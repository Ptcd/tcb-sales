"use client";

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import * as Twilio from "@twilio/voice-sdk";
import toast from "react-hot-toast";
import { playRingtone, stopRingtone } from "@/lib/ringtone";

export type CallState = "idle" | "ringing" | "connecting" | "connected" | "ended";

interface CallContextType {
  device: Twilio.Device | null;
  call: Twilio.Call | null;
  callState: CallState;
  isMuted: boolean;
  callDuration: number; // in seconds
  error: string | null;
  incomingCall: Twilio.Call | null;
  incomingCallerId: string | null;
  outboundLeadId: string | null;
  outboundLeadPhone: string | null;
  outboundLeadName: string | null;
  isOutboundCall: boolean;
  displayPhone: string | null;
  displayName: string | null;
  makeCall: (leadId: string, phoneNumber: string, leadName?: string, twilioNumber?: string) => Promise<void>;
  answerCall: () => void;
  rejectCall: () => void;
  hangUp: () => void;
  toggleMute: () => void;
  sendDTMF: (digit: string) => void;
  isInitialized: boolean;
  isDeviceReady: boolean; // True when device is registered and ready to make/receive calls
  getCallId: () => string | null;
  getLastCallSid: () => string | null;
  resetCallState: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export function useCall() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error("useCall must be used within CallProvider");
  }
  return context;
}

interface CallProviderProps {
  children: ReactNode;
}

export function CallProvider({ children }: CallProviderProps) {
  const [device, setDevice] = useState<Twilio.Device | null>(null);
  const [call, setCall] = useState<Twilio.Call | null>(null);
  const [callState, setCallState] = useState<CallState>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<Twilio.Call | null>(null);
  const [incomingCallerId, setIncomingCallerId] = useState<string | null>(null);
  const [outboundLeadId, setOutboundLeadId] = useState<string | null>(null);
  const [outboundLeadPhone, setOutboundLeadPhone] = useState<string | null>(null);
  const [outboundLeadName, setOutboundLeadName] = useState<string | null>(null);
  const [isOutboundCall, setIsOutboundCall] = useState(false);
  const [displayPhone, setDisplayPhone] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isDeviceReady, setIsDeviceReady] = useState(false);
  
  const tokenRef = useRef<string | null>(null);
  const deviceRef = useRef<Twilio.Device | null>(null); // Keep device in ref for token refresh
  const callStartTimeRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const callIdRef = useRef<string | null>(null);
  const lastCallSidRef = useRef<string | null>(null);
  const isOutboundCallRef = useRef(false);
  // Store outbound target phone/name in refs so incoming handler can read them directly
  const outboundTargetPhoneRef = useRef<string | null>(null);
  const outboundTargetNameRef = useRef<string | null>(null);
  // Connection timeout ref - to cancel stuck "connecting" calls after 30 seconds
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track current callState in a ref so timeout callback can read it
  const callStateRef = useRef<CallState>("idle");

  // Keep callStateRef in sync with callState
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  // Cancel a stuck connection - clears timeout, cancels server-side call, resets state
  const cancelConnection = async (showToast: boolean = true) => {
    // Clear timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    
    // Try to cancel server-side call if we have a call ID
    const currentCallId = callIdRef.current;
    if (currentCallId) {
      try {
        await fetch(`/api/calls/${currentCallId}/cancel`, { method: "POST" });
      } catch (e) {
        console.error("Failed to cancel call:", e);
      }
    }
    
    // Force reset state
    setCallState("idle");
    setCall(null);
    setIncomingCall(null);
    setIncomingCallerId(null);
    setOutboundLeadId(null);
    setOutboundLeadPhone(null);
    setOutboundLeadName(null);
    setIsOutboundCall(false);
    isOutboundCallRef.current = false;
    outboundTargetPhoneRef.current = null;
    outboundTargetNameRef.current = null;
    setDisplayPhone(null);
    setDisplayName(null);
    callIdRef.current = null;
    lastCallSidRef.current = null;
    setCallDuration(0);
    callStartTimeRef.current = null;
    
    if (showToast) {
      toast.error("Connection timed out - please try again");
    }
  };

  // Lookup call ID by Twilio call SID (for inbound calls)
  const lookupCallId = async (twilioCallSid: string) => {
    try {
      const response = await fetch(`/api/calls/by-sid?twilioCallSid=${encodeURIComponent(twilioCallSid)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.call?.id) {
          callIdRef.current = data.call.id;
        }
      }
    } catch (err) {
      console.error("Error looking up call ID:", err);
    }
  };

  // Update call by CallSid (fallback when call ID not available)
  const updateCallBySid = async (twilioCallSid: string, duration: number) => {
    try {
      // First get the call ID
      const lookupResponse = await fetch(`/api/calls/by-sid?twilioCallSid=${encodeURIComponent(twilioCallSid)}`);
      if (lookupResponse.ok) {
        const lookupData = await lookupResponse.json();
        if (lookupData.call?.id) {
          // Now update using the call ID
          const updateResponse = await fetch(`/api/calls/${lookupData.call.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              duration: duration,
              status: "completed",
              ended_at: new Date().toISOString(),
            }),
          });
          
          if (updateResponse.ok) {
            console.log(`Updated call ${lookupData.call.id} (via CallSid) with duration ${duration}s`);
            callIdRef.current = lookupData.call.id; // Store for future use
          } else {
            console.error(`Failed to update call via CallSid ${twilioCallSid}:`, await updateResponse.text());
          }
        } else {
          console.warn(`Call not found for CallSid: ${twilioCallSid}`);
        }
      } else {
        console.error(`Failed to lookup call by CallSid ${twilioCallSid}:`, await lookupResponse.text());
      }
    } catch (err) {
      console.error("Error updating call by CallSid:", err);
    }
  };

  // Refresh token and update device
  const refreshToken = async () => {
    try {
      console.log("Refreshing Twilio token...");
      const response = await fetch("/api/twilio/voice/token");
      if (!response.ok) {
        throw new Error("Failed to refresh access token");
      }
      const data = await response.json();
      tokenRef.current = data.token;
      
      // Update the device with new token
      if (deviceRef.current) {
        await deviceRef.current.updateToken(data.token);
        console.log("Twilio token refreshed successfully");
      }
    } catch (err: any) {
      console.error("Error refreshing token:", err);
      setError("Failed to refresh phone connection");
      toast.error("Phone connection lost - please refresh the page");
    }
  };

  // Initialize Twilio Device
  useEffect(() => {
    let isSubscribed = true;
    
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
        deviceRef.current = newDevice;

        // Set up event handlers
        newDevice.on("registered", () => {
          console.log("Twilio Device registered");
          if (isSubscribed) {
            setError(null);
            setIsInitialized(true);
            setIsDeviceReady(true);
          }
        });

        newDevice.on("unregistered", async () => {
          console.log("Twilio Device unregistered - attempting to re-register");
          if (isSubscribed) {
            setIsDeviceReady(false);
          }
          // Attempt to re-register after a short delay
          setTimeout(async () => {
            try {
              if (deviceRef.current && isSubscribed) {
                await deviceRef.current.register();
                console.log("Successfully re-registered device");
              }
            } catch (err) {
              console.error("Failed to re-register device:", err);
              // Try refreshing token and re-registering
              await refreshToken();
              try {
                if (deviceRef.current && isSubscribed) {
                  await deviceRef.current.register();
                }
              } catch (retryErr) {
                console.error("Failed to re-register after token refresh:", retryErr);
              }
            }
          }, 1000);
        });

        // Twilio SDK fires this event ~5 mins before token expires
        newDevice.on("tokenWillExpire", async () => {
          console.log("Twilio token will expire soon - refreshing");
          await refreshToken();
        });

        newDevice.on("error", (error) => {
          console.error("Twilio Device error:", error);
          if (isSubscribed) {
            setError(error.message);
            setIsDeviceReady(false);
          }
          toast.error(`Phone error: ${error.message}`);
        });

        newDevice.on("incoming", (incomingCall: Twilio.Call) => {
          console.log("Incoming call:", incomingCall);
          console.log("isOutboundCallRef:", isOutboundCallRef.current);
          console.log("outboundTargetPhoneRef:", outboundTargetPhoneRef.current);
          
          // Clear connection timeout - call has arrived
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }
          
          // Check if we have an outbound target phone (meaning this is our outbound call coming back)
          // Use the stored target phone/name instead of the Twilio From parameter
          if (outboundTargetPhoneRef.current) {
            // This is our outbound call - use the stored target info
            console.log("Using stored outbound target:", outboundTargetPhoneRef.current);
            setDisplayPhone(outboundTargetPhoneRef.current);
            setDisplayName(outboundTargetNameRef.current);
            setIncomingCallerId(outboundTargetPhoneRef.current);
          } else {
            // This is a true inbound call - use the caller ID from Twilio
            const callerId = incomingCall.parameters?.From || null;
            console.log("True inbound call from:", callerId);
            setIncomingCallerId(callerId);
            setDisplayPhone(callerId);
            setDisplayName(null); // will be looked up by panel
          }
          setIncomingCall(incomingCall);
          setCall(incomingCall);
          setCallState("ringing");
          
          // Try to lookup call ID immediately using CallSid from parameters
          // Try multiple possible parameter names
          const callSid = incomingCall.parameters?.CallSid || 
                         incomingCall.parameters?.callSid ||
                         incomingCall.parameters?.CallSID;
          if (callSid) {
            // Store CallSid in ref so it persists after call object is cleared
            lastCallSidRef.current = callSid;
            lookupCallId(callSid);
          }
          
          // Play ringtone
          playRingtone();
        });

        // Register the device
        try {
          await newDevice.register();
        } catch (registerError: any) {
          console.error("Failed to register Twilio Device:", registerError);
          throw new Error(registerError.message || "Failed to register phone");
        }

        if (isSubscribed) {
          setDevice(newDevice);
        }

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
      } catch (err: any) {
        console.error("Error initializing device:", err);
        if (isSubscribed) {
          setError(err.message);
          setIsDeviceReady(false);
        }
        toast.error(`Failed to initialize phone: ${err.message}`);
      }
    }

    initializeDevice();

    // Cleanup on unmount
    return () => {
      isSubscribed = false;
      if (deviceRef.current) {
        deviceRef.current.destroy();
        deviceRef.current = null;
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

  // Re-register device when tab becomes visible (handles browser throttling)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible" && deviceRef.current) {
        console.log("Tab became visible - checking device registration");
        // Check if device needs re-registration
        if (deviceRef.current.state !== "registered") {
          console.log("Device not registered, attempting to re-register...");
          setIsDeviceReady(false);
          try {
            await deviceRef.current.register();
            console.log("Device re-registered after tab focus");
          } catch (err) {
            console.error("Failed to re-register on tab focus:", err);
            // Try refreshing token first
            await refreshToken();
            try {
              await deviceRef.current.register();
            } catch (retryErr) {
              console.error("Failed to re-register after token refresh:", retryErr);
              toast.error("Phone disconnected - please refresh the page");
            }
          }
        } else {
          setIsDeviceReady(true);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Set up call event handlers
  useEffect(() => {
    if (!call) return;

    const handleDisconnect = async () => {
      console.log("Call disconnected");
      stopRingtone();
      
      // Calculate final duration before clearing
      let finalDuration = 0;
      if (callStartTimeRef.current) {
        finalDuration = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
      }
      
      // Update call record in database with duration and status
      const currentCallId = callIdRef.current;
      const callSid = lastCallSidRef.current;
      
      // Try to update using call ID first (most reliable)
      if (currentCallId) {
        try {
          const response = await fetch(`/api/calls/${currentCallId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              duration: finalDuration,
              status: "completed",
              ended_at: new Date().toISOString(),
            }),
          });
          
          if (response.ok) {
            console.log(`Updated call ${currentCallId} with duration ${finalDuration}s`);
          } else {
            console.error(`Failed to update call ${currentCallId}:`, await response.text());
            // Fall back to CallSid lookup if call ID update fails
            if (callSid) {
              await updateCallBySid(callSid, finalDuration);
            }
          }
        } catch (err) {
          console.error("Error updating call duration:", err);
          // Fall back to CallSid lookup if call ID update fails
          if (callSid) {
            await updateCallBySid(callSid, finalDuration);
          }
        }
      } else if (callSid) {
        // If we don't have call ID yet, try to update using CallSid
        console.log("No call ID yet, trying to update using CallSid:", callSid);
        await updateCallBySid(callSid, finalDuration);
      } else {
        console.warn("Cannot update call - no call ID or CallSid available");
      }
      
      setCall(null);
      setIncomingCall(null);
      // Keep incomingCallerId so summary can show lead info
      setCallState("ended");
      setIsMuted(false);
      // Keep the duration visible until summary is saved
      // Don't reset callDuration here - let it stay for the summary
      callStartTimeRef.current = null;
      
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      // Don't auto-reset to idle - let ActiveCallPanel control when to reset
      // after summary is saved/skipped
    };

    const handleReject = () => {
      console.log("Call rejected");
      stopRingtone();
      setCall(null);
      setIncomingCall(null);
      setIncomingCallerId(null);
      setCallState("idle");
    };

    const handleAccept = () => {
      console.log("Call accepted");
      stopRingtone();
      setCallState("connected");
      callStartTimeRef.current = Date.now();
      
      // Lookup call ID if we don't have it (for inbound calls)
      // Try multiple possible parameter names
      if (!callIdRef.current) {
        const callSid = call.parameters?.CallSid || 
                       call.parameters?.callSid ||
                       call.parameters?.CallSID ||
                       lastCallSidRef.current;
        if (callSid) {
          // Store CallSid in ref if not already stored
          if (!lastCallSidRef.current) {
            lastCallSidRef.current = callSid;
          }
          lookupCallId(callSid);
        }
      }
      
      // Start duration timer
      durationIntervalRef.current = setInterval(() => {
        if (callStartTimeRef.current) {
          const elapsed = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
          setCallDuration(elapsed);
        }
      }, 1000);
    };

    call.on("disconnect", handleDisconnect);
    call.on("reject", handleReject);
    call.on("cancel", handleDisconnect);
    call.on("accept", handleAccept);
    call.on("error", (error) => {
      console.error("Call error:", error);
      toast.error(`Call error: ${error.message}`);
      handleDisconnect();
    });

    return () => {
      call.off("disconnect", handleDisconnect);
      call.off("reject", handleReject);
      call.off("cancel", handleDisconnect);
      call.off("accept", handleAccept);
    };
  }, [call]);

  const makeCall = async (leadId: string, phoneNumber: string, leadName?: string, twilioNumber?: string) => {
    if (!device) {
      toast.error("Phone system not ready");
      return;
    }

    if (call) {
      toast.error("Call already in progress");
      return;
    }

    // Pre-call device registration check
    if (device.state !== "registered") {
      console.log("Device not registered, attempting to re-register before call...");
      toast.loading("Reconnecting phone...", { id: "reconnecting" });
      
      try {
        // Try to register
        await device.register();
        toast.success("Phone reconnected!", { id: "reconnecting" });
        setIsDeviceReady(true);
      } catch (regErr) {
        console.error("Failed to register before call:", regErr);
        // Try refreshing token and registering again
        try {
          await refreshToken();
          await device.register();
          toast.success("Phone reconnected!", { id: "reconnecting" });
          setIsDeviceReady(true);
        } catch (retryErr) {
          console.error("Failed to reconnect phone:", retryErr);
          toast.error("Phone not connected - please refresh the page", { id: "reconnecting" });
          setIsDeviceReady(false);
          return;
        }
      }
    }

    // Store target phone/name in refs FIRST - incoming handler will read these
    outboundTargetPhoneRef.current = phoneNumber;
    outboundTargetNameRef.current = leadName || null;
    isOutboundCallRef.current = true;

    // Set display values
    setDisplayPhone(phoneNumber);
    setDisplayName(leadName || null);

    // Set outbound details
    setIncomingCallerId(phoneNumber);
    setOutboundLeadId(leadId);
    setOutboundLeadPhone(phoneNumber);
    setOutboundLeadName(leadName || null);
    setIsOutboundCall(true);
    setCallState("connecting");
    setError(null);

    // Start connection timeout - if call doesn't connect within 30 seconds, auto-cancel
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
    }
    connectionTimeoutRef.current = setTimeout(() => {
      // Check if still in connecting state (use ref to get current value)
      if (callStateRef.current === "connecting") {
        console.log("Connection timeout - cancelling stuck call");
        cancelConnection(true);
      }
    }, 30000); // 30 seconds

    try {
      // Initiate call via API
      const response = await fetch("/api/calls/webrtc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          phoneNumber,
          leadName,
          twilioNumber,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to initiate call");
      }

      const result = await response.json();
      
      // Store the call ID for later
      if (result.call?.id) {
        callIdRef.current = result.call.id;
      }

      toast.success(`Calling ${leadName || phoneNumber}...`);
    } catch (err: any) {
      console.error("Error making call:", err);
      setError(err.message);
      toast.error(`Failed to make call: ${err.message}`);
      setCallState("idle");
    }
  };

  const answerCall = () => {
    if (call && callState === "ringing") {
      call.accept();
      setIncomingCall(null);
    }
  };

  const rejectCall = () => {
    if (call) {
      stopRingtone();
      call.reject();
      setCall(null);
      setIncomingCall(null);
      setIncomingCallerId(null);
      setCallState("idle");
    }
  };

  const hangUp = () => {
    // Clear any pending connection timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    
    if (call) {
      call.disconnect();
    } else if (callState === "connecting") {
      // Force cancel if stuck in connecting state with no call object
      // This happens when Twilio's "incoming" event never fires
      console.log("Force cancelling stuck connecting call");
      cancelConnection(false); // Don't show timeout toast since user initiated
      toast.success("Call cancelled");
    }
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

  const sendDTMF = (digit: string) => {
    if (call && callState === "connected") {
      call.sendDigits(digit);
    }
  };

  // Expose call ID via context
  const getCallId = () => callIdRef.current;

  // Expose last CallSid via context (for retry lookup after call ends)
  const getLastCallSid = () => lastCallSidRef.current;

  // Reset call state (called after summary is saved/skipped)
  const resetCallState = () => {
    setCallState("idle");
    setCall(null);
    setIncomingCall(null);
    setIncomingCallerId(null);
    setOutboundLeadId(null);
    setOutboundLeadPhone(null);
    setOutboundLeadName(null);
    setIsOutboundCall(false);
    isOutboundCallRef.current = false;
    outboundTargetPhoneRef.current = null;
    outboundTargetNameRef.current = null;
    setDisplayPhone(null);
    setDisplayName(null);
    callIdRef.current = null;
    lastCallSidRef.current = null;
    setCallDuration(0);
    callStartTimeRef.current = null;
  };

  const value: CallContextType = {
    device,
    call,
    callState,
    isMuted,
    callDuration,
    error,
    incomingCall,
    incomingCallerId,
    outboundLeadId,
    outboundLeadPhone,
    outboundLeadName,
    isOutboundCall,
    displayPhone,
    displayName,
    makeCall,
    answerCall,
    rejectCall,
    hangUp,
    toggleMute,
    sendDTMF,
    isInitialized,
    isDeviceReady,
    getCallId,
    getLastCallSid,
    resetCallState,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

