"use client";

import { Phone, PhoneOff, AlertCircle } from "lucide-react";
import { useCall } from "./CallProvider";

export function CallStatusIndicator() {
  const { callState, callDuration, isInitialized, error } = useCall();

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getStatusInfo = () => {
    if (error) {
      return {
        text: "Error",
        color: "bg-red-500",
        icon: <AlertCircle className="h-3 w-3" />,
      };
    }

    if (!isInitialized) {
      return {
        text: "Connecting...",
        color: "bg-yellow-500",
        icon: <Phone className="h-3 w-3" />,
      };
    }

    switch (callState) {
      case "ringing":
        return {
          text: "Incoming Call",
          color: "bg-blue-500 animate-pulse",
          icon: <Phone className="h-3 w-3" />,
        };
      case "connecting":
        return {
          text: "Connecting...",
          color: "bg-yellow-500",
          icon: <Phone className="h-3 w-3" />,
        };
      case "connected":
        return {
          text: `On Call ${formatDuration(callDuration)}`,
          color: "bg-green-500",
          icon: <Phone className="h-3 w-3" />,
        };
      default:
        return {
          text: "Phone Ready",
          color: "bg-green-500",
          icon: <div className="h-2 w-2 rounded-full bg-white" />,
        };
    }
  };

  const status = getStatusInfo();

  return (
    <div
      className={`fixed bottom-4 right-4 z-40 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-white text-sm font-medium ${status.color} transition-all`}
    >
      <div className="flex items-center gap-2">
        {status.icon}
        <span>{status.text}</span>
      </div>
    </div>
  );
}

