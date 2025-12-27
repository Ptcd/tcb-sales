"use client";

import { useState, useEffect } from "react";
import { Mail, Filter, Search, Calendar, User, MapPin, ArrowDownLeft, ArrowUpRight, Circle } from "lucide-react";
import { EmailMessage } from "@/lib/types";
import toast from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";

// Helper function - defined outside component so it can be used by modal
const getStatusColor = (status: string) => {
  switch (status) {
    case "sent":
    case "delivered":
      return "bg-green-100 text-green-800";
    case "opened":
      return "bg-blue-100 text-blue-800";
    case "clicked":
      return "bg-purple-100 text-purple-800";
    case "pending":
    case "scheduled":
      return "bg-yellow-100 text-yellow-800";
    case "received":
      return "bg-indigo-100 text-indigo-800";
    case "bounced":
    case "failed":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

export default function EmailHistoryPage() {
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    status: "",
    template: "",
    direction: "", // '', 'inbound', 'outbound'
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null);

  const limit = 20;

  useEffect(() => {
    fetchMessages();
  }, [currentPage, filters]);

  const fetchMessages = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: ((currentPage - 1) * limit).toString(),
      });

      if (filters.status) params.append("status", filters.status);
      if (filters.template) params.append("template", filters.template);
      if (filters.direction) params.append("direction", filters.direction);

      const response = await fetch(`/api/email/history?${params}`);
      if (!response.ok) throw new Error("Failed to fetch email history");

      const data = await response.json();
      setMessages(data.messages || []);
      setTotalCount(data.total || 0);
    } catch (error) {
      console.error("Error fetching email history:", error);
      setError("Failed to load email history");
      toast.error("Failed to load email history");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm("Are you sure you want to delete this email?")) {
      return;
    }

    try {
      const response = await fetch(`/api/email/history/${messageId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete email");
      }

      toast.success("Email deleted successfully");
      fetchMessages(); // Refresh the list
    } catch (error) {
      console.error("Error deleting email:", error);
      toast.error("Failed to delete email");
    }
  };

  const handleMarkAsRead = async (messageId: string) => {
    try {
      const response = await fetch(`/api/email/history/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_read: true }),
      });

      if (response.ok) {
        setMessages(messages.map(m => 
          m.id === messageId ? { ...m, isRead: true } : m
        ));
      }
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  const filteredMessages = messages.filter((message) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      message.leadName?.toLowerCase().includes(searchLower) ||
      message.toEmail?.toLowerCase().includes(searchLower) ||
      message.fromEmail?.toLowerCase().includes(searchLower) ||
      message.subject.toLowerCase().includes(searchLower) ||
      message.templateName?.toLowerCase().includes(searchLower)
    );
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const totalPages = Math.ceil(totalCount / limit);
  const unreadCount = messages.filter(m => m.direction === "inbound" && !m.isRead).length;

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="text-red-600 text-6xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Email History</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={() => {
                setError(null);
                fetchMessages();
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Mail className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Email History</h1>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                {unreadCount} unread
              </span>
            )}
          </div>
          <p className="text-gray-600">
            Track all emails sent and received
          </p>
        </div>

        {/* Direction Tabs */}
        <div className="bg-white rounded-lg shadow mb-4">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => {
                setFilters({ ...filters, direction: "" });
                setCurrentPage(1);
              }}
              className={`flex-1 px-4 py-3 text-sm font-medium ${
                filters.direction === ""
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              All Emails
            </button>
            <button
              onClick={() => {
                setFilters({ ...filters, direction: "outbound" });
                setCurrentPage(1);
              }}
              className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 ${
                filters.direction === "outbound"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <ArrowUpRight className="h-4 w-4" />
              Sent
            </button>
            <button
              onClick={() => {
                setFilters({ ...filters, direction: "inbound" });
                setCurrentPage(1);
              }}
              className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 ${
                filters.direction === "inbound"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <ArrowDownLeft className="h-4 w-4" />
              Received
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Search className="inline h-4 w-4 mr-1" />
                Search
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by lead, email, subject..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Filter className="inline h-4 w-4 mr-1" />
                Status
              </label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="scheduled">Scheduled</option>
                <option value="sent">Sent</option>
                <option value="delivered">Delivered</option>
                <option value="received">Received</option>
                <option value="opened">Opened</option>
                <option value="clicked">Clicked</option>
                <option value="bounced">Bounced</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setFilters({ status: "", template: "", direction: "" });
                  setSearchTerm("");
                  setCurrentPage(1);
                }}
                className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Messages Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center">
              <LoadingSpinner />
              <p className="mt-4 text-gray-600">Loading email history...</p>
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="p-8 text-center">
              <Mail className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Emails</h3>
              <p className="text-gray-600">
                {searchTerm || filters.status || filters.template || filters.direction
                  ? "No emails match your filters"
                  : "Start sending emails to see them here"}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-hidden">
                <table className="w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-10">
                        {/* Direction icon */}
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        {filters.direction === "inbound" ? "From" : filters.direction === "outbound" ? "To" : "From/To"}
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                        Email
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Subject
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">
                        Date
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredMessages.map((message) => (
                      <tr 
                        key={message.id} 
                        className={`hover:bg-gray-50 ${
                          message.direction === "inbound" && !message.isRead 
                            ? "bg-blue-50" 
                            : ""
                        }`}
                      >
                        <td className="px-3 py-3">
                          <div className="flex items-center" title={message.direction === "inbound" ? "Received" : "Sent"}>
                            {message.direction === "inbound" ? (
                              <div className="relative">
                                <ArrowDownLeft className="h-4 w-4 text-green-600" />
                                {!message.isRead && (
                                  <Circle className="h-2 w-2 text-blue-600 fill-blue-600 absolute -top-1 -right-1" />
                                )}
                              </div>
                            ) : (
                              <ArrowUpRight className="h-4 w-4 text-blue-600" />
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center">
                            <User className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                            <div className="min-w-0">
                              <div className={`text-sm font-medium text-gray-900 truncate ${
                                message.direction === "inbound" && !message.isRead ? "font-bold" : ""
                              }`}>
                                {message.direction === "inbound" 
                                  ? (message.leadName || message.fromEmail?.split("@")[0] || "Unknown Sender")
                                  : (message.leadName || "Unknown Lead")}
                              </div>
                              <div className="text-xs text-gray-500 flex items-center md:hidden">
                                <Mail className="h-3 w-3 mr-1" />
                                {message.direction === "inbound" ? message.fromEmail : message.toEmail}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap hidden md:table-cell">
                          <div className="text-sm text-gray-900">
                            {message.direction === "inbound" ? message.fromEmail : message.toEmail}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className={`text-sm text-gray-900 max-w-xs truncate ${
                            message.direction === "inbound" && !message.isRead ? "font-semibold" : ""
                          }`}>
                            {message.subject}
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
                              message.status
                            )}`}
                          >
                            {message.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500 hidden lg:table-cell">
                          {formatDate(message.sentAt || message.createdAt)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setSelectedMessage(message);
                                if (message.direction === "inbound" && !message.isRead) {
                                  handleMarkAsRead(message.id);
                                }
                              }}
                              className="text-blue-600 hover:text-blue-900 text-xs"
                            >
                              View
                            </button>
                            <button
                              onClick={() => handleDeleteMessage(message.id)}
                              className="text-red-600 hover:text-red-900 text-xs"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="bg-white px-4 py-3 border-t border-gray-200 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-700">
                      Showing {((currentPage - 1) * limit) + 1} to{" "}
                      {Math.min(currentPage * limit, totalCount)} of {totalCount} results
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setCurrentPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                      >
                        Previous
                      </button>
                      <span className="px-3 py-1 text-sm text-gray-700">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Message Detail Modal */}
        {selectedMessage && (
          <EmailDetailModal
            message={selectedMessage}
            onClose={() => setSelectedMessage(null)}
          />
        )}
      </div>
    </div>
  );
}

