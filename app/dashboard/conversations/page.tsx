"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { MessageSquare, Send, User, Search, Phone, Mail, MapPin, ExternalLink, Plus, X, Filter, Eye, Clock } from "lucide-react";
import toast from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useSearchParams, useRouter } from "next/navigation";
import { QuickEmailModal } from "@/components/QuickEmailModal";

type MessageType = "all" | "sms" | "email";

interface Conversation {
  lead_id: string;
  lead_name: string;
  lead_phone: string;
  lead_email?: string;
  lead_address: string | null;
  lead_source: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  message_count: number;
  sms_count?: number;
  email_count?: number;
  unread_count: number;
  last_message_at: string;
  last_message: string;
  last_message_direction: "inbound" | "outbound";
  last_message_type?: "sms" | "email";
}

interface Message {
  id: string;
  message: string;
  direction: "inbound" | "outbound";
  sent_at: string;
  status: string;
  is_read: boolean;
  type: "sms" | "email";
  // Email-specific fields
  html_content?: string;
  text_content?: string;
  from_email?: string;
  to_email?: string;
  thread_id?: string;
  opened_at?: string;
  clicked_at?: string;
}

interface Lead {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  email: string | null;
  website: string | null;
  lead_status: string;
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [lead, setLead] = useState<Lead | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showNewConversationModal, setShowNewConversationModal] = useState(false);
  const [availableLeads, setAvailableLeads] = useState<Array<{ id: string; name: string; phone: string; email?: string }>>([]);
  const [leadSearchTerm, setLeadSearchTerm] = useState("");
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [messageTypeFilter, setMessageTypeFilter] = useState<MessageType>("all");
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);
  const [smsTemplates, setSmsTemplates] = useState<Array<{ id: string; name: string; message: string; campaignId?: string; campaignName?: string }>>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const isFetchingMessagesRef = useRef<string | null>(null);
  const lastSyncedMessageIdRef = useRef<string | null>(null);
  const hasAutoSelectedRef = useRef(false); // Track if we've done initial auto-select
  const selectedLeadIdRef = useRef<string | null>(null); // Track selected lead to preserve during updates
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    fetchConversations();
    fetchCurrentUser();
    fetchSmsTemplates();
  }, [messageTypeFilter]);

  const fetchSmsTemplates = async () => {
    try {
      // Fetch SMS templates - the API already filters by user's campaign membership
      const response = await fetch("/api/sms/templates");
      if (response.ok) {
        const data = await response.json();
        setSmsTemplates(data.templates || []);
      }
    } catch (error) {
      console.error("Error fetching SMS templates:", error);
    }
  };

  // Re-fetch messages when filter changes
  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.lead_id);
    }
  }, [messageTypeFilter]);

  const fetchCurrentUser = async () => {
    try {
      const response = await fetch("/api/auth/user");
      if (response.ok) {
        const data = await response.json();
        setCurrentUserId(data.user?.id || null);
      }
    } catch (error) {
      console.error("Error fetching current user:", error);
    }
  };

  // Handle leadId query param
  useEffect(() => {
    const leadIdParam = searchParams.get("leadId");
    
    if (!leadIdParam || isLoading) return;
    
    // Check if conversation already exists in the list
    const existingConv = conversations.find((conv) => conv.lead_id === leadIdParam);
    if (existingConv) {
      setSelectedConversation(existingConv);
      selectedLeadIdRef.current = existingConv.lead_id;
      // Clean up URL only if conversation exists in DB
      router.replace("/dashboard/conversations");
      return;
    }
    
    // If no existing conversation by leadId, try to find by phone number
    const phoneParam = searchParams.get("phone");
    if (!existingConv && phoneParam) {
      const existingByPhone = conversations.find(
        (conv) => conv.lead_phone.replace(/\D/g, "") === phoneParam.replace(/\D/g, "")
      );
      if (existingByPhone) {
        setSelectedConversation(existingByPhone);
        selectedLeadIdRef.current = existingByPhone.lead_id;
        router.replace("/dashboard/conversations");
        return;
      }
    }
    
    // No existing conversation - fetch lead info for display
    // But DON'T create temp conversation, DON'T clean up URL
    const nameParam = searchParams.get("name");
    
    if (phoneParam && nameParam) {
      // Just set the lead state for the header display
      setLead({
        id: leadIdParam,
        name: decodeURIComponent(nameParam),
        phone: decodeURIComponent(phoneParam),
        address: null,
        email: null,
        website: null,
        lead_status: "new",
      });
      setMessages([]);
      setSelectedConversation(null);
      selectedLeadIdRef.current = null;
    } else {
      // Try to fetch lead from API
      fetch(`/api/leads/${leadIdParam}`)
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data?.lead) {
            setLead(data.lead);
            setMessages([]);
            setSelectedConversation(null);
            selectedLeadIdRef.current = null;
          }
        })
        .catch(console.error);
    }
  }, [searchParams, router, isLoading]);

  // Auto-focus message input when autoFocus param is present
  useEffect(() => {
    const autoFocus = searchParams.get("autoFocus");
    const leadIdParam = searchParams.get("leadId");
    
    if (autoFocus === "true" && leadIdParam && !isLoading) {
      setTimeout(() => {
        messageInputRef.current?.focus();
      }, 100);
    }
  }, [searchParams, isLoading]);

  useEffect(() => {
    // Poll for new messages every 5 seconds
    const interval = setInterval(() => {
      fetchConversations();
      if (selectedConversation) {
        fetchMessages(selectedConversation.lead_id);
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [selectedConversation]);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.lead_id);
    }
  }, [selectedConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Keep sidebar in sync whenever messages update
  useEffect(() => {
    if (!selectedConversation || messages.length === 0) return;

    const latest = messages[messages.length - 1];

    // Avoid redundant updates that trigger renders/loops
    if (lastSyncedMessageIdRef.current === latest.id) return;

    setConversations((prev) =>
      prev.map((c) =>
        c.lead_id === selectedConversation.lead_id &&
        (c.last_message_at !== latest.sent_at ||
          c.last_message !== latest.message ||
          c.last_message_direction !== latest.direction)
          ? {
              ...c,
              last_message_at: latest.sent_at,
              last_message: latest.message,
              last_message_direction: latest.direction,
            }
          : c
      )
    );

    setSelectedConversation((prev) => {
      if (!prev || prev.lead_id !== selectedConversation.lead_id) return prev;
      if (
        prev.last_message_at === latest.sent_at &&
        prev.last_message === latest.message &&
        prev.last_message_direction === latest.direction
      ) {
        return prev;
      }
      return {
        ...prev,
        last_message_at: latest.sent_at,
        last_message: latest.message,
        last_message_direction: latest.direction,
      };
    });

    lastSyncedMessageIdRef.current = latest.id;
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchConversations = async () => {
    try {
      // Add cache-busting to ensure fresh data
      const response = await fetch(`/api/conversations?type=${messageTypeFilter}&_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!response.ok) throw new Error("Failed to fetch conversations");

      const data = await response.json();
      const newConversations = data.conversations || [];
      
      // If we have a selected conversation, update it with fresh data from the API
      // Match by lead_id OR by phone number (in case the API returned a different lead_id for same phone)
      if (selectedConversation) {
        const selectedPhone = selectedConversation.lead_phone?.replace(/\D/g, "").slice(-10);
        const updatedSelected = newConversations.find(
          (c: Conversation) => 
            c.lead_id === selectedConversation.lead_id ||
            (selectedPhone && c.lead_phone?.replace(/\D/g, "").slice(-10) === selectedPhone)
        );
        if (updatedSelected) {
          // Update the selected conversation with fresh data but keep the lead_id stable
          setSelectedConversation({
            ...updatedSelected,
            lead_id: selectedConversation.lead_id, // Keep original lead_id for consistency
          });
          // Also update this conversation in the list with the original lead_id
          const idx = newConversations.findIndex((c: Conversation) => c.lead_id === updatedSelected.lead_id);
          if (idx >= 0) {
            newConversations[idx] = {
              ...newConversations[idx],
              lead_id: selectedConversation.lead_id,
            };
          }
        }
      }
      
      setConversations(newConversations);
      
      // Only auto-select ONCE on initial load, not during polling
      const leadIdParam = searchParams.get("leadId");
      if (!hasAutoSelectedRef.current && !leadIdParam && newConversations.length > 0 && !selectedLeadIdRef.current) {
        hasAutoSelectedRef.current = true;
        setSelectedConversation(newConversations[0]);
        selectedLeadIdRef.current = newConversations[0].lead_id;
      }
    } catch (error) {
      console.error("Error fetching conversations:", error);
      toast.error("Failed to load conversations");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMessages = async (leadId: string) => {
    // Prevent duplicate fetches for the same lead that can stack up when switching quickly
    if (isFetchingMessagesRef.current === leadId) return;
    isFetchingMessagesRef.current = leadId;

    try {
      // Add cache-busting to ensure fresh data
      const response = await fetch(`/api/conversations/${leadId}?type=${messageTypeFilter}&_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!response.ok) throw new Error("Failed to fetch messages");

      const data = await response.json();
      setMessages(data.messages || []);
      setLead(data.lead);

      // Keep conversation list in sync with latest message timestamp/content
      const latest = (data.messages || []).slice(-1)[0];
      if (latest) {
        setConversations((prev) =>
          prev.map((c) =>
            c.lead_id === leadId
              ? {
                  ...c,
                  last_message_at: latest.sent_at,
                  last_message: latest.message,
                  last_message_direction: latest.direction,
                }
              : c
          )
        );
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
      toast.error("Failed to load messages");
    } finally {
      isFetchingMessagesRef.current = null;
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;
    
    // Determine leadId from either selectedConversation or URL params
    const leadId = selectedConversation?.lead_id || searchParams.get("leadId");
    if (!leadId) return;
    
    const messageText = newMessage.trim();
    
    // Optimistic UI update - add message to local state immediately
    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      message: messageText,
      direction: "outbound",
      sent_at: new Date().toISOString(),
      status: "sending",
      is_read: true,
      type: "sms",
    };
    setMessages(prev => [...prev, optimisticMessage]);
    setNewMessage("");
    
    setIsSending(true);
    try {
      const response = await fetch(`/api/conversations/${leadId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: messageText,
          phone: lead?.phone || searchParams.get("phone") || selectedConversation?.lead_phone,
          name: lead?.name || searchParams.get("name") || selectedConversation?.lead_name,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        // Remove optimistic message on error
        setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
        const errorMsg = error.details ? `${error.error}: ${error.details}` : error.error;
        throw new Error(errorMsg || "Failed to send message");
      }

      const result = await response.json();
      
      // Replace optimistic message with real one from server
      if (result.data?.savedMessage) {
        setMessages(prev => prev.map(m => 
          m.id === optimisticMessage.id ? result.data.savedMessage : m
        ));
      }
      
      // If this was a new conversation (from URL params), clean up URL now
      const wasNewConversation = searchParams.get("leadId");
      if (wasNewConversation) {
        router.replace("/dashboard/conversations");
      }
      
      // Refresh conversations list (for sidebar update)
      const conversationsResponse = await fetch("/api/conversations");
      const conversationsData = await conversationsResponse.json();
      const updatedConversations = conversationsData.conversations || [];
      setConversations(updatedConversations);
      
      // Only set selectedConversation if it's a NEW conversation (not already selected)
      // This prevents the useEffect from re-fetching and overwriting our optimistic message
      if (!selectedConversation) {
        const newConv = updatedConversations.find((conv: Conversation) => conv.lead_id === leadId);
        if (newConv) {
          setSelectedConversation(newConv);
          selectedLeadIdRef.current = newConv.lead_id;
        }
      }
      
      toast.success("Message sent!");
    } catch (error: any) {
      console.error("Error sending message:", error);
      toast.error(error.message || "Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const fetchLeadsForNewConversation = async (search: string) => {
    setIsLoadingLeads(true);
    try {
      const response = await fetch(`/api/leads?limit=20`);
      if (!response.ok) throw new Error("Failed to fetch leads");

      const data = await response.json();
      const searchLower = search.toLowerCase();
      const filtered = (data.leads || [])
        .filter((lead: any) => {
          if (!lead.phone) return false;
          const nameMatch = lead.name?.toLowerCase().includes(searchLower);
          const phoneMatch = lead.phone?.includes(search);
          return nameMatch || phoneMatch;
        })
        .slice(0, 10)
        .map((lead: any) => ({
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
        }));

      setAvailableLeads(filtered);
    } catch (error) {
      console.error("Error fetching leads:", error);
      toast.error("Failed to load leads");
    } finally {
      setIsLoadingLeads(false);
    }
  };

  const sortedConversations = useMemo(
    () =>
      [...conversations].sort(
        (a, b) =>
          new Date(b.last_message_at).getTime() -
          new Date(a.last_message_at).getTime()
      ),
    [conversations]
  );

  const filteredConversations = useMemo(() => {
    return sortedConversations.filter((conv) => {
      if (!searchTerm) return true;
      const searchLower = searchTerm.toLowerCase();
      return (
        conv.lead_name.toLowerCase().includes(searchLower) ||
        conv.lead_phone.includes(searchTerm) ||
        conv.last_message.toLowerCase().includes(searchLower)
      );
    });
  }, [sortedConversations, searchTerm]);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (days === 1) {
      return "Yesterday";
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString([], { 
      month: "short", 
      day: "numeric", 
      hour: "2-digit", 
      minute: "2-digit" 
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <MessageSquare className="h-8 w-8 text-blue-600" />
                <h1 className="text-3xl font-bold text-gray-900">Conversations</h1>
              </div>
              <p className="text-gray-600 mt-1">SMS and email conversations with your leads</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Message Type Filter */}
              <div className="flex items-center bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setMessageTypeFilter("all")}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                    messageTypeFilter === "all"
                      ? "bg-white text-blue-600 shadow"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setMessageTypeFilter("sms")}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-1.5 ${
                    messageTypeFilter === "sms"
                      ? "bg-white text-blue-600 shadow"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <Phone className="h-3.5 w-3.5" />
                  SMS
                </button>
                <button
                  onClick={() => setMessageTypeFilter("email")}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-1.5 ${
                    messageTypeFilter === "email"
                      ? "bg-white text-blue-600 shadow"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <Mail className="h-3.5 w-3.5" />
                  Email
                </button>
              </div>
              <button
                onClick={() => setShowNewConversationModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
              >
                <Plus className="h-5 w-5" />
                New Conversation
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden" style={{ height: "calc(100vh - 220px)" }}>
          <div className="flex h-full">
            {/* Conversations List */}
            <div className="w-full md:w-1/3 border-r border-gray-200 flex flex-col">
              {/* Search */}
              <div className="p-4 border-b border-gray-200">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search conversations..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Conversations */}
              <div className="flex-1 overflow-y-auto">
                {filteredConversations.length === 0 ? (
                  <div className="p-8 text-center">
                    <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No Conversations</h3>
                    <p className="text-gray-600">
                      {searchTerm
                        ? "No conversations match your search"
                        : "Start a conversation by sending an SMS to a lead"}
                    </p>
                  </div>
                ) : (
                  filteredConversations.map((conv) => {
                    const isMyConversation = conv.assigned_to === currentUserId;
                    const isOtherUserConversation = conv.assigned_to && conv.assigned_to !== currentUserId;
                    const isSelected = selectedConversation?.lead_id === conv.lead_id;
                    const hasUnread = conv.unread_count > 0;

                    const baseBorder = isMyConversation
                      ? "border-l-4 border-l-blue-500"
                      : "border-l-4 border-l-gray-300";
                    const selectedBorder = isMyConversation
                      ? "border-l-4 border-l-blue-600"
                      : "border-l-4 border-l-gray-400";
                    const hoverClass = hasUnread && !isSelected
                      ? "hover:bg-amber-100"
                      : isMyConversation
                        ? "hover:bg-blue-50"
                        : "hover:bg-gray-50";

                    return (
                      <div
                        key={conv.lead_id}
                        onClick={() => {
                          setSelectedConversation(conv);
                          selectedLeadIdRef.current = conv.lead_id;
                          // Optimistically clear unread for this conversation
                          setConversations((prev) =>
                            prev.map((c) =>
                              c.lead_id === conv.lead_id ? { ...c, unread_count: 0 } : c
                            )
                          );
                        }}
                        className={`p-4 border-b border-gray-200 cursor-pointer transition-colors ${hoverClass} ${
                          isSelected
                            ? `${selectedBorder} ${isMyConversation ? "bg-blue-50" : "bg-gray-50"}`
                            : hasUnread
                              ? `${baseBorder} bg-amber-50`
                              : baseBorder
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0">
                            <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
                              isMyConversation
                                ? "bg-blue-100"
                                : "bg-gray-100"
                            }`}>
                              <User className={`h-6 w-6 ${
                                isMyConversation
                                  ? "text-blue-600"
                                  : "text-gray-600"
                              }`} />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-semibold text-gray-900 truncate">
                                  {conv.lead_name}
                                </h3>
                                {isOtherUserConversation && conv.assigned_to_name && conv.assigned_to_name !== "Unknown" && (
                                  <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-700 rounded-full">
                                    {conv.assigned_to_name}'s lead
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-gray-500">
                                {formatTime(conv.last_message_at)}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 truncate mt-0.5">
                              {conv.lead_phone}
                            </p>
                            <p className={`text-sm mt-1 truncate ${conv.unread_count > 0 ? "font-semibold text-gray-900" : "text-gray-600"}`}>
                              {conv.last_message_direction === "inbound" ? "↓ " : "↑ "}
                              {conv.last_message_type === "email" && (
                                <Mail className="inline h-3 w-3 mr-1 text-purple-500" />
                              )}
                              {conv.last_message_type === "sms" && (
                                <Phone className="inline h-3 w-3 mr-1 text-blue-500" />
                              )}
                              {conv.last_message}
                            </p>
                          </div>
                          {conv.unread_count > 0 && (
                            <div className="flex-shrink-0">
                              <span className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-white text-xs font-bold ${
                                isMyConversation
                                  ? "bg-blue-600"
                                  : "bg-gray-500"
                              }`}>
                                {conv.unread_count}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Messages Panel */}
            <div className="hidden md:flex md:w-2/3 flex-col">
              {(selectedConversation && lead) || (searchParams.get("leadId") && lead) ? (
                <>
                  {/* Lead Header */}
                  <div className="p-4 border-b border-gray-200 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-bold text-gray-900">{lead.name}</h2>
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                          <div className="flex items-center gap-1">
                            <Phone className="h-4 w-4" />
                            <a href={`tel:${lead.phone}`} className="hover:text-blue-600">
                              {lead.phone}
                            </a>
                          </div>
                          {lead.email && (
                            <div className="flex items-center gap-1">
                              <Mail className="h-4 w-4" />
                              <a href={`mailto:${lead.email}`} className="hover:text-blue-600">
                                {lead.email}
                              </a>
                            </div>
                          )}
                          {lead.website && (
                            <a href={lead.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-blue-600">
                              <ExternalLink className="h-4 w-4" />
                              Website
                            </a>
                          )}
                        </div>
                        {lead.address && (
                          <div className="flex items-center gap-1 mt-1 text-sm text-gray-600">
                            <MapPin className="h-4 w-4" />
                            <span>{lead.address}</span>
                          </div>
                        )}
                      </div>
                      {/* Quick Actions */}
                      {lead.email && (
                        <button
                          onClick={() => setShowEmailModal(true)}
                          className="px-3 py-2 text-sm font-medium text-purple-700 bg-purple-100 rounded-lg hover:bg-purple-200 flex items-center gap-1.5"
                        >
                          <Mail className="h-4 w-4" />
                          Send Email
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                      >
                        {msg.type === "email" ? (
                          // Email message display
                          <div
                            className={`max-w-xs lg:max-w-md xl:max-w-lg rounded-lg overflow-hidden ${
                              msg.direction === "outbound"
                                ? "bg-purple-600"
                                : "bg-purple-100"
                            }`}
                          >
                            {/* Email Header */}
                            <div className={`px-4 py-2 flex items-center gap-2 ${
                              msg.direction === "outbound" ? "bg-purple-700" : "bg-purple-200"
                            }`}>
                              <Mail className={`h-4 w-4 ${msg.direction === "outbound" ? "text-purple-200" : "text-purple-600"}`} />
                              <span className={`text-xs font-medium ${msg.direction === "outbound" ? "text-purple-100" : "text-purple-700"}`}>
                                Email
                              </span>
                              {msg.opened_at && (
                                <span className={`text-xs flex items-center gap-1 ${msg.direction === "outbound" ? "text-purple-200" : "text-purple-600"}`}>
                                  <Eye className="h-3 w-3" />
                                  Opened
                                </span>
                              )}
                            </div>
                            {/* Email Subject */}
                            <div className={`px-4 py-2 ${msg.direction === "outbound" ? "text-white" : "text-gray-900"}`}>
                              <p className="text-sm font-medium">{msg.message}</p>
                              {/* Email Content Preview */}
                              {expandedEmailId === msg.id ? (
                                <div className="mt-2">
                                  <div 
                                    className={`text-xs p-2 rounded ${msg.direction === "outbound" ? "bg-purple-500/30" : "bg-white"}`}
                                    dangerouslySetInnerHTML={{ __html: msg.html_content || msg.text_content || "" }}
                                  />
                                  <button
                                    onClick={() => setExpandedEmailId(null)}
                                    className={`text-xs mt-2 ${msg.direction === "outbound" ? "text-purple-200" : "text-purple-600"}`}
                                  >
                                    Show less
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setExpandedEmailId(msg.id)}
                                  className={`text-xs mt-1 ${msg.direction === "outbound" ? "text-purple-200" : "text-purple-600"}`}
                                >
                                  View full email →
                                </button>
                              )}
                              <p className={`text-xs mt-2 ${msg.direction === "outbound" ? "text-purple-200" : "text-gray-500"}`}>
                                {formatMessageTime(msg.sent_at)}
                              </p>
                            </div>
                          </div>
                        ) : (
                          // SMS message display (existing)
                          <div
                            className={`max-w-xs lg:max-w-md xl:max-w-lg rounded-lg px-4 py-2 ${
                              msg.direction === "outbound"
                                ? "bg-blue-600 text-white"
                                : "bg-gray-200 text-gray-900"
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                            <p className={`text-xs mt-1 ${msg.direction === "outbound" ? "text-blue-100" : "text-gray-600"}`}>
                              {formatMessageTime(msg.sent_at)}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Message Input */}
                  <div className="p-4 border-t border-gray-200 bg-white">
                    {/* SMS Templates Quick Select */}
                    {smsTemplates.length > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-2">
                          <button
                            onClick={() => setShowTemplates(!showTemplates)}
                            className="text-xs font-medium text-gray-600 hover:text-blue-600 flex items-center gap-1"
                          >
                            📝 Quick Templates ({smsTemplates.length})
                            <span className={`transition-transform ${showTemplates ? "rotate-180" : ""}`}>▼</span>
                          </button>
                        </div>
                        {showTemplates && (
                          <div className="flex flex-wrap gap-2 mb-2 max-h-24 overflow-y-auto p-2 bg-gray-50 rounded-lg border border-gray-200">
                            {smsTemplates.map((template) => (
                              <button
                                key={template.id}
                                onClick={() => {
                                  setNewMessage(template.message);
                                  setShowTemplates(false);
                                  messageInputRef.current?.focus();
                                }}
                                className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded-full hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors truncate max-w-[200px]"
                                title={`${template.name}${template.campaignName ? ` (${template.campaignName})` : ""}\n\n${template.message}`}
                              >
                                {template.name}
                                {template.campaignName && (
                                  <span className="ml-1 text-gray-400">• {template.campaignName}</span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs text-gray-500">
                        Variables: {`{{name}}, {{address}}, {{tracking_url}}`}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          if (messageInputRef.current) {
                            const textarea = messageInputRef.current;
                            const start = textarea.selectionStart;
                            const end = textarea.selectionEnd;
                            const text = textarea.value;
                            const before = text.substring(0, start);
                            const after = text.substring(end);
                            setNewMessage(before + "{{tracking_url}}" + after);
                            setTimeout(() => {
                              textarea.selectionStart = textarea.selectionEnd = start + 17;
                              textarea.focus();
                            }, 0);
                          }
                        }}
                        className="text-xs px-2 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded border border-blue-200"
                      >
                        🔗 Insert Tracking URL
                      </button>
                    </div>
                    <div className="flex items-end gap-2">
                      <textarea
                        ref={messageInputRef}
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Type a message..."
                        className="flex-1 min-h-[40px] max-h-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                        rows={1}
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={!newMessage.trim() || isSending}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                      >
                        <Send className="h-4 w-4" />
                        {isSending ? "Sending..." : "Send"}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <MessageSquare className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No Conversation Selected</h3>
                    <p className="text-gray-600">Select a conversation to view messages</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* New Conversation Modal */}
      {showNewConversationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Start New Conversation</h2>
              <button
                onClick={() => {
                  setShowNewConversationModal(false);
                  setLeadSearchTerm("");
                  setAvailableLeads([]);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search leads by name or phone..."
                  value={leadSearchTerm}
                  onChange={(e) => {
                    setLeadSearchTerm(e.target.value);
                    if (e.target.value.length >= 2) {
                      fetchLeadsForNewConversation(e.target.value);
                    } else {
                      setAvailableLeads([]);
                    }
                  }}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {isLoadingLeads ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : availableLeads.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {leadSearchTerm.length >= 2
                    ? "No leads found. Try a different search term."
                    : "Type at least 2 characters to search for leads"}
                </div>
              ) : (
                <div className="space-y-2">
                  {availableLeads.map((lead) => (
                    <button
                      key={lead.id}
                      onClick={() => {
                        // Create a conversation object and select it
                        const newConv: Conversation = {
                          lead_id: lead.id,
                          lead_name: lead.name,
                          lead_phone: lead.phone,
                          lead_address: null,
                          lead_source: "manual",
                          assigned_to: null,
                          assigned_to_name: null,
                          message_count: 0,
                          unread_count: 0,
                          last_message_at: new Date().toISOString(),
                          last_message: "",
                          last_message_direction: "outbound",
                        };
                        setSelectedConversation(newConv);
                        selectedLeadIdRef.current = lead.id;
                        setShowNewConversationModal(false);
                        setLeadSearchTerm("");
                        setAvailableLeads([]);
                        // Fetch messages (will be empty, but sets up the lead)
                        fetchMessages(lead.id);
                      }}
                      className="w-full text-left p-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-blue-300 transition-colors"
                    >
                      <div className="font-medium text-gray-900">{lead.name}</div>
                      <div className="text-sm text-gray-600">{lead.phone}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Email Modal */}
      {showEmailModal && lead && (
        <QuickEmailModal
          leadId={lead.id}
          leadName={lead.name}
          leadEmail={lead.email || undefined}
          leadAddress={lead.address || undefined}
          onClose={() => setShowEmailModal(false)}
          onEmailSent={() => {
            toast.success("Email sent!");
            // Refresh messages
            if (selectedConversation) {
              fetchMessages(selectedConversation.lead_id);
            }
          }}
        />
      )}
    </div>
  );
}

