"use client";

import { useState, useEffect } from "react";
import { RefreshCw, Phone, Loader2 } from "lucide-react";
import Link from "next/link";

export default function FollowUpsDueCard() {
  const [count, setCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchFollowUps();
  }, []);

  const fetchFollowUps = async () => {
    try {
      const response = await fetch("/api/leads/followups?scope=mine");
      if (response.ok) {
        const data = await response.json();
        setCount(data.count || 0);
      }
    } catch (error) {
      console.error("Error fetching follow-ups:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Don't show if loading or no follow-ups
  if (isLoading) {
    return (
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200 p-6 mb-4">
        <div className="flex items-center justify-center py-2">
          <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
        </div>
      </div>
    );
  }

  if (count === 0) {
    return null; // Hide card if no follow-ups due
  }

  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200 p-6 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
            <RefreshCw className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-amber-700">{count}</span>
              <span className="text-lg font-semibold text-amber-600">Follow-Ups Due</span>
            </div>
            <p className="text-sm text-amber-600/80">
              These will be called first when you click Start Dialing
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/dialer"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg transition-colors"
        >
          <Phone className="h-4 w-4" />
          Start Follow-Ups
        </Link>
      </div>
    </div>
  );
}


