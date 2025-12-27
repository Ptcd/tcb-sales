"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { X, Mail, Send, Loader2, AlertCircle, Info, Zap, DollarSign, Calendar, FileText } from "lucide-react";
import { EmailTemplate } from "@/lib/types";
import toast from "react-hot-toast";

interface SendInfoModalProps {
  leadId: string;
  leadName: string;
  leadEmail?: string;
  leadAddress?: string;
  onClose: () => void;
  onEmailSent?: () => void;
}

export function SendInfoModal({
  leadId,
  leadName,
  leadEmail,
  leadAddress,
  onClose,
  onEmailSent,
}: SendInfoModalProps) {
  const [email, setEmail] = useState(leadEmail || "");
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [fromName, setFromName] = useState("");
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);

  // Email validation
  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  const canSend = email.trim() && isValidEmail(email) && subject.trim() && htmlContent.trim() && selectedCampaignId;

  // Filter quick templates (info-related)
  const quickTemplates = useMemo(() => 
    templates.filter(t => t.isQuick).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)),
    [templates]
  );

  const regularTemplates = useMemo(() => 
    templates.filter(t => !t.isQuick),
    [templates]
  );

  // Quick template icons mapping
  const getQuickTemplateIcon = (label: string) => {
    const labelLower = label?.toLowerCase() || '';
    if (labelLower.includes('price') || labelLower.includes('pricing') || labelLower.includes('quote')) return DollarSign;
    if (labelLower.includes('info') || labelLower.includes('detail') || labelLower.includes('service')) return Info;
    if (labelLower.includes('schedule') || labelLower.includes('appointment') || labelLower.includes('meeting')) return Calendar;
    if (labelLower.includes('document') || labelLower.includes('form') || labelLower.includes('file')) return FileText;
    return Zap;
  };

  useEffect(() => {
    fetchTemplates();
    fetchCampaigns();
  }, []);

  // Focus email input if empty
  useEffect(() => {
    if (!email && emailInputRef.current) {
      setTimeout(() => emailInputRef.current?.focus(), 100);
    }
  }, [email]);

  // Keep fromName aligned with selected campaign
  useEffect(() => {
    if (campaigns.length === 1 && !selectedCampaignId) {
      setSelectedCampaignId(campaigns[0].id);
      setFromName(campaigns[0].email_from_name || "");
      return;
    }
    if (selectedCampaignId) {
      const selected = campaigns.find((c) => c.id === selectedCampaignId);
      if (selected) {
        setFromName((prev) =>
          prev?.trim() ? prev : selected.email_from_name || ""
        );
      }
    }
  }, [campaigns, selectedCampaignId]);

  const fetchTemplates = async () => {
    try {
      const response = await fetch("/api/email/templates");
      if (!response.ok) throw new Error("Failed to fetch templates");
      
      const data = await response.json();
      setTemplates(data.templates || []);
    } catch (error) {
      console.error("Error fetching templates:", error);
      toast.error("Failed to load email templates");
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  const fetchCampaigns = async () => {
    try {
      const response = await fetch("/api/campaigns?scope=member");
      if (!response.ok) throw new Error("Failed to load campaigns");
      const data = await response.json();
      const usable = (data.campaigns || []).filter(
        (c: any) => c.email_address && c.email_address.includes("@")
      );
      setCampaigns(usable);

      if (usable.length === 0) {
        setCampaignError("You must be assigned to a campaign with email settings configured.");
      } else if (usable.length === 1) {
        setSelectedCampaignId(usable[0].id);
        setCampaignError(null);
        setFromName(usable[0].email_from_name || "");
      } else {
        setCampaignError(null);
      }
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      setCampaignError("Failed to load campaigns. Please try again.");
    }
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      // Personalize on selection
      const personalizedSubject = replaceVariables(template.subject);
      const personalizedHtml = replaceVariables(template.htmlContent);
      setSubject(personalizedSubject);
      setHtmlContent(personalizedHtml);
    } else {
      setSubject("");
      setHtmlContent("");
    }
  };

  const replaceVariables = (content: string) => {
    return content
      .replace(/\{\{name\}\}/g, leadName || "there")
      .replace(/\{\{first_name\}\}/g, (leadName || "there").split(" ")[0])
      .replace(/\{\{address\}\}/g, leadAddress || "your location")
      .replace(/\{\{email\}\}/g, email || "")
      .replace(/\{\{sender_name\}\}/g, fromName);
  };

  const handleSend = async () => {
    if (!isValidEmail(email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    if (!subject.trim()) {
      toast.error("Please enter a subject");
      return;
    }

    if (!htmlContent.trim()) {
      toast.error("Please enter email content");
      return;
    }

    if (!selectedCampaignId) {
      toast.error("Select a campaign with email settings to send.");
      return;
    }

    setIsSending(true);

    try {
      // Update lead email if it changed
      if (email.trim() !== (leadEmail || "")) {
        const updateResponse = await fetch(`/api/leads/${leadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim() }),
        });

        if (!updateResponse.ok) {
          const error = await updateResponse.json();
          throw new Error(error.error || "Failed to update lead email");
        }
      }

      // Send the email
      const sendResponse = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadIds: [leadId],
          templateId: selectedTemplateId || null,
          subject,
          htmlContent,
          fromName: fromName?.trim() ? fromName.trim() : undefined,
          campaignId: selectedCampaignId,
        }),
      });

      const data = await sendResponse.json();

      if (!sendResponse.ok) {
        throw new Error(data.error || "Failed to send email");
      }

      toast.success("Info email sent successfully!");
      onEmailSent?.();
      onClose();
    } catch (error: any) {
      console.error("Error sending info email:", error);
      toast.error(error.message || "Failed to send email");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Info className="h-6 w-6" />
              <div>
                <h2 className="text-xl font-bold">Send Info</h2>
                <p className="text-blue-100 text-sm">Email information to {leadName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
              disabled={isSending}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              ref={emailInputRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="customer@example.com"
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                email && !isValidEmail(email) 
                  ? "border-red-300 bg-red-50" 
                  : "border-gray-300"
              }`}
              disabled={isSending}
              required
            />
            {email && !isValidEmail(email) && (
              <p className="text-xs text-red-600 mt-1">Please enter a valid email address</p>
            )}
          </div>

          {/* Campaign selection */}
          {campaignError ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">{campaignError}</p>
            </div>
          ) : campaigns.length > 1 ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Campaign
              </label>
              <select
                value={selectedCampaignId}
                onChange={(e) => {
                  const id = e.target.value;
                  const selected = campaigns.find((c) => c.id === id);
                  setSelectedCampaignId(id);
                  if (selected) {
                    setFromName(selected.email_from_name || "");
                  }
                }}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isSending}
              >
                <option value="">Select a campaign</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.email_address}
                  </option>
                ))}
              </select>
            </div>
          ) : campaigns.length === 1 ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-900">
                Sending from: <span className="font-semibold">{campaigns[0]?.name}</span>
              </p>
            </div>
          ) : null}

          {/* Quick Templates */}
          {quickTemplates.length > 0 && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-semibold text-amber-800">Quick Templates</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {quickTemplates.map((template) => {
                  const IconComponent = getQuickTemplateIcon(template.quickLabel || template.name);
                  return (
                    <button
                      key={template.id}
                      onClick={() => handleTemplateChange(template.id)}
                      disabled={isSending}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all disabled:opacity-50 ${
                        selectedTemplateId === template.id
                          ? "bg-amber-600 text-white border-amber-600"
                          : "bg-white text-amber-700 border-amber-300 hover:bg-amber-100"
                      }`}
                    >
                      <IconComponent className="h-3.5 w-3.5" />
                      {template.quickLabel || template.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Template Dropdown */}
          {isLoadingTemplates ? (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading templates...
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Or select a template
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isSending}
              >
                <option value="">Write custom email...</option>
                {regularTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subject <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isSending}
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message <span className="text-red-500">*</span>
            </label>
            <textarea
              value={htmlContent}
              onChange={(e) => setHtmlContent(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={6}
              placeholder="Enter your message..."
              disabled={isSending}
            />
            <p className="text-xs text-gray-500 mt-1">
              Variables: {`{{name}}, {{address}}, {{tracking_url}}`}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              disabled={isSending}
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={!canSend || isSending}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send Info
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

