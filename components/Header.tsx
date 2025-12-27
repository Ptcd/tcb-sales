"use client";

import { MapPin, Search, History, LogOut, MessageSquare, Phone, PhoneIncoming, Mail, Settings, Trash2, Voicemail, Users, BarChart3, PlayCircle, ChevronDown, Tag, FileText, Calendar, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import NotificationsDropdown from "@/components/NotificationsDropdown";

interface HeaderProps {
  userEmail?: string;
}

export default function Header({ userEmail }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [unreadCounts, setUnreadCounts] = useState({ unreadSms: 0, unreadVoicemails: 0 });
  const [queueCounts, setQueueCounts] = useState({ sdr: 0, activator: 0 });
  const [userRole, setUserRole] = useState<"admin" | "member" | null>(null);
  const [isActivator, setIsActivator] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [showMobileMore, setShowMobileMore] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Fetch user role and unread counts on mount
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        // Fetch user role
        const profileResponse = await fetch("/api/auth/profile");
        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          setUserRole(profileData.role || "member");
          setIsActivator(profileData.is_activator || false);
        }

        // Fetch unread counts
        const countsResponse = await fetch("/api/notifications/unread-counts");
        if (countsResponse.ok) {
          const countsData = await countsResponse.json();
          setUnreadCounts(countsData.counts || { unreadSms: 0, unreadVoicemails: 0 });
        }

        // Fetch queue counts
        await fetchQueueCounts();
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    };

    const fetchQueueCounts = async () => {
      try {
        const [sdrRes, activatorRes] = await Promise.all([
          fetch("/api/pipeline/sdr-queue/count"),
          fetch("/api/pipeline/activator-queue/count"),
        ]);
        
        if (sdrRes.ok) {
          const sdrData = await sdrRes.json();
          setQueueCounts(prev => ({ ...prev, sdr: sdrData.count || 0 }));
        }
        if (activatorRes.ok) {
          const activatorData = await activatorRes.json();
          setQueueCounts(prev => ({ ...prev, activator: activatorData.count || 0 }));
        }
      } catch (error) {
        console.error("Error fetching queue counts:", error);
      }
    };

    fetchUserData();
    // Refresh counts every 30 seconds
    const interval = setInterval(async () => {
      try {
        const response = await fetch("/api/notifications/unread-counts");
        if (response.ok) {
          const data = await response.json();
          setUnreadCounts(data.counts || { unreadSms: 0, unreadVoicemails: 0 });
        }
        await fetchQueueCounts();
      } catch (error) {
        console.error("Error fetching unread counts:", error);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSignOut = async () => {
    try {
      const response = await fetch("/api/auth/signout", {
        method: "POST",
        credentials: "include",
        headers: { "Cache-Control": "no-store" },
      });

      if (response.ok) {
        if (typeof window !== "undefined") {
          window.location.replace("/login");
        } else {
          router.push("/login");
        }
      } else {
        const body = await response.json().catch(() => ({} as any));
        console.error("Sign out failed", body?.error || response.statusText);
      }
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  // Base navigation items (available to all users)
  const baseNavigation = [
    { name: "Search", href: "/dashboard", icon: Search, badge: 0, roles: ["admin", "member"] },
    { name: "Call Queue", href: "/dashboard/call-queue", icon: PlayCircle, badge: 0, roles: ["member"] },
    { name: "All Leads", href: "/dashboard/leads", icon: MapPin, badge: 0, roles: ["admin", "member"] },
    { name: "Conversations", href: "/dashboard/conversations", icon: MessageSquare, badge: unreadCounts.unreadSms, roles: ["admin", "member"] },
    { name: "Voicemails", href: "/dashboard/voicemails", icon: Voicemail, badge: unreadCounts.unreadVoicemails, roles: ["admin", "member"] },
    { name: "Search History", href: "/dashboard/history", icon: History, badge: 0, roles: ["admin", "member"] },
    { name: "SMS History", href: "/dashboard/sms-history", icon: MessageSquare, badge: 0, roles: ["admin", "member"] },
    { name: "Call History", href: "/dashboard/call-history", icon: Phone, badge: 0, roles: ["admin", "member"] },
    { name: "Email History", href: "/dashboard/email-history", icon: Mail, badge: 0, roles: ["admin", "member"] },
  ];

  // Queue navigation items - prominent for SDRs and Activators
  const queueNavigation = [
    { name: "Install Follow-ups", href: "/dashboard/pipeline/sdr-queue", icon: Calendar, badge: queueCounts.sdr, roles: ["admin", "member"], highlight: queueCounts.sdr > 0 },
    { name: "Blocked Installs", href: "/dashboard/pipeline/activator-queue", icon: AlertTriangle, badge: queueCounts.activator, roles: ["admin"], showIfActivator: true },
  ];

  // Admin-only navigation items
  const adminNavigation = [
    { name: "Team", href: "/dashboard/admin/team", icon: Users, badge: 0, roles: ["admin"] },
    { name: "Governance", href: "/dashboard/admin/governance", icon: BarChart3, badge: 0, roles: ["admin"] },
  ];

  // Additional items (all users)
  const additionalNavigation = [
    { name: "Reports", href: "/dashboard/reports", icon: FileText, badge: 0, roles: ["admin", "member"] },
    { name: "Recycle Bin", href: "/dashboard/recycle-bin", icon: Trash2, badge: 0, roles: ["admin", "member"] },
    { name: "Twilio Numbers", href: "/dashboard/phone-numbers", icon: PhoneIncoming, badge: 0, roles: ["admin", "member"] },
    { name: "Settings", href: "/dashboard/settings", icon: Settings, badge: 0, roles: ["admin", "member"] },
  ];

  // Filter queue nav based on role and activator status
  const filteredQueueNav = queueNavigation.filter((item) => {
    if (!userRole) return false;
    if (!item.roles.includes(userRole) && !(item as any).showIfActivator) return false;
    if ((item as any).showIfActivator && !isActivator && userRole !== "admin") return false;
    return true;
  });

  // Combine and filter navigation based on role
  const navigation = [
    ...baseNavigation,
    ...filteredQueueNav,
    ...(userRole === "admin" ? adminNavigation : []),
    ...additionalNavigation,
  ].filter((item) => !userRole || item.roles.includes(userRole) || (item as any).showIfActivator);

  // Keep only the essentials in the header, tuck the rest away
  // Prioritize queues when they have items
  const prioritizedNames = queueCounts.sdr > 0 || queueCounts.activator > 0
    ? ["Search", "All Leads", "Install Follow-ups", "Blocked Installs"]
    : ["Search", "All Leads", "Conversations", "Voicemails"];
  const prioritizedNav = navigation.filter((item) => prioritizedNames.includes(item.name));
  const displayedPrimary = (prioritizedNav.length > 0 ? prioritizedNav : navigation).slice(0, 4);
  const secondaryNav = navigation.filter(
    (item) => !displayedPrimary.some((primary) => primary.name === item.name)
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setIsMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isActive = (href: string) => pathname === href;

  return (
    <header className="sticky top-0 z-50 bg-gradient-to-r from-blue-600 to-indigo-700 shadow-xl">
      <div className="max-w-[98%] 2xl:max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo and Brand */}
          <div className="flex items-center">
            <Link
              href="/dashboard"
              className="flex items-center space-x-3 group"
            >
              <div className="flex items-center justify-center w-10 h-10 bg-white rounded-xl shadow-lg group-hover:scale-105 transition-transform duration-200">
                <Phone className="w-6 h-6 text-blue-600" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-lg font-bold text-white">
                  Outreach CRM
                </h1>
                <p className="text-xs text-blue-100">Lead Management & Outreach</p>
              </div>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex space-x-2 items-center">
            {displayedPrimary.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 relative ${
                    isActive(item.href)
                      ? "bg-white text-blue-700 shadow-lg"
                      : "text-white hover:bg-white/10"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.name}</span>
                  {item.badge > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
            {secondaryNav.length > 0 && (
              <div className="relative" ref={moreMenuRef}>
                <button
                  onClick={() => setIsMoreOpen((prev) => !prev)}
                  className="flex items-center space-x-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white hover:bg-white/10 transition-all duration-200"
                >
                  <span>More</span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${isMoreOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {isMoreOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl py-2 z-50">
                    {secondaryNav.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          <Icon className="w-4 h-4 text-blue-600" />
                          <span className="flex-1">{item.name}</span>
                          {item.badge > 0 && (
                            <span className="text-xs font-semibold text-blue-600">
                              {item.badge > 99 ? "99+" : item.badge}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </nav>

          {/* User Menu */}
          <div className="flex items-center space-x-2">
            {/* Notifications Bell */}
            <NotificationsDropdown />
            
            {userEmail && (
              <div className="hidden lg:block text-sm text-white/90 px-2">
                {userEmail}
              </div>
            )}
            <button
              onClick={handleSignOut}
              className="flex items-center space-x-2 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10 rounded-lg transition-all duration-200"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
              <span>Log out</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden border-t border-white/20 mt-2">
          <nav className="flex overflow-x-auto space-x-2 py-2 scrollbar-hide">
            {displayedPrimary.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    isActive(item.href)
                      ? "bg-white text-blue-700"
                      : "text-white hover:bg-white/10"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
          {secondaryNav.length > 0 && (
            <div className="px-3 pb-2">
              <button
                onClick={() => setShowMobileMore((prev) => !prev)}
                className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold text-white border border-white/30 rounded-lg"
              >
                <span>{showMobileMore ? "Hide extra" : "More"}</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${showMobileMore ? "rotate-180" : ""}`}
                />
              </button>
              {showMobileMore && (
                <div className="mt-2 space-y-1">
                  {secondaryNav.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-white/90 bg-white/10"
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.name}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <div className="px-3 pb-3">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 text-sm font-semibold text-blue-700 bg-white rounded-lg shadow hover:bg-blue-50 transition-all duration-200"
            >
              <LogOut className="w-4 h-4" />
              <span>Log out</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
