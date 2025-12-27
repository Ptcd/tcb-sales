"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Save, Tag, Mail, MessageSquare, Plus, Edit, Trash2, X, FileText, Phone, DollarSign } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import Input from "@/components/Input";
import Button from "@/components/Button";
import Link from "next/link";

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "paused" | "archived";
  email_address?: string | null;
  email_from_name?: string | null;
  email_signature?: string | null;
  capital_budget_usd?: number | null;
  bonus_rules?: { trigger: string; sdr_amount: number; activator_amount: number }[];
  lead_filters?: {
    require_website?: boolean;
    require_phone?: boolean;
    require_email?: boolean;
    min_rating?: number;
    min_reviews?: number;
  } | null;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  isQuick?: boolean;
  quickLabel?: string;
}

interface SMSTemplate {
  id: string;
  name: string;
  message: string;
  isActive: boolean;
}

interface CallScript {
  id: string;
  name: string;
  content: string;
  displayOrder: number;
  isActive: boolean;
  badgeKey?: string;
  scriptKey?: string;
  category?: string;
}

// Script key options for the dropdown (using script_key for auto-routing)
const SCRIPT_KEY_OPTIONS = [
  { value: "", label: "Default Script (General Prospecting)", category: "PROSPECT" },
  { value: "PROSPECT_PITCH_CORE", label: "Prospecting: Core Pitch", category: "PROSPECT" },
  { value: "PROSPECT_OPENER_GATEKEEPER", label: "Prospecting: Gatekeeper Opener", category: "PROSPECT" },
  { value: "PROSPECT_OPENER_DECISIONMAKER", label: "Prospecting: Decision Maker Opener", category: "PROSPECT" },
  { value: "TRIAL_FOLLOWUP_1", label: "Follow-up: 1st Trial Check-in", category: "FOLLOWUP" },
  { value: "TRIAL_FOLLOWUP_2", label: "Follow-up: 2nd Trial Check-in", category: "FOLLOWUP" },
  { value: "TRIAL_FOLLOWUP_3", label: "Follow-up: 3rd Trial Check-in", category: "FOLLOWUP" },
  { value: "RESCUE_PASSWORD_NOT_SET", label: "Rescue A: Password Not Set (2-24h)", category: "RESCUE" },
  { value: "RESCUE_NOT_ACTIVATED", label: "Rescue B: Not Activated (2-48h)", category: "RESCUE" },
  { value: "CONVERT_TO_PAID_NUDGE", label: "Conversion: Upgrade Nudge", category: "CONVERT" },
];

// Required scripts for full coverage
const REQUIRED_SCRIPTS = [
  { key: "PROSPECT_PITCH_CORE", label: "Prospecting script", category: "PROSPECT" },
  { key: "RESCUE_PASSWORD_NOT_SET", label: "Rescue A (Password Not Set)", category: "RESCUE" },
  { key: "RESCUE_NOT_ACTIVATED", label: "Rescue B (Not Activated)", category: "RESCUE" },
];

