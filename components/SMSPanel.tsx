"use client";

import { useState, useEffect } from "react";
import { X, MessageSquare } from "lucide-react";
import { SMSTemplate } from "@/lib/types";
import toast from "react-hot-toast";

interface SMSPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLeadIds: string[];
  leads: Array<{ id: string; name: string; phone?: string }>;
}

export default function SMSPanel({
  isOpen,
  onClose,
  selectedLeadIds,
  leads,
}: SMSPanelProps) {
  const [templates, setTemplates] = useState<SMSTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
    }
  }, [isOpen]);

  const fetchTemplates = async () => {
    setIsLoadingTemplates(true);
    try {
      const response = await fetch("/api/sms/templates");
      if (!response.ok) throw new Error("Failed to fetch templates");

      const data = await response.json();
      setTemplates(data.templates || []);
    } catch (error) {
      console.error("Error fetching templates:", error);
      toast.error("Failed to load SMS templates");
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      setMessage(template.message);
    }
  };

  const handleSendSMS = async () => {
    if (!message.trim()) {
      toast.error("Please enter a message");
      return;
    }

    if (selectedLeadIds.length === 0) {
      toast.error("No leads selected");
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadIds: selectedLeadIds,
          message: message.trim(),
          templateId: selectedTemplate || null,
        }),
      });

      if (!response.ok) throw new Error("Failed to send SMS");

      const data = await response.json();
      toast.success(
        `Successfully sent ${data.sentCount} SMS messages${data.failedCount > 0 ? `. ${data.failedCount} failed` : ""}`
      );
      
      // Reset and close
      setMessage("");
      setSelectedTemplate("");
      onClose();
    } catch (error) {
      console.error("Error sending SMS:", error);
      toast.error("Failed to send SMS messages");
    } finally {
      setIsSending(false);
    }
  };

  const leadsWithPhone = leads.filter((l) => selectedLeadIds.includes(l.id) && l.phone);
  const leadsWithoutPhone = selectedLeadIds.length - leadsWithPhone.length;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Side Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-6 w-6 text-white" />
            <div>
              <h2 className="text-xl font-bold text-white">Send SMS</h2>
              <p className="text-sm text-blue-100 mt-1">
                {leadsWithPhone.length} lead{leadsWithPhone.length !== 1 ? "s" : ""} selected
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-blue-100 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Warning for leads without phone */}
          {leadsWithoutPhone > 0 && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                ⚠️ {leadsWithoutPhone} selected lead{leadsWithoutPhone !== 1 ? "s" : ""} {leadsWithoutPhone !== 1 ? "don't" : "doesn't"} have phone numbers
              </p>
            </div>
          )}

          {/* Template Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Use Template (Optional)
            </label>
            {isLoadingTemplates ? (
              <p className="text-sm text-gray-500">Loading templates...</p>
            ) : templates.length > 0 ? (
              <select
                value={selectedTemplate}
                onChange={(e) => handleTemplateSelect(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">-- Select a template --</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-gray-500">No templates available</p>
            )}
          </div>

          {/* Message Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your SMS message here..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={6}
              maxLength={1600}
              disabled={isSending}
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-gray-500">
                {message.length} / 1600 characters. Variables: {`{{name}}, {{address}}, {{tracking_url}}`}
              </p>
              <button
                type="button"
                onClick={() => {
                  const textarea = document.querySelector('textarea[rows="6"]') as HTMLTextAreaElement;
                  if (textarea) {
                    const start = textarea.selectionStart;
                    const end = textarea.selectionEnd;
                    const text = textarea.value;
                    const before = text.substring(0, start);
                    const after = text.substring(end);
                    setMessage(before + "{{tracking_url}}" + after);
                    // Set cursor position after inserted text
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
          </div>

          {/* Selected Leads Preview */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sending to:
            </label>
            <div className="max-h-40 overflow-y-auto bg-gray-50 rounded-lg p-3 space-y-1">
              {leadsWithPhone.map((lead) => (
                <div key={lead.id} className="text-sm text-gray-700">
                  • {lead.name} ({lead.phone})
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6 bg-gray-50">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isSending}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSendSMS}
              disabled={isSending || !message.trim() || leadsWithPhone.length === 0}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSending ? "Sending..." : `Send SMS (${leadsWithPhone.length})`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