// Email Detail Modal Component
interface EmailDetailModalProps {
  message: EmailMessage;
  onClose: () => void;
}

function EmailDetailModal({ message, onClose }: EmailDetailModalProps) {
  const isInbound = message.direction === "inbound";
  
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              {isInbound ? (
                <ArrowDownLeft className="h-5 w-5 text-green-600" />
              ) : (
                <ArrowUpRight className="h-5 w-5 text-blue-600" />
              )}
              <h3 className="text-lg font-semibold text-gray-900">
                {isInbound ? "Received Email" : "Sent Email"}
              </h3>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
            <div className="space-y-4">
              {isInbound ? (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700">From:</label>
                    <p className="text-sm text-gray-900">{message.fromEmail}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">To:</label>
                    <p className="text-sm text-gray-900">{message.toEmail}</p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700">To:</label>
                    <p className="text-sm text-gray-900">{message.toEmail}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">From:</label>
                    <p className="text-sm text-gray-900">{message.fromEmail || "Your account"}</p>
                  </div>
                </>
              )}
              <div>
                <label className="text-sm font-medium text-gray-700">Lead:</label>
                <p className="text-sm text-gray-900">{message.leadName || "Unknown / Not linked"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Subject:</label>
                <p className="text-sm text-gray-900">{message.subject}</p>
              </div>
              {!isInbound && message.templateName && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Template:</label>
                  <p className="text-sm text-gray-900">{message.templateName}</p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-700">Status:</label>
                <span
                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ml-2 ${
                    getStatusColor(message.status)
                  }`}
                >
                  {message.status}
                </span>
              </div>
              {message.openedAt && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Opened:</label>
                  <p className="text-sm text-gray-900">
                    {new Date(message.openedAt).toLocaleString()}
                  </p>
                </div>
              )}
              {message.clickedAt && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Clicked:</label>
                  <p className="text-sm text-gray-900">
                    {new Date(message.clickedAt).toLocaleString()}
                  </p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-700">
                  {isInbound ? "Received:" : "Sent:"}
                </label>
                <p className="text-sm text-gray-900">
                  {message.sentAt ? new Date(message.sentAt).toLocaleString() : "Not sent yet"}
                </p>
              </div>
              {message.errorMessage && (
                <div>
                  <label className="text-sm font-medium text-red-700">Error:</label>
                  <p className="text-sm text-red-600">{message.errorMessage}</p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Email Content:</label>
                <div 
                  className="border border-gray-300 rounded-lg p-4 bg-gray-50 overflow-auto max-h-96"
                  dangerouslySetInnerHTML={{ __html: message.htmlContent }}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-200 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