export default function EditCampaignPage() {
  const router = useRouter();
  const params = useParams();
  const campaignId = params.id as string;

  // Campaign state
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    status: "active" as "active" | "paused" | "archived",
    email_address: "",
    email_from_name: "",
    email_signature: "",
    capital_budget_usd: "" as string | number,
    bonus_rules: {
      proven_install_sdr: "" as string | number,
      proven_install_activator: "" as string | number,
    },
    lead_filters: {
      require_website: false,
      require_phone: false,
      require_email: false,
      min_rating: "" as string | number,
      min_reviews: "" as string | number,
    },
  });
  const [senders, setSenders] = useState<{ id: string; name: string; email: string }[]>([]);

  // Campaign goals state
  const [goalsData, setGoalsData] = useState({
    provenInstallsPer40h: "4",
    scheduledApptsPer40h: "8",
    conversationsPer40h: "200",
    targetWeeklyHours: "40",
  });
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [goalsSaving, setGoalsSaving] = useState(false);
  const [sendersLoading, setSendersLoading] = useState(true);
  const [sendersError, setSendersError] = useState<string | null>(null);

  // Templates state
  const [activeTemplateTab, setActiveTemplateTab] = useState<"email" | "sms" | "scripts">("email");
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [smsTemplates, setSmsTemplates] = useState<SMSTemplate[]>([]);
  const [callScripts, setCallScripts] = useState<CallScript[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  
  // Template editing state
  const [editingEmailTemplate, setEditingEmailTemplate] = useState<EmailTemplate | null>(null);
  const [editingSmsTemplate, setEditingSmsTemplate] = useState<SMSTemplate | null>(null);
  const [editingCallScript, setEditingCallScript] = useState<CallScript | null>(null);
  const [isCreatingEmail, setIsCreatingEmail] = useState(false);
  const [isCreatingSms, setIsCreatingSms] = useState(false);
  const [isCreatingScript, setIsCreatingScript] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);

  // Email template form
  const [emailForm, setEmailForm] = useState({
    name: "",
    subject: "",
    htmlContent: "",
    textContent: "",
    isQuick: false,
    quickLabel: "",
  });

  // SMS template form
  const [smsForm, setSmsForm] = useState({
    name: "",
    message: "",
    isActive: true,
  });

  // Call script form
  const [scriptForm, setScriptForm] = useState({
    name: "",
    content: "",
    isActive: true,
    scriptKey: "",
  });

  useEffect(() => {
    fetchCampaign();
    fetchSenders();
    fetchTemplates();
    fetchCallScripts();
    fetchCampaignGoals();
  }, [campaignId]);

  const fetchCampaign = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}`);
      if (!response.ok) {
        if (response.status === 404) {
          toast.error("Campaign not found");
          router.push("/dashboard/admin/campaigns");
          return;
        }
        throw new Error("Failed to fetch campaign");
      }

      const data = await response.json();
      const campaignData = data.campaign;
      setCampaign(campaignData);

      const filters = campaignData.lead_filters || {};
      // Extract bonus rule amounts from array format
      const provenInstallRule = (campaignData.bonus_rules || []).find((r: any) => r.trigger === "proven_install");
      setFormData({
        name: campaignData.name || "",
        description: campaignData.description || "",
        status: campaignData.status || "active",
        email_address: campaignData.email_address || "",
        email_from_name: campaignData.email_from_name || "",
        email_signature: campaignData.email_signature || "",
        capital_budget_usd: campaignData.capital_budget_usd !== undefined && campaignData.capital_budget_usd !== null ? campaignData.capital_budget_usd : "",
        bonus_rules: {
          proven_install_sdr: provenInstallRule?.sdr_amount ?? "",
          proven_install_activator: provenInstallRule?.activator_amount ?? "",
        },
        lead_filters: {
          require_website: filters.require_website || false,
          require_phone: filters.require_phone || false,
          require_email: filters.require_email || false,
          min_rating: filters.min_rating !== undefined ? filters.min_rating : "",
          min_reviews: filters.min_reviews !== undefined ? filters.min_reviews : "",
        },
      });
    } catch (error: any) {
      console.error("Error fetching campaign:", error);
      toast.error("Failed to load campaign");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSenders = async () => {
    setSendersLoading(true);
    setSendersError(null);
    try {
      const response = await fetch("/api/brevo/senders");
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load Brevo senders");
      }
      const data = await response.json();
      setSenders(data.senders || []);
    } catch (error: any) {
      console.error("Error fetching Brevo senders:", error);
      setSendersError(error.message || "Failed to load Brevo senders");
    } finally {
      setSendersLoading(false);
    }
  };

  const fetchTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const [emailRes, smsRes] = await Promise.all([
        fetch("/api/email/templates"),
        fetch("/api/sms/templates"),
      ]);

      if (emailRes.ok) {
        const emailData = await emailRes.json();
        // Filter to only templates for this campaign
        const campaignEmailTemplates = (emailData.templates || []).filter(
          (t: any) => t.campaignId === campaignId
        );
        setEmailTemplates(campaignEmailTemplates);
      }

      if (smsRes.ok) {
        const smsData = await smsRes.json();
        // Filter to only templates for this campaign
        const campaignSmsTemplates = (smsData.templates || []).filter(
          (t: any) => t.campaignId === campaignId
        );
        setSmsTemplates(campaignSmsTemplates);
      }
    } catch (error) {
      console.error("Error fetching templates:", error);
    } finally {
      setTemplatesLoading(false);
    }
  };

  const fetchCallScripts = async () => {
    try {
      const response = await fetch(`/api/call-scripts?campaignId=${campaignId}`);
      if (response.ok) {
        const data = await response.json();
        setCallScripts(data.scripts || []);
      }
    } catch (error) {
      console.error("Error fetching call scripts:", error);
    }
  };

  const fetchCampaignGoals = async () => {
    setGoalsLoading(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/goals`);
      if (response.ok) {
        const data = await response.json();
        if (data.goals) {
          setGoalsData({
            provenInstallsPer40h: String(data.goals.proven_installs_per_40h || 4),
            scheduledApptsPer40h: String(data.goals.scheduled_appts_per_40h || 8),
            conversationsPer40h: String(data.goals.conversations_per_40h || 200),
            targetWeeklyHours: String(data.goals.target_weekly_hours || 40),
          });
        }
      }
    } catch (error) {
      console.error("Error fetching campaign goals:", error);
    } finally {
      setGoalsLoading(false);
    }
  };

  const saveCampaignGoals = async () => {
    setGoalsSaving(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/goals`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proven_installs_per_40h: parseInt(goalsData.provenInstallsPer40h) || 4,
          scheduled_appts_per_40h: parseInt(goalsData.scheduledApptsPer40h) || 8,
          conversations_per_40h: parseInt(goalsData.conversationsPer40h) || 200,
          target_weekly_hours: parseInt(goalsData.targetWeeklyHours) || 40,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save goals");
      }

      toast.success("Campaign goals saved");
    } catch (error: any) {
      console.error("Error saving campaign goals:", error);
      toast.error(error.message || "Failed to save goals");
    } finally {
      setGoalsSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error("Campaign name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          status: formData.status,
          email_address: formData.email_address.trim() || null,
          email_from_name: formData.email_from_name.trim() || null,
          email_signature: formData.email_signature || null,
          capital_budget_usd: formData.capital_budget_usd !== "" ? Number(formData.capital_budget_usd) : null,
          bonus_rules: (() => {
            const rules = [];
            if (formData.bonus_rules.proven_install_sdr || formData.bonus_rules.proven_install_activator) {
              rules.push({
                trigger: "proven_install",
                sdr_amount: Number(formData.bonus_rules.proven_install_sdr) || 0,
                activator_amount: Number(formData.bonus_rules.proven_install_activator) || 0,
              });
            }
            return rules;
          })(),
          lead_filters: {
            require_website: formData.lead_filters.require_website || undefined,
            require_phone: formData.lead_filters.require_phone || undefined,
            require_email: formData.lead_filters.require_email || undefined,
            min_rating: formData.lead_filters.min_rating ? Number(formData.lead_filters.min_rating) : undefined,
            min_reviews: formData.lead_filters.min_reviews ? Number(formData.lead_filters.min_reviews) : undefined,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update campaign");
      }

      toast.success("Campaign updated successfully");
      router.push("/dashboard/admin/campaigns");
    } catch (error: any) {
      console.error("Error updating campaign:", error);
      toast.error(error.message || "Failed to update campaign");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Email template handlers
  const handleCreateEmailTemplate = () => {
    setIsCreatingEmail(true);
    setEditingEmailTemplate(null);
    setEmailForm({
      name: "",
      subject: "",
      htmlContent: "",
      textContent: "",
      isQuick: false,
      quickLabel: "",
    });
  };

  const handleEditEmailTemplate = (template: EmailTemplate) => {
    setEditingEmailTemplate(template);
    setIsCreatingEmail(false);
    setEmailForm({
      name: template.name,
      subject: template.subject,
      htmlContent: template.htmlContent,
      textContent: template.textContent || "",
      isQuick: template.isQuick || false,
      quickLabel: template.quickLabel || "",
    });
  };

  const handleSaveEmailTemplate = async () => {
    if (!emailForm.name.trim() || !emailForm.subject.trim() || !emailForm.htmlContent.trim()) {
      toast.error("Name, subject, and content are required");
      return;
    }

    setTemplateSaving(true);
    try {
      const url = editingEmailTemplate
        ? `/api/email/templates/${editingEmailTemplate.id}`
        : "/api/email/templates";
      
      const method = editingEmailTemplate ? "PATCH" : "POST";
      
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...emailForm,
          campaignId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save template");
      }

      toast.success(editingEmailTemplate ? "Template updated" : "Template created");
      setEditingEmailTemplate(null);
      setIsCreatingEmail(false);
      fetchTemplates();
    } catch (error: any) {
      toast.error(error.message || "Failed to save template");
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleDeleteEmailTemplate = async (templateId: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;

    try {
      const response = await fetch(`/api/email/templates/${templateId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete template");
      }

      toast.success("Template deleted");
      fetchTemplates();
    } catch (error) {
      toast.error("Failed to delete template");
    }
  };

  // SMS template handlers
  const handleCreateSmsTemplate = () => {
    setIsCreatingSms(true);
    setEditingSmsTemplate(null);
    setSmsForm({
      name: "",
      message: "",
      isActive: true,
    });
  };

  const handleEditSmsTemplate = (template: SMSTemplate) => {
    setEditingSmsTemplate(template);
    setIsCreatingSms(false);
    setSmsForm({
      name: template.name,
      message: template.message,
      isActive: template.isActive,
    });
  };

  const handleSaveSmsTemplate = async () => {
    if (!smsForm.name.trim() || !smsForm.message.trim()) {
      toast.error("Name and message are required");
      return;
    }

    if (smsForm.message.length > 1600) {
      toast.error("Message too long (max 1600 characters)");
      return;
    }

    setTemplateSaving(true);
    try {
      const url = editingSmsTemplate
        ? `/api/sms/templates/${editingSmsTemplate.id}`
        : "/api/sms/templates";
      
      const method = editingSmsTemplate ? "PUT" : "POST";
      
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...smsForm,
          campaignId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save template");
      }

      toast.success(editingSmsTemplate ? "Template updated" : "Template created");
      setEditingSmsTemplate(null);
      setIsCreatingSms(false);
      fetchTemplates();
    } catch (error: any) {
      toast.error(error.message || "Failed to save template");
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleDeleteSmsTemplate = async (templateId: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;

    try {
      const response = await fetch(`/api/sms/templates/${templateId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete template");
      }

      toast.success("Template deleted");
      fetchTemplates();
    } catch (error) {
      toast.error("Failed to delete template");
    }
  };

  // Call script handlers
  const handleCreateCallScript = () => {
    setIsCreatingScript(true);
    setEditingCallScript(null);
    setScriptForm({
      name: "",
      content: "",
      isActive: true,
      scriptKey: "",
    });
  };

  const handleEditCallScript = (script: CallScript) => {
    setEditingCallScript(script);
    setIsCreatingScript(false);
    setScriptForm({
      name: script.name,
      content: script.content,
      isActive: script.isActive,
      scriptKey: script.scriptKey || script.badgeKey || "",
    });
  };

  const handleSaveCallScript = async () => {
    if (!scriptForm.name.trim() || !scriptForm.content.trim()) {
      toast.error("Name and content are required");
      return;
    }

    setTemplateSaving(true);
    try {
      const url = editingCallScript
        ? `/api/call-scripts/${editingCallScript.id}`
        : "/api/call-scripts";
      
      const method = editingCallScript ? "PATCH" : "POST";
      
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...scriptForm,
          campaignId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save script");
      }

      toast.success(editingCallScript ? "Script updated" : "Script created");
      setEditingCallScript(null);
      setIsCreatingScript(false);
      fetchCallScripts();
    } catch (error: any) {
      toast.error(error.message || "Failed to save script");
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleDeleteCallScript = async (scriptId: string) => {
    if (!confirm("Are you sure you want to delete this script?")) return;

    try {
      const response = await fetch(`/api/call-scripts/${scriptId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete script");
      }

      toast.success("Script deleted");
      fetchCallScripts();
    } catch (error) {
      toast.error("Failed to delete script");
    }
  };

  const cancelTemplateEdit = () => {
    setEditingEmailTemplate(null);
    setEditingSmsTemplate(null);
    setEditingCallScript(null);
    setIsCreatingEmail(false);
    setIsCreatingSms(false);
    setIsCreatingScript(false);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!campaign) {
    return null;
  }

  return (
    <>
      <Toaster position="top-right" />
      <div className="max-w-5xl mx-auto">
        {/* Header with breadcrumb */}
        <div className="mb-6">
          <Link
            href="/dashboard/admin/campaigns"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Campaigns
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Tag className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Edit Campaign</h1>
              <p className="text-sm text-gray-600">
                Update settings for &quot;{campaign.name}&quot;
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <Input
                    label="Campaign Name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Q1 Sales Campaign"
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Optional description for this campaign..."
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        status: e.target.value as "active" | "paused" | "archived",
                      })
                    }
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Capital Budget (USD)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={formData.capital_budget_usd}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          capital_budget_usd: e.target.value,
                        })
                      }
                      placeholder="e.g., 5000"
                      className="w-full rounded-lg border border-gray-300 pl-8 pr-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Max spend for governance tracking. Leave empty for unlimited.
                  </p>
                </div>
              </div>

              {/* Bonus Rules Section */}
              <div className="border-t pt-6 mt-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-green-600" />
                  Bonus Rules
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Configure automatic bonuses when milestones are achieved.
                </p>
                
                <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                  <div className="font-medium text-gray-700">Proven Install (credits 20→19)</div>
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="SDR Bonus ($)"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.bonus_rules.proven_install_sdr}
                      onChange={(e) => setFormData({
                        ...formData,
                        bonus_rules: {
                          ...formData.bonus_rules,
                          proven_install_sdr: e.target.value,
                        },
                      })}
                      placeholder="e.g., 8.00"
                    />
                    <Input
                      label="Activator Bonus ($)"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.bonus_rules.proven_install_activator}
                      onChange={(e) => setFormData({
                        ...formData,
                        bonus_rules: {
                          ...formData.bonus_rules,
                          proven_install_activator: e.target.value,
                        },
                      })}
                      placeholder="e.g., 8.00"
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    SDR who scheduled the install and Activator who completed it will each receive these amounts when the calculator proves live (first credit used).
                  </p>
                </div>
              </div>
            </div>

            {/* Two-column layout for settings */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Email Settings */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Email Settings</h2>
                  <span className="text-xs text-gray-500">Used for outbound emails</span>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Sender Email (verified in Brevo)
                    </label>
                    {sendersLoading ? (
                      <div className="flex items-center gap-2 text-sm text-gray-600 py-3">
                        <LoadingSpinner size="sm" />
                        Loading verified senders...
                      </div>
                    ) : sendersError ? (
                      <div className="space-y-2">
                        <p className="text-sm text-red-700">
                          {sendersError}. You can still type an email below.
                        </p>
                        <input
                          type="email"
                          value={formData.email_address}
                          onChange={(e) => setFormData({ ...formData, email_address: e.target.value })}
                          placeholder="info@junkcarcalc.com"
                          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    ) : senders.length === 0 ? (
                      <div className="bg-yellow-50 border border-yellow-200 text-yellow-900 text-sm rounded-lg p-3">
                        No verified senders found in Brevo. Add one in Brevo, then refresh.
                      </div>
                    ) : (
                      <select
                        value={formData.email_address}
                        onChange={(e) => {
                          const email = e.target.value;
                          const sender = senders.find((s) => s.email === email);
                          setFormData((prev) => ({
                            ...prev,
                            email_address: email,
                            email_from_name: sender?.name || prev.email_from_name,
                          }));
                        }}
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Select a verified sender</option>
                        {formData.email_address &&
                          !senders.find((s) => s.email === formData.email_address) && (
                            <option value={formData.email_address}>
                              {formData.email_from_name
                                ? `${formData.email_from_name} <${formData.email_address}>`
                                : formData.email_address}
                            </option>
                          )}
                        {senders.map((sender) => (
                          <option key={sender.id} value={sender.email}>
                            {sender.name ? `${sender.name} <${sender.email}>` : sender.email}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <Input
                    label="Sender Name"
                    value={formData.email_from_name}
                    onChange={(e) => setFormData({ ...formData, email_from_name: e.target.value })}
                    placeholder="Junk Car Calculator Team"
                  />

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email Signature (optional, HTML allowed)
                    </label>
                    <textarea
                      value={formData.email_signature}
                      onChange={(e) => setFormData({ ...formData, email_signature: e.target.value })}
                      placeholder="<p>Best regards,<br/>Junk Car Calculator Team</p>"
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                      rows={4}
                    />
                  </div>

                  <div className="text-xs text-gray-600 bg-gray-50 border border-dashed border-gray-300 rounded-lg p-3">
                    Email address and domain must be verified in Brevo (sending) and Mailgun (receiving replies).
                  </div>
                </div>
              </div>

              {/* Lead Quality Filters */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Lead Quality Filters</h2>
                  <span className="text-xs text-gray-500">Leads must meet these criteria</span>
                </div>
                <div className="space-y-4">
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                      <input
                        type="checkbox"
                        checked={formData.lead_filters.require_website}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            lead_filters: { ...formData.lead_filters, require_website: e.target.checked },
                          })
                        }
                        className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <span className="text-sm text-gray-700">Require website</span>
                    </label>
                    <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                      <input
                        type="checkbox"
                        checked={formData.lead_filters.require_phone}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            lead_filters: { ...formData.lead_filters, require_phone: e.target.checked },
                          })
                        }
                        className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <span className="text-sm text-gray-700">Require phone number</span>
                    </label>
                    <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                      <input
                        type="checkbox"
                        checked={formData.lead_filters.require_email}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            lead_filters: { ...formData.lead_filters, require_email: e.target.checked },
                          })
                        }
                        className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <span className="text-sm text-gray-700">Require email address</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Minimum Rating (0-5)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="5"
                        step="0.1"
                        value={formData.lead_filters.min_rating}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            lead_filters: { ...formData.lead_filters, min_rating: e.target.value || "" },
                          })
                        }
                        placeholder="0"
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Minimum Reviews
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formData.lead_filters.min_reviews}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            lead_filters: { ...formData.lead_filters, min_reviews: e.target.value || "" },
                          })
                        }
                        placeholder="0"
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div className="text-xs text-gray-600 bg-gray-50 border border-dashed border-gray-300 rounded-lg p-3">
                    Leads that don&apos;t meet these criteria will be rejected when claiming for this campaign.
                  </div>
                </div>
              </div>

              {/* Campaign Goals / KPI Targets */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">SDR Performance Goals</h2>
                  <span className="text-xs text-gray-500">Targets for daily/weekly reports</span>
                </div>
                {goalsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <LoadingSpinner size="md" />
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Rate-Based Goals (per 40 hours worked) */}
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-3">Rate-Based Goals (per 40 hours worked)</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Target Weekly Hours</label>
                          <input
                            type="number"
                            step="1"
                            min="0"
                            value={goalsData.targetWeeklyHours}
                            onChange={(e) => setGoalsData({ ...goalsData, targetWeeklyHours: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <span className="text-xs text-gray-400">Baseline hours for rate calculations</span>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Proven Installs per 40h</label>
                          <input
                            type="number"
                            step="1"
                            min="0"
                            value={goalsData.provenInstallsPer40h}
                            onChange={(e) => setGoalsData({ ...goalsData, provenInstallsPer40h: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <span className="text-xs text-gray-400">Installs with credits &lt; 20</span>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Scheduled Appointments per 40h</label>
                          <input
                            type="number"
                            step="1"
                            min="0"
                            value={goalsData.scheduledApptsPer40h}
                            onChange={(e) => setGoalsData({ ...goalsData, scheduledApptsPer40h: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Conversations per 40h</label>
                          <input
                            type="number"
                            step="1"
                            min="0"
                            value={goalsData.conversationsPer40h}
                            onChange={(e) => setGoalsData({ ...goalsData, conversationsPer40h: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                      <div className="text-xs text-gray-500">
                        Goals are used to calculate status colors (green/yellow/red) in SDR reports.
                      </div>
                      <button
                        type="button"
                        onClick={saveCampaignGoals}
                        disabled={goalsSaving}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition-colors"
                      >
                        {goalsSaving ? <LoadingSpinner size="sm" /> : <Save className="w-4 h-4" />}
                        {goalsSaving ? "Saving..." : "Save Goals"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons for campaign settings */}
            <div className="flex items-center justify-end gap-4">
              <Link href="/dashboard/admin/campaigns">
                <Button variant="outline" type="button">
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                disabled={isSubmitting}
                leftIcon={isSubmitting ? <LoadingSpinner size="sm" /> : <Save className="w-4 h-4" />}
              >
                {isSubmitting ? "Saving..." : "Save Campaign Settings"}
              </Button>
            </div>
          </div>
        </form>

        {/* Script Coverage Section */}
        <div className="mt-8 bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Phone className="w-5 h-5 text-purple-600" />
              <h2 className="text-lg font-semibold text-gray-900">Script Coverage</h2>
            </div>
            
            {/* Coverage Checklist */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {REQUIRED_SCRIPTS.map(({ key, label, category }) => {
                const hasScript = callScripts.some(s => s.scriptKey === key && s.isActive);
                return (
                  <div 
                    key={key}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      hasScript 
                        ? "bg-green-50 border-green-200" 
                        : "bg-red-50 border-red-200"
                    }`}
                  >
                    <span className={`text-lg ${hasScript ? "text-green-500" : "text-red-500"}`}>
                      {hasScript ? "✅" : "❌"}
                    </span>
                    <div>
                      <div className={`text-sm font-medium ${hasScript ? "text-green-800" : "text-red-800"}`}>
                        {label}
                      </div>
                      <div className="text-xs text-gray-500">{category}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Explainer */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">How Scripts Work</h4>
              <p className="text-sm text-blue-800 mb-3">
                Scripts auto-load in the dialer based on the lead's situation (prospecting, follow-up, rescue). 
                SDRs do not choose scripts manually — the dialer selects and shows the correct one.
              </p>
              <div className="text-sm text-blue-700">
                <strong>Rescue scripts (high priority):</strong>
                <ul className="list-disc ml-5 mt-1 space-y-1">
                  <li><strong>Password Not Set:</strong> 2–24h after trial started, still no password</li>
                  <li><strong>Not Activated:</strong> 2–48h after password set, never logged in or configured</li>
                </ul>
              </div>
              <p className="text-xs text-blue-600 mt-3">
                If a script is missing, the dialer falls back to the campaign's default pitch script.
              </p>
            </div>
          </div>
        </div>

        {/* Templates Section */}
        <div className="mt-8 bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-gray-600" />
              <h2 className="text-lg font-semibold text-gray-900">Message Templates</h2>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Create and manage email and SMS templates for this campaign
            </p>
          </div>

          {/* Template Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex">
              <button
                type="button"
                onClick={() => setActiveTemplateTab("email")}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTemplateTab === "email"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <Mail className="inline w-4 h-4 mr-2" />
                Email Templates ({emailTemplates.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTemplateTab("sms")}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTemplateTab === "sms"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <MessageSquare className="inline w-4 h-4 mr-2" />
                SMS Templates ({smsTemplates.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTemplateTab("scripts")}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTemplateTab === "scripts"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <Phone className="inline w-4 h-4 mr-2" />
                Call Scripts ({callScripts.length})
              </button>
            </nav>
          </div>

          <div className="p-6">
            {templatesLoading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner size="lg" />
              </div>
            ) : activeTemplateTab === "email" ? (
              <>
                {/* Email Templates */}
                {!isCreatingEmail && !editingEmailTemplate && (
                  <Button
                    type="button"
                    onClick={handleCreateEmailTemplate}
                    leftIcon={<Plus className="w-4 h-4" />}
                    className="mb-4"
                  >
                    Create Email Template
                  </Button>
                )}

                {/* Email Template Form */}
                {(isCreatingEmail || editingEmailTemplate) && (
                  <div className="mb-6 p-4 border-2 border-blue-200 rounded-lg bg-blue-50">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-900">
                        {editingEmailTemplate ? "Edit Email Template" : "Create Email Template"}
                      </h3>
                      <button
                        type="button"
                        onClick={cancelTemplateEdit}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="space-y-4">
                      <Input
                        label="Template Name"
                        value={emailForm.name}
                        onChange={(e) => setEmailForm({ ...emailForm, name: e.target.value })}
                        placeholder="e.g., Introduction Email"
                      />
                      <Input
                        label="Subject Line"
                        value={emailForm.subject}
                        onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                        placeholder="e.g., Business Opportunity for {{name}}"
                      />
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          HTML Content
                        </label>
                        <textarea
                          value={emailForm.htmlContent}
                          onChange={(e) => setEmailForm({ ...emailForm, htmlContent: e.target.value })}
                          placeholder="<p>Hello {{name}},</p>..."
                          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                          rows={8}
                        />
                        <div className="mt-2 p-3 bg-gray-100 rounded-lg border border-gray-200">
                          <p className="text-xs font-semibold text-gray-700 mb-2">Available Variables:</p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            <div><code className="bg-white px-1 rounded">{"{{name}}"}</code> — Business name</div>
                            <div><code className="bg-white px-1 rounded">{"{{address}}"}</code> — Business address</div>
                            <div><code className="bg-white px-1 rounded">{"{{email}}"}</code> — Business email</div>
                            <div><code className="bg-white px-1 rounded">{"{{phone}}"}</code> — Business phone</div>
                            <div><code className="bg-white px-1 rounded">{"{{sender_name}}"}</code> — Your first name</div>
                            <div><code className="bg-white px-1 rounded">{"{{tracking_url}}"}</code> — Open tracking pixel</div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={emailForm.isQuick}
                            onChange={(e) => setEmailForm({ ...emailForm, isQuick: e.target.checked })}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="text-sm text-gray-700">Quick Template</span>
                        </label>
                        {emailForm.isQuick && (
                          <Input
                            label=""
                            value={emailForm.quickLabel}
                            onChange={(e) => setEmailForm({ ...emailForm, quickLabel: e.target.value })}
                            placeholder="Quick label (e.g., Pricing)"
                            className="flex-1"
                          />
                        )}
                      </div>
                      <div className="flex gap-3 justify-end pt-2">
                        <Button variant="outline" type="button" onClick={cancelTemplateEdit}>
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          onClick={handleSaveEmailTemplate}
                          disabled={templateSaving}
                          leftIcon={templateSaving ? <LoadingSpinner size="sm" /> : <Save className="w-4 h-4" />}
                        >
                          {templateSaving ? "Saving..." : "Save Template"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Email Templates List */}
                {emailTemplates.length === 0 && !isCreatingEmail ? (
                  <div className="text-center py-8 text-gray-500">
                    <Mail className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>No email templates yet</p>
                    <p className="text-sm">Create your first email template to get started</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {emailTemplates.map((template) => (
                      <div
                        key={template.id}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-gray-900">{template.name}</h4>
                            {template.isQuick && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 rounded">
                                Quick
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">{template.subject}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditEmailTemplate(template)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEmailTemplate(template.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : activeTemplateTab === "sms" ? (
              <>
                {/* SMS Templates */}
                {!isCreatingSms && !editingSmsTemplate && (
                  <Button
                    type="button"
                    onClick={handleCreateSmsTemplate}
                    leftIcon={<Plus className="w-4 h-4" />}
                    className="mb-4"
                  >
                    Create SMS Template
                  </Button>
                )}

                {/* SMS Template Form */}
                {(isCreatingSms || editingSmsTemplate) && (
                  <div className="mb-6 p-4 border-2 border-green-200 rounded-lg bg-green-50">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-900">
                        {editingSmsTemplate ? "Edit SMS Template" : "Create SMS Template"}
                      </h3>
                      <button
                        type="button"
                        onClick={cancelTemplateEdit}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="space-y-4">
                      <Input
                        label="Template Name"
                        value={smsForm.name}
                        onChange={(e) => setSmsForm({ ...smsForm, name: e.target.value })}
                        placeholder="e.g., Initial Contact"
                      />
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Message
                        </label>
                        <textarea
                          value={smsForm.message}
                          onChange={(e) => setSmsForm({ ...smsForm, message: e.target.value })}
                          placeholder="Hi {{name}}! We buy junk cars for cash..."
                          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          rows={4}
                          maxLength={1600}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {smsForm.message.length} / 1600 characters
                        </p>
                        <div className="mt-2 p-3 bg-green-100 rounded-lg border border-green-200">
                          <p className="text-xs font-semibold text-gray-700 mb-2">Available Variables:</p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            <div><code className="bg-white px-1 rounded">{"{{name}}"}</code> — Business name</div>
                            <div><code className="bg-white px-1 rounded">{"{{address}}"}</code> — Business address</div>
                            <div><code className="bg-white px-1 rounded">{"{{sender_name}}"}</code> — Your first name</div>
                            <div><code className="bg-white px-1 rounded">{"{{phone}}"}</code> — Business phone</div>
                            <div><code className="bg-white px-1 rounded">{"{{tracking_url}}"}</code> — Your signup link</div>
                          </div>
                        </div>
                      </div>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={smsForm.isActive}
                          onChange={(e) => setSmsForm({ ...smsForm, isActive: e.target.checked })}
                          className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                        />
                        <span className="text-sm text-gray-700">Active</span>
                      </label>
                      <div className="flex gap-3 justify-end pt-2">
                        <Button variant="outline" type="button" onClick={cancelTemplateEdit}>
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          onClick={handleSaveSmsTemplate}
                          disabled={templateSaving}
                          leftIcon={templateSaving ? <LoadingSpinner size="sm" /> : <Save className="w-4 h-4" />}
                        >
                          {templateSaving ? "Saving..." : "Save Template"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* SMS Templates List */}
                {smsTemplates.length === 0 && !isCreatingSms ? (
                  <div className="text-center py-8 text-gray-500">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>No SMS templates yet</p>
                    <p className="text-sm">Create your first SMS template to get started</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {smsTemplates.map((template) => (
                      <div
                        key={template.id}
                        className={`flex items-center justify-between p-4 rounded-lg border ${
                          template.isActive
                            ? "bg-green-50 border-green-200"
                            : "bg-gray-50 border-gray-200"
                        }`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-gray-900">{template.name}</h4>
                            {!template.isActive && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-600 rounded">
                                Inactive
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{template.message}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditSmsTemplate(template)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSmsTemplate(template.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Call Scripts */}
                {!isCreatingScript && !editingCallScript && (
                  <Button
                    type="button"
                    onClick={handleCreateCallScript}
                    leftIcon={<Plus className="w-4 h-4" />}
                    className="mb-4"
                  >
                    Create Call Script
                  </Button>
                )}

                {/* Call Script Form */}
                {(isCreatingScript || editingCallScript) && (
                  <div className="mb-6 p-4 border-2 border-purple-200 rounded-lg bg-purple-50">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-900">
                        {editingCallScript ? "Edit Call Script" : "Create Call Script"}
                      </h3>
                      <button
                        type="button"
                        onClick={cancelTemplateEdit}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="space-y-4">
                      <Input
                        label="Script Name"
                        value={scriptForm.name}
                        onChange={(e) => setScriptForm({ ...scriptForm, name: e.target.value })}
                        placeholder="e.g., Cold Call Intro, Follow-up Script, Objection Handling"
                      />
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Script Situation (Auto-Routing Key)
                        </label>
                        <select
                          value={scriptForm.scriptKey}
                          onChange={(e) => setScriptForm({ ...scriptForm, scriptKey: e.target.value })}
                          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        >
                          {SCRIPT_KEY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                          The dialer auto-selects the right script based on this key. Rescue scripts are highest priority.
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Script Content
                        </label>
                        <textarea
                          value={scriptForm.content}
                          onChange={(e) => setScriptForm({ ...scriptForm, content: e.target.value })}
                          placeholder="Hi, this is {{sender_name}} calling from..."
                          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          rows={10}
                        />
                        <div className="mt-2 p-3 bg-purple-100 rounded-lg border border-purple-200">
                          <p className="text-xs font-semibold text-gray-700 mb-2">Available Variables:</p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            <div><code className="bg-white px-1 rounded">{"{{name}}"}</code> — Business name</div>
                            <div><code className="bg-white px-1 rounded">{"{{address}}"}</code> — Business address</div>
                            <div><code className="bg-white px-1 rounded">{"{{phone}}"}</code> — Business phone</div>
                            <div><code className="bg-white px-1 rounded">{"{{sender_name}}"}</code> — Your first name</div>
                          </div>
                          <p className="text-xs text-gray-600 mt-2">
                            💡 Tip: Use line breaks and bullet points to organize your script into sections.
                          </p>
                        </div>
                      </div>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={scriptForm.isActive}
                          onChange={(e) => setScriptForm({ ...scriptForm, isActive: e.target.checked })}
                          className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                        />
                        <span className="text-sm text-gray-700">Active</span>
                      </label>
                      <div className="flex gap-3 justify-end pt-2">
                        <Button variant="outline" type="button" onClick={cancelTemplateEdit}>
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          onClick={handleSaveCallScript}
                          disabled={templateSaving}
                          leftIcon={templateSaving ? <LoadingSpinner size="sm" /> : <Save className="w-4 h-4" />}
                        >
                          {templateSaving ? "Saving..." : "Save Script"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Call Scripts List */}
                {callScripts.length === 0 && !isCreatingScript ? (
                  <div className="text-center py-8 text-gray-500">
                    <Phone className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>No call scripts yet</p>
                    <p className="text-sm">Create scripts your reps can use during calls</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {callScripts.map((script) => (
                      <div
                        key={script.id}
                        className={`flex items-start justify-between p-4 rounded-lg border ${
                          script.isActive
                            ? "bg-purple-50 border-purple-200"
                            : "bg-gray-50 border-gray-200"
                        }`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-medium text-gray-900">{script.name}</h4>
                            {(script.scriptKey || script.badgeKey) && (
                              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                (script.scriptKey || "").startsWith("RESCUE_") 
                                  ? "bg-orange-100 text-orange-700" 
                                  : "bg-purple-100 text-purple-700"
                              }`}>
                                {SCRIPT_KEY_OPTIONS.find(s => s.value === (script.scriptKey || script.badgeKey))?.label || script.scriptKey || script.badgeKey}
                              </span>
                            )}
                            {!script.isActive && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-600 rounded">
                                Inactive
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-1 line-clamp-3 whitespace-pre-wrap">{script.content}</p>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <button
                            type="button"
                            onClick={() => handleEditCallScript(script)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCallScript(script.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
