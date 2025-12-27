"use client";

import { useState, useEffect } from "react";
import { LeadActivity } from "@/lib/types";
import toast from "react-hot-toast";
import { X, Activity, MessageSquare, User, Phone, Mail, MessageCircle } from "lucide-react";

interface ActivityTimelineProps {
  leadId: string;
  leadName: string;
  isOpen: boolean;
  onClose: () => void;
}

const activityIcons = {
  status_change: Activity,
  note_added: MessageSquare,
  assigned: User,
  contacted: Phone,
  email_sent: Mail,
  sms_sent: MessageCircle,
  call_made: Phone,
};

const activityColors = {
  status_change: "text-blue-600 bg-blue-100",
  note_added: "text-green-600 bg-green-100",
  assigned: "text-purple-600 bg-purple-100",
  contacted: "text-yellow-600 bg-yellow-100",
  email_sent: "text-pink-600 bg-pink-100",
  sms_sent: "text-indigo-600 bg-indigo-100",
  call_made: "text-orange-600 bg-orange-100",
};

export default function ActivityTimeline({
  leadId,
  leadName,
  isOpen,
  onClose,
}: ActivityTimelineProps) {
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && leadId) {
      fetchActivities();
    }
  }, [isOpen, leadId]);

  const fetchActivities = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/leads/${leadId}/activities`);
      if (!response.ok) throw new Error("Failed to fetch activities");

      const data = await response.json();
      setActivities(data.activities || []);
    } catch (error) {
      console.error("Error fetching activities:", error);
      toast.error("Failed to load activities");
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Side Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Activity Timeline</h2>
            <p className="text-sm text-gray-600 mt-1">{leadName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Activities List */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-500 mt-2">Loading activities...</p>
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No activities yet</p>
              <p className="text-sm text-gray-400 mt-1">
                Activity history will appear here
              </p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline Line */}
              <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-200" />

              {/* Activities */}
              <div className="space-y-6">
                {activities.map((activity) => {
                  const Icon = activityIcons[activity.activityType] || Activity;
                  const colorClass = activityColors[activity.activityType] || "text-gray-600 bg-gray-100";

                  return (
                    <div key={activity.id} className="relative flex items-start">
                      {/* Icon */}
                      <div className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-full ${colorClass}`}>
                        <Icon className="h-5 w-5" />
                      </div>

                      {/* Content */}
                      <div className="ml-4 flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {activity.description || activity.activityType.replace(/_/g, " ")}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {formatDate(activity.createdAt)}
                        </p>
                        {activity.activityData && Object.keys(activity.activityData).length > 0 && (
                          <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                            {JSON.stringify(activity.activityData, null, 2)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

