"use client";

import { useState, useEffect, useMemo } from "react";
import { X, Mail, Send, Clock, Zap, DollarSign, Info, Calendar, FileText } from "lucide-react";
import { EmailTemplate } from "@/lib/types";
import toast from "react-hot-toast";
import { LoadingSpinner } from "./LoadingSpinner";

interface QuickEmailModalProps {
  leadId: string;
  leadName: string;
  leadEmail?: string;
  leadAddress?: string;
  onClose: () => void;
  onEmailSent?: () => void;
}

export function QuickEmailModal({
  leadId,
  leadName,
  leadEmail,
  leadAddress,
  onClose,
  onEmailSent,
}: QuickEmailModalProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [fromName, setFromName] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [isScheduled, setIsScheduled] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [campaignError, setCampaignError] = useState<string | null>(null);

  // Filter quick templates
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

  // Keep fromName aligned with selected campaign (or auto-pick if only one)
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
      .replace(/\{\{address\}\}/g, leadAddress || "your location")
      .replace(/\{\{email\}\}/g, leadEmail || "")
      .replace(/\{\{sender_name\}\}/g, fromName);
  };

  const handleSend = async () => {
    if (!leadEmail) {
      toast.error("This lead doesn't have an email address");
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

    if (isScheduled && !scheduledFor) {
      toast.error("Please select a time to schedule the email");
      return;
    }

    if (!selectedCampaignId) {
      toast.error("Select a campaign with email settings to send.");
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadIds: [leadId],
          templateId: selectedTemplateId || null,
          subject,
          htmlContent,
          fromName: fromName?.trim() ? fromName.trim() : undefined,
          isScheduled,
          scheduledFor: isScheduled ? new Date(scheduledFor).toISOString() : undefined,
          campaignId: selectedCampaignId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send email");
      }

      if (isScheduled) {
        toast.success(`Email scheduled for ${new Date(scheduledFor).toLocaleString()}!`);
      } else {
        toast.success("Email sent successfully!");
      }
      onEmailSent?.();
      onClose();
    } catch (error: any) {
      console.error("Error sending email:", error);
      toast.error(error.message || "Failed to send email");
    } finally {
      setIsSending(false);
    }
  };

  const hasEmail = leadEmail && leadEmail.includes('@');

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-[60]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                <h2 className="text-lg font-bold">Quick Email</h2>
              </div>
              <button
                onClick={onClose}
                className="text-white/80 hover:text-white hover:bg-white/20 p-1.5 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-2 text-sm text-blue-100">
              To: {leadName} {hasEmail ? `<${leadEmail}>` : "(No email)"}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {!hasEmail ? (
              <div className="text-center py-8">
                <Mail className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-gray-900 mb-1">No Email Address</h3>
                <p className="text-gray-600 text-sm">
                  This lead doesn't have an email address on file.
                </p>
              </div>
            ) : (
              <>
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
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all ${
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

                {/* Campaign selection */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-blue-900">Campaign</span>
                    {campaigns.length > 0 && (
                      <span className="text-xs text-blue-800">
                        {campaigns.length} with email configured
                      </span>
                    )}
                  </div>
                  {campaignError ? (
                    <p className="text-sm text-red-700">{campaignError}</p>
                  ) : campaigns.length <= 1 ? (
                    <p className="text-sm text-blue-900">
                      Sending from campaign:{" "}
                      <span className="font-semibold">
                        {campaigns[0]?.name || "Loading..."}
                      </span>
                    </p>
                  ) : (
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
                      className="w-full px-3 py-2 text-sm border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select a campaign to send from</option>
                      {campaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} — {c.email_address}
                        </option>
                      ))}
                    </select>
                  )}
                  <p className="text-xs text-blue-800 mt-2">
                    Campaign sender email must be verified in Brevo (sending) and Mailgun (replies).
                  </p>
                </div>

                {/* Template Dropdown */}
                {isLoadingTemplates ? (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <LoadingSpinner />
                    Loading templates...
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Or select a template
                    </label>
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => handleTemplateChange(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Subject
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Email subject..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Content */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Message
                  </label>
                  <textarea
                    value={htmlContent}
                    onChange={(e) => setHtmlContent(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    rows={6}
                    placeholder="Enter your message..."
                  />
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-gray-500">
                      Variables: {`{{name}}, {{address}}, {{tracking_url}}`}
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
                          setHtmlContent(before + "{{tracking_url}}" + after);
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

                {/* Schedule Option */}
                <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-700">Send Later</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isScheduled}
                      onChange={(e) => {
                        setIsScheduled(e.target.checked);
                        if (!e.target.checked) setScheduledFor("");
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {isScheduled && (
                  <div className="space-y-2">
                    <input
                      type="datetime-local"
                      value={scheduledFor}
                      onChange={(e) => setScheduledFor(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex gap-2">
                      {[
                        { label: "Tomorrow 9am", days: 1, hour: 9 },
                        { label: "In 1 hour", hours: 1 },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            const date = new Date();
                            if (preset.days) {
                              date.setDate(date.getDate() + preset.days);
                              date.setHours(preset.hour || 9, 0, 0, 0);
                            } else if (preset.hours) {
                              date.setHours(date.getHours() + preset.hours);
                            }
                            setScheduledFor(date.toISOString().slice(0, 16));
                          }}
                          className="flex-1 px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-100"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          {hasEmail && (
            <div className="border-t border-gray-200 p-4 bg-gray-50">
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  disabled={isSending || !subject.trim() || !htmlContent.trim() || (isScheduled && !scheduledFor)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                    isScheduled ? "bg-purple-600 hover:bg-purple-700" : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  {isSending ? (
                    <>
                      <LoadingSpinner />
                      {isScheduled ? "Scheduling..." : "Sending..."}
                    </>
                  ) : isScheduled ? (
                    <>
                      <Clock className="h-4 w-4" />
                      Schedule
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send Email
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

