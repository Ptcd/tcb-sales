"use client";

import { useState, useEffect, useRef } from "react";
import { Bell, Clock, Zap, CreditCard, Calendar, Star, Activity, X, CheckCheck, Lock, Eye, Settings, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import type { LeadNotification } from "@/lib/types";

interface NotificationsDropdownProps {
  className?: string;
}

export default function NotificationsDropdown({ className = "" }: NotificationsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<LeadNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      const response = await fetch("/api/notifications/lead-notifications?unread_only=true&limit=10");
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unread_count || 0);
      }
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  };

  // Initial fetch and polling
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Poll every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Mark notification as read and navigate to lead
  const handleNotificationClick = async (notification: LeadNotification) => {
    // Mark as read
    try {
      await fetch("/api/notifications/lead-notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification_ids: [notification.id] }),
      });
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }

    // Update local state
    setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    setIsOpen(false);

    // Navigate to leads page with the lead selected
    router.push(`/dashboard/leads?highlight=${notification.leadId}`);
  };

  // Mark all as read
  const handleMarkAllRead = async () => {
    setIsLoading(true);
    try {
      await fetch("/api/notifications/lead-notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mark_all_read: true }),
      });
      setNotifications([]);
      setUnreadCount(0);
    } catch (error) {
      console.error("Error marking all as read:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getEventIcon = (eventType: string | undefined | null) => {
    switch (eventType) {
      case "trial_started":
        return <Clock className="h-4 w-4 text-blue-500" />;
      case "password_set":
        return <Lock className="h-4 w-4 text-blue-400" />;
      case "first_login":
      case "trial_activated": // Legacy
        return <Zap className="h-4 w-4 text-indigo-500" />;
      case "calculator_viewed":
        return <Eye className="h-4 w-4 text-indigo-400" />;
      case "calculator_modified":
        return <Settings className="h-4 w-4 text-indigo-600" />;
      case "embed_snippet_copied":
        return <Copy className="h-4 w-4 text-purple-400" />;
      case "first_lead_received":
      case "snippet_installed": // Legacy
        return <Star className="h-4 w-4 text-purple-500" />;
      case "trial_qualified":
        return <Zap className="h-4 w-4 text-indigo-500" />;
      case "credits_low":
        return <CreditCard className="h-4 w-4 text-amber-500" />;
      case "trial_expiring":
        return <Calendar className="h-4 w-4 text-orange-500" />;
      case "paid_subscribed":
        return <Star className="h-4 w-4 text-green-500 fill-green-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getEventTitle = (eventType: string | undefined | null): string => {
    if (!eventType) return "Notification";
    switch (eventType) {
      case "trial_started":
        return "Trial Started";
      case "password_set":
        return "Password Set";
      case "first_login":
      case "trial_activated": // Legacy
        return "Trial Activated";
      case "calculator_viewed":
        return "Calculator Viewed";
      case "calculator_modified":
        return "Calculator Modified";
      case "embed_snippet_copied":
        return "Embed Code Copied";
      case "first_lead_received":
        return "First Lead Received";
      case "snippet_installed": // Legacy
        return "Snippet Installed";
      case "trial_qualified":
        return "Trial Qualified";
      case "credits_low":
        return "Credits Low";
      case "trial_expiring":
        return "Trial Expiring";
      case "paid_subscribed":
        return "Paid Subscription";
      default:
        return eventType.replace(/_/g, " ");
    }
  };

  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex items-center justify-center w-10 h-10 rounded-lg text-white hover:bg-white/10 transition-colors"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h3 className="font-semibold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={isLoading}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
              >
                <CheckCheck className="w-3 h-3" />
                Mark all read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-8 text-center">
                <Bell className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">No new notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className="w-full flex items-start gap-3 p-4 hover:bg-gray-50 text-left transition-colors"
                  >
                    <div className="p-2 bg-gray-100 rounded-full flex-shrink-0">
                      {getEventIcon(notification.eventType)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {getEventTitle(notification.eventType)}
                      </p>
                      <p className="text-sm text-gray-600 truncate">
                        {notification.leadName || "Unknown Lead"}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatTimeAgo(notification.createdAt)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-gray-200 px-4 py-2 bg-gray-50">
              <button
                onClick={() => {
                  setIsOpen(false);
                  router.push("/dashboard/leads");
                }}
                className="w-full text-center text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                View all leads
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

