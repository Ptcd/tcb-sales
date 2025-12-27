"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { DialerMode } from "@/components/DialerMode";
import { Suspense, useState, useEffect } from "react";
import { DialerModeType } from "@/lib/types";
import { Loader2 } from "lucide-react";

function DialerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialLeadId = searchParams?.get("leadId") || undefined;
  const modeParam = searchParams?.get("mode");
  
  const [initialMode, setInitialMode] = useState<DialerModeType>("PROSPECTING");
  const [isChecking, setIsChecking] = useState(modeParam === "activation");

  // If user tries to access activation mode, verify they're an activator
  useEffect(() => {
    if (modeParam !== "activation") {
      setIsChecking(false);
      return;
    }

    const checkActivatorAccess = async () => {
      try {
        const res = await fetch("/api/auth/profile");
        const data = await res.json();
        
        if (data.success && data.is_activator) {
          setInitialMode("ACTIVATION");
        } else {
          // Not an activator - stay in prospecting mode
          console.log("User is not an activator, defaulting to PROSPECTING mode");
        }
      } catch (error) {
        console.error("Failed to check activator status:", error);
      } finally {
        setIsChecking(false);
      }
    };

    checkActivatorAccess();
  }, [modeParam]);

  const handleExit = () => {
    router.push("/dashboard");
  };

  if (isChecking) {
    return (
      <div className="fixed inset-0 bg-slate-900 z-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return <DialerMode onExit={handleExit} initialLeadId={initialLeadId} initialMode={initialMode} />;
}

export default function DialerPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen bg-slate-900 text-white">Loading dialer...</div>}>
      <DialerContent />
    </Suspense>
  );
}


