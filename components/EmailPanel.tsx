"use client";

import { useState, useEffect, useMemo } from "react";
import { X, Mail, Send, Eye, Zap, Clock, Paperclip, FileText, DollarSign, Calendar, Info } from "lucide-react";
import { BusinessResult, EmailTemplate } from "@/lib/types";
import toast from "react-hot-toast";
import { LoadingSpinner } from "./LoadingSpinner";

interface EmailPanelProps {
  leads: BusinessResult[];
  onClose: () => void;
  onEmailsSent?: () => void;
}

export function EmailPanel({ leads, onClose, onEmailsSent }: EmailPanelProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [textContent, setTextContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [isScheduled, setIsScheduled] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [trackingUrl, setTrackingUrl] = useState<string>("");

  // Filter leads with valid emails
  const leadsWithEmail = leads.filter(lead => lead.email && lead.email.includes('@'));
  const leadsWithoutEmail = leads.filter(lead => !lead.email || !lead.email.includes('@'));

  // Filter quick templates for easy access
  const quickTemplates = useMemo(() => 
    templates.filter(t => t.isQuick).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)),
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
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    try {
      const response = await fetch("/api/auth/profile");
      if (response.ok) {
        const data = await response.json();
        const sdrCode = data.profile?.sdr_code || "";
        if (sdrCode) {
          const JCC_SIGNUP_BASE_URL = process.env.NEXT_PUBLIC_JCC_SIGNUP_URL || "https://autosalvageautomation.com/try-the-calculator";
          setTrackingUrl(`${JCC_SIGNUP_BASE_URL}?sdr=${encodeURIComponent(sdrCode)}`);
        }
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
  };

  // Keep fromName in sync with selected campaign (or auto-pick if only one)
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
      
      // If no templates, create defaults
      if (!data.templates || data.templates.length === 0) {
        await createDefaultTemplates();
      }
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
        // Prefill fromName with campaign sender name when single campaign
        setFromName(usable[0].email_from_name || "");
      } else {
        setCampaignError(null);
      }
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      setCampaignError("Failed to load campaigns. Please try again.");
    }
  };

  const createDefaultTemplates = async () => {
    // Require a campaign to be selected before creating default templates
    if (!selectedCampaignId) {
      toast.error("Please select a campaign first to create default templates");
      return;
    }

    const defaultTemplates = [
      {
        name: "Introduction Email",
        subject: "Business Opportunity for {{name}}",
        htmlContent: '<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;"><div style="max-width: 600px; margin: 0 auto; padding: 20px;"><h2 style="color: #2563eb;">Hello {{name}}!</h2><p>I hope this email finds you well. I came across your business at <strong>{{address}}</strong> and wanted to reach out regarding a potential opportunity.</p><p>We specialize in helping businesses like yours grow and thrive. I\'d love to discuss how we can work together.</p><p>Would you be available for a brief call this week?</p><p>Looking forward to connecting!</p><p style="margin-top: 30px;">Best regards,<br><strong>{{sender_name}}</strong></p></div></body></html>',
        textContent: "Hello {{name}}!\n\nI hope this email finds you well. I came across your business at {{address}} and wanted to reach out regarding a potential opportunity.\n\nWe specialize in helping businesses like yours grow and thrive. I'd love to discuss how we can work together.\n\nWould you be available for a brief call this week?\n\nLooking forward to connecting!\n\nBest regards,\n{{sender_name}}",
        isQuick: false,
        campaignId: selectedCampaignId,
      },
      {
        name: "Follow-Up Email",
        subject: "Following up - {{name}}",
        htmlContent: '<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;"><div style="max-width: 600px; margin: 0 auto; padding: 20px;"><h2 style="color: #2563eb;">Hi {{name}},</h2><p>I wanted to follow up on my previous message regarding your business at <strong>{{address}}</strong>.</p><p>I understand you\'re busy, but I believe we have an opportunity that could be valuable for you.</p><p>Do you have 10 minutes this week for a quick conversation?</p><p>Thanks for your time!</p><p style="margin-top: 30px;">Best,<br><strong>{{sender_name}}</strong></p></div></body></html>',
        textContent: "Hi {{name}},\n\nI wanted to follow up on my previous message regarding your business at {{address}}.\n\nI understand you're busy, but I believe we have an opportunity that could be valuable for you.\n\nDo you have 10 minutes this week for a quick conversation?\n\nThanks for your time!\n\nBest,\n{{sender_name}}",
        isQuick: false,
        campaignId: selectedCampaignId,
      },
      // Quick Templates for instant access
      {
        name: "Pricing Information",
        subject: "Pricing Details for {{name}}",
        htmlContent: '<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;"><div style="max-width: 600px; margin: 0 auto; padding: 20px;"><h2 style="color: #2563eb;">Hi {{name}},</h2><p>Thank you for your interest! As discussed, here are our pricing details:</p><p><strong>Our Services:</strong></p><ul><li>Service 1 - Contact for pricing</li><li>Service 2 - Contact for pricing</li><li>Service 3 - Contact for pricing</li></ul><p>We\'d be happy to provide a custom quote based on your specific needs. Just reply to this email or give us a call!</p><p style="margin-top: 30px;">Best regards,<br><strong>{{sender_name}}</strong></p></div></body></html>',
        textContent: "Hi {{name}},\n\nThank you for your interest! As discussed, here are our pricing details:\n\nOur Services:\n- Service 1 - Contact for pricing\n- Service 2 - Contact for pricing\n- Service 3 - Contact for pricing\n\nWe'd be happy to provide a custom quote based on your specific needs. Just reply to this email or give us a call!\n\nBest regards,\n{{sender_name}}",
        isQuick: true,
        quickLabel: "Pricing Info",
        displayOrder: 1,
        campaignId: selectedCampaignId,
      },
      {
        name: "Service Details",
        subject: "Our Services - {{name}}",
        htmlContent: '<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;"><div style="max-width: 600px; margin: 0 auto; padding: 20px;"><h2 style="color: #2563eb;">Hi {{name}},</h2><p>Thanks for reaching out! Here\'s more information about our services:</p><p><strong>What We Offer:</strong></p><ul><li>Service description 1</li><li>Service description 2</li><li>Service description 3</li></ul><p><strong>Why Choose Us:</strong></p><ul><li>Benefit 1</li><li>Benefit 2</li><li>Benefit 3</li></ul><p>Let me know if you have any questions!</p><p style="margin-top: 30px;">Best regards,<br><strong>{{sender_name}}</strong></p></div></body></html>',
        textContent: "Hi {{name}},\n\nThanks for reaching out! Here's more information about our services:\n\nWhat We Offer:\n- Service description 1\n- Service description 2\n- Service description 3\n\nWhy Choose Us:\n- Benefit 1\n- Benefit 2\n- Benefit 3\n\nLet me know if you have any questions!\n\nBest regards,\n{{sender_name}}",
        isQuick: true,
        quickLabel: "Service Info",
        displayOrder: 2,
        campaignId: selectedCampaignId,
      },
      {
        name: "Schedule Appointment",
        subject: "Let\'s Schedule a Time - {{name}}",
        htmlContent: '<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;"><div style="max-width: 600px; margin: 0 auto; padding: 20px;"><h2 style="color: #2563eb;">Hi {{name}},</h2><p>Great speaking with you! I\'d love to schedule a time to discuss this further.</p><p><strong>I\'m available:</strong></p><ul><li>Monday - Friday: 9am - 5pm</li><li>Weekend appointments available upon request</li></ul><p>Please let me know what time works best for you, and I\'ll send over a calendar invite.</p><p>Looking forward to it!</p><p style="margin-top: 30px;">Best regards,<br><strong>{{sender_name}}</strong></p></div></body></html>',
        textContent: "Hi {{name}},\n\nGreat speaking with you! I'd love to schedule a time to discuss this further.\n\nI'm available:\n- Monday - Friday: 9am - 5pm\n- Weekend appointments available upon request\n\nPlease let me know what time works best for you, and I'll send over a calendar invite.\n\nLooking forward to it!\n\nBest regards,\n{{sender_name}}",
        isQuick: true,
        quickLabel: "Schedule",
        displayOrder: 3,
        campaignId: selectedCampaignId,
      },
    ];

    try {
      for (const template of defaultTemplates) {
        await fetch("/api/email/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(template),
        });
      }
      // Refetch templates
      const response = await fetch("/api/email/templates");
      const data = await response.json();
      setTemplates(data.templates || []);
      toast.success("Default templates created!");
    } catch (error) {
      console.error("Error creating default templates:", error);
    }
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setSubject(template.subject);
      setHtmlContent(template.htmlContent);
      setTextContent(template.textContent || "");
    } else {
      setSubject("");
      setHtmlContent("");
      setTextContent("");
    }
  };

  const getPreviewContent = () => {
    if (leadsWithEmail.length === 0) return { subject: "", html: "" };
    
    const sampleLead = leadsWithEmail[0];
    const senderName = fromName || "Your Business";
    const senderPhone = "";
    
    return {
      subject: replaceVariables(subject, sampleLead, senderName, senderPhone),
      html: replaceVariables(htmlContent, sampleLead, senderName, senderPhone),
    };
  };

  const replaceVariables = (content: string, lead: BusinessResult, senderName: string, senderPhone: string) => {
    return content
      .replace(/\{\{name\}\}/g, lead.name || "there")
      .replace(/\{\{address\}\}/g, lead.address || "your location")
      .replace(/\{\{email\}\}/g, lead.email || "")
      .replace(/\{\{phone\}\}/g, senderPhone || "")
      .replace(/\{\{sender_name\}\}/g, senderName)
      .replace(/\{\{tracking_url\}\}/g, trackingUrl || "")
      .replace(/\{\{unsubscribe_url\}\}/g, window.location.origin + "/unsubscribe");
  };

  const handleSend = async () => {
    if (!subject.trim()) {
      toast.error("Please enter a subject");
      return;
    }

    if (!htmlContent.trim()) {
      toast.error("Please enter email content");
      return;
    }

    if (leadsWithEmail.length === 0) {
      toast.error("No leads have valid email addresses");
      return;
    }

    if (!selectedCampaignId) {
      toast.error("Select a campaign with email settings to send.");
      return;
    }

    if (isScheduled && !scheduledFor) {
      toast.error("Please select a time to schedule the email");
      return;
    }

    setIsSending(true);
    try {
      // Prepare form data if there are attachments
      let requestBody: any = {
        leadIds: leadsWithEmail.map(l => l.id),
        templateId: selectedTemplateId || null,
        subject,
        htmlContent,
        textContent: textContent || null,
        fromName: fromName?.trim() ? fromName.trim() : undefined, // only send if user set it
        fromEmail: fromEmail || undefined,
        isScheduled: isScheduled,
        scheduledFor: isScheduled ? new Date(scheduledFor).toISOString() : undefined,
        campaignId: selectedCampaignId,
      };

      // TODO: Handle file attachments - would need multipart form data or separate upload
      if (attachments.length > 0) {
        toast.error("File attachments coming soon! Email will be sent without attachments.");
      }

      const response = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send emails");
      }

      if (isScheduled) {
        toast.success(`Email scheduled for ${new Date(scheduledFor).toLocaleString()}!`);
      } else {
        toast.success(data.message || `Emails sent successfully!`);
      }
      onEmailsSent?.();
      onClose();
    } catch (error: any) {
      console.error("Error sending emails:", error);
      toast.error(error.message || "Failed to send emails");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full sm:w-[600px] lg:w-[800px] bg-white shadow-2xl z-50 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-6 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Mail className="h-6 w-6" />
              <h2 className="text-2xl font-bold">Send Email</h2>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="bg-white/20 px-3 py-1 rounded-full">
              {leadsWithEmail.length} {leadsWithEmail.length === 1 ? "Lead" : "Leads"}
            </span>
            {leadsWithoutEmail.length > 0 && (
              <span className="bg-yellow-500/30 px-3 py-1 rounded-full">
                {leadsWithoutEmail.length} without email
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Campaign selection */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-blue-900">Campaign</span>
              </div>
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
                className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
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

          {/* Warning for leads without email */}
          {leadsWithoutEmail.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>{leadsWithoutEmail.length} lead(s)</strong> will be skipped as they don't have valid email addresses.
              </p>
            </div>
          )}

          {leadsWithEmail.length === 0 ? (
            <div className="text-center py-12">
              <Mail className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Valid Emails</h3>
              <p className="text-gray-600">
                None of the selected leads have valid email addresses.
              </p>
            </div>
          ) : (
            <>
              {/* Quick Templates Section */}
              {quickTemplates.length > 0 && (
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
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
                          className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-all ${
                            selectedTemplateId === template.id
                              ? "bg-amber-600 text-white border-amber-600 shadow-md"
                              : "bg-white text-amber-700 border-amber-300 hover:bg-amber-100 hover:border-amber-400"
                          }`}
                        >
                          <IconComponent className="h-4 w-4" />
                          {template.quickLabel || template.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Template Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-900">
                    Email Template
                  </label>
                </div>
                {isLoadingTemplates ? (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <LoadingSpinner />
                    Loading templates...
                  </div>
                ) : (
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => handleTemplateChange(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Custom Email (Start from scratch)</option>
                    {/* Group templates by campaign */}
                    {(() => {
                      const grouped = new Map<string, typeof templates>();
                      for (const template of templates) {
                        const campaignName = template.campaignName || "Other Templates";
                        if (!grouped.has(campaignName)) {
                          grouped.set(campaignName, []);
                        }
                        grouped.get(campaignName)!.push(template);
                      }
                      return Array.from(grouped.entries())
                        .sort((a, b) => {
                          if (a[0] === "Other Templates") return 1;
                          if (b[0] === "Other Templates") return -1;
                          return a[0].localeCompare(b[0]);
                        })
                        .map(([campaignName, campaignTemplates]) => (
                          <optgroup key={campaignName} label={campaignName}>
                            {campaignTemplates.map((template) => (
                              <option key={template.id} value={template.id}>
                                {template.name} {template.isDefault && "(Default)"}
                              </option>
                            ))}
                          </optgroup>
                        ));
                    })()}
                  </select>
                )}
              </div>

              {/* From Information */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    From Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    placeholder="Your Business Name"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Reply-To Email (Optional)
                  </label>
                  <input
                    type="email"
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    When recipients reply, their response will go to this email address
                  </p>
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Enter email subject..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  You can use: {`{{name}}, {{address}}, {{sender_name}}, {{tracking_url}}`}
                </p>
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Email Content (HTML)
                </label>
                <textarea
                  value={htmlContent}
                  onChange={(e) => setHtmlContent(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm resize-none"
                  rows={12}
                  placeholder="Enter your email HTML content..."
                />
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-gray-500">
                    Use HTML tags for formatting. Variables: {`{{name}}, {{address}}, {{sender_name}}, {{tracking_url}}, {{unsubscribe_url}}`}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const textarea = document.querySelector('textarea[rows="12"]') as HTMLTextAreaElement;
                      if (textarea) {
                        const start = textarea.selectionStart;
                        const end = textarea.selectionEnd;
                        const text = textarea.value;
                        const before = text.substring(0, start);
                        const after = text.substring(end);
                        setHtmlContent(before + "{{tracking_url}}" + after);
                        // Set cursor position after inserted text
                        setTimeout(() => {
                          textarea.selectionStart = textarea.selectionEnd = start + 17; // length of {{tracking_url}}
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

              {/* Schedule Later Option */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-600" />
                    <span className="text-sm font-medium text-gray-900">Send Later</span>
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
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                {isScheduled && (
                  <div className="space-y-3">
                    <input
                      type="datetime-local"
                      value={scheduledFor}
                      onChange={(e) => setScheduledFor(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                    <div className="flex gap-2">
                      {[
                        { label: "Tomorrow 9am", days: 1, hour: 9 },
                        { label: "Monday 9am", days: (8 - new Date().getDay()) % 7 || 7, hour: 9 },
                        { label: "In 2 hours", hours: 2 },
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
                          className="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-100"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Attachments */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  <Paperclip className="inline h-4 w-4 mr-1" />
                  Attachments
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-400 transition-colors">
                  <input
                    type="file"
                    multiple
                    onChange={(e) => {
                      if (e.target.files) {
                        setAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
                      }
                    }}
                    className="hidden"
                    id="email-attachments"
                  />
                  <label htmlFor="email-attachments" className="cursor-pointer">
                    <Paperclip className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">Click to attach files</p>
                    <p className="text-xs text-gray-500 mt-1">PDF, DOC, images up to 10MB each</p>
                  </label>
                </div>
                {attachments.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {attachments.map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2">
                        <div className="flex items-center gap-2 text-sm">
                          <FileText className="h-4 w-4 text-gray-500" />
                          <span className="truncate max-w-[200px]">{file.name}</span>
                          <span className="text-gray-400 text-xs">({(file.size / 1024).toFixed(1)} KB)</span>
                        </div>
                        <button
                          onClick={() => setAttachments(prev => prev.filter((_, i) => i !== index))}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Preview & Send Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowPreview(true)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  <Eye className="h-5 w-5" />
                  Preview
                </button>
                <button
                  onClick={handleSend}
                  disabled={isSending || !subject.trim() || !htmlContent.trim() || (isScheduled && !scheduledFor)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${
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
                      <Clock className="h-5 w-5" />
                      Schedule for {leadsWithEmail.length} {leadsWithEmail.length === 1 ? "Lead" : "Leads"}
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5" />
                      Send to {leadsWithEmail.length} {leadsWithEmail.length === 1 ? "Lead" : "Leads"}
                    </>
                  )}
                </button>
              </div>

              {/* Leads Preview */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">
                  Sending to:
                </h3>
                <div className="max-h-48 overflow-y-auto space-y-2 border border-gray-200 rounded-lg p-3">
                  {leadsWithEmail.map((lead) => (
                    <div
                      key={lead.id}
                      className="flex items-start gap-2 text-sm p-2 bg-gray-50 rounded"
                    >
                      <Mail className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 truncate">{lead.name}</p>
                        <p className="text-gray-600 truncate">{lead.email}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <EmailPreviewModal
          subject={getPreviewContent().subject}
          htmlContent={getPreviewContent().html}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
}

// Preview Modal Component
interface EmailPreviewModalProps {
  subject: string;
  htmlContent: string;
  onClose: () => void;
}

function EmailPreviewModal({ subject, htmlContent, onClose }: EmailPreviewModalProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-75 z-[60]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Email Preview
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
            <div className="mb-4 pb-4 border-b border-gray-200">
              <p className="text-sm text-gray-600">Subject:</p>
              <p className="text-lg font-semibold text-gray-900">{subject}</p>
            </div>
            <div 
              className="prose max-w-none whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Close Preview
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

