"use client";

import { useState, useEffect } from "react";
import { Settings, Mail, Users, Shield, Save, Link2, Copy, Check } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import Button from "@/components/Button";
import Input from "@/components/Input";

interface OrgSettings {
  enable_email_scraping: boolean;
  enable_email_outreach: boolean;
  default_lead_assignment_mode: "manual" | "round_robin";
  max_leads_per_search: number;
}

interface EmailSettings {
  defaultFromName: string;
  defaultFromEmail: string;
  defaultReplyTo: string;
  emailSignature: string;
  inboundSubdomain: string;
}

interface UserSettings {
  preferredOutboundNumber: string;
  rememberOutboundNumber: boolean;
  autoCallSingleNumber: boolean;
  preferredCallMode: "webrtc" | "live" | "voicemail";
}

interface PhoneOption {
  value: string;
  label: string;
}

export default function SettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [settings, setSettings] = useState<OrgSettings>({
    enable_email_scraping: true,
    enable_email_outreach: true,
    default_lead_assignment_mode: "manual",
    max_leads_per_search: 200,
  });
  const [emailSettings, setEmailSettings] = useState<EmailSettings>({
    defaultFromName: "",
    defaultFromEmail: "",
    defaultReplyTo: "",
    emailSignature: "",
    inboundSubdomain: "",
  });
  const [availableNumbers, setAvailableNumbers] = useState<PhoneOption[]>([]);
  const [selectedPreferredNumber, setSelectedPreferredNumber] = useState("");
  const [rememberDialerChoice, setRememberDialerChoice] = useState(false);
  const [autoCallSingleNumber, setAutoCallSingleNumber] = useState(true);
  const [preferredCallMode, setPreferredCallMode] = useState<"webrtc" | "live" | "voicemail" | "">("webrtc");
  const [isLoadingUserSettings, setIsLoadingUserSettings] = useState(true);
  const [isSavingUserSettings, setIsSavingUserSettings] = useState(false);
  const [assignedCallerId, setAssignedCallerId] = useState<string | null>(null);
  
  // SDR Tracking Link state
  const [sdrCode, setSdrCode] = useState("");
  const [editingSdrCode, setEditingSdrCode] = useState("");
  const [isEditingSdrCode, setIsEditingSdrCode] = useState(false);
  const [isSavingSdrCode, setIsSavingSdrCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  
  // Calculator trial signup URL
  const JCC_SIGNUP_BASE_URL = process.env.NEXT_PUBLIC_JCC_SIGNUP_URL || "https://autosalvageautomation.com/try-the-calculator";

  useEffect(() => {
    fetchSettings();
    fetchEmailSettings();
    fetchUserSettings();
    fetchCallerIds();
  }, []);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/settings/organization");
      const data = await response.json();

      if (response.ok) {
        setSettings(data.settings);
        setIsAdmin(data.isAdmin);
      } else {
        toast.error(data.error || "Failed to load settings");
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
      toast.error("Failed to load settings");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchEmailSettings = async () => {
    try {
      const response = await fetch("/api/settings/email");
      const data = await response.json();

      if (response.ok && data.settings) {
        setEmailSettings({
          defaultFromName: data.settings.defaultFromName || "",
          defaultFromEmail: data.settings.defaultFromEmail || "",
          defaultReplyTo: data.settings.defaultReplyTo || "",
          emailSignature: data.settings.emailSignature || "",
          inboundSubdomain: data.settings.inboundSubdomain || "",
        });
      }
    } catch (error) {
      console.error("Error fetching email settings:", error);
    }
  };

  const fetchUserSettings = async () => {
    setIsLoadingUserSettings(true);
    try {
      const response = await fetch("/api/settings/user");
      const data = await response.json();

      if (response.ok && data.settings) {
        const normalized: UserSettings = {
          preferredOutboundNumber: data.settings.preferredOutboundNumber || "",
          rememberOutboundNumber: data.settings.rememberOutboundNumber ?? false,
          autoCallSingleNumber: data.settings.autoCallSingleNumber ?? true,
          preferredCallMode: data.settings.preferredCallMode || "webrtc",
        };
        setSelectedPreferredNumber(normalized.preferredOutboundNumber);
        setRememberDialerChoice(normalized.rememberOutboundNumber);
        setAutoCallSingleNumber(normalized.autoCallSingleNumber);
        setPreferredCallMode(normalized.preferredCallMode || "webrtc");
      } else if (!response.ok) {
        toast.error(data.error || "Failed to load user settings");
      }
    } catch (error) {
      console.error("Error fetching user settings:", error);
      toast.error("Failed to load user settings");
    } finally {
      setIsLoadingUserSettings(false);
    }
  };

  const fetchCallerIds = async () => {
    try {
      const profileRes = await fetch("/api/auth/profile");
      if (!profileRes.ok) return;
      const profileData = await profileRes.json();
      const role = profileData.role || "member";
      const assigned = profileData.profile?.phone_number || null;
      const userSdrCode = profileData.profile?.sdr_code || "";
      const options: PhoneOption[] = [];

      // Set SDR code from profile
      setSdrCode(userSdrCode);
      setEditingSdrCode(userSdrCode);

      if (assigned) {
        options.push({ value: assigned, label: `${assigned} (Your assigned)` });
        setAssignedCallerId(assigned);
      } else {
        setAssignedCallerId(null);
      }

      if (role === "admin") {
        const numbersRes = await fetch("/api/twilio/numbers");
        if (numbersRes.ok) {
          const numbersData = await numbersRes.json();
          numbersData.numbers?.forEach((n: { phoneNumber: string }) => {
            if (!options.find((opt) => opt.value === n.phoneNumber)) {
              options.push({ value: n.phoneNumber, label: n.phoneNumber });
            }
          });
        }
      }

      setAvailableNumbers(options);
      // If there's only one option and nothing is selected, auto-select it for convenience
      if (options.length === 1 && !selectedPreferredNumber) {
        setSelectedPreferredNumber(options[0].value);
      }
    } catch (error) {
      console.error("Error fetching caller IDs:", error);
    }
  };

  const handleSaveSdrCode = async () => {
    setIsSavingSdrCode(true);
    try {
      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdr_code: editingSdrCode }),
      });

      const data = await response.json();

      if (response.ok) {
        setSdrCode(data.profile?.sdr_code || "");
        setEditingSdrCode(data.profile?.sdr_code || "");
        setIsEditingSdrCode(false);
        toast.success("SDR tracking code saved!");
      } else {
        throw new Error(data.error || "Failed to save SDR code");
      }
    } catch (error: any) {
      console.error("Error saving SDR code:", error);
      toast.error(error.message || "Failed to save SDR code");
    } finally {
      setIsSavingSdrCode(false);
    }
  };

  const getTrackingLink = () => {
    if (!sdrCode) return "";
    return `${JCC_SIGNUP_BASE_URL}?sdr=${encodeURIComponent(sdrCode)}`;
  };

  const copyTrackingLink = async () => {
    const link = getTrackingLink();
    if (!link) {
      toast.error("Set your SDR code first");
      return;
    }
    
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (error) {
      toast.error("Failed to copy link");
    }
  };

  const handleSaveEmailSettings = async () => {
    if (!isAdmin) {
      toast.error("Only admins can update email settings");
      return;
    }

    setIsSavingEmail(true);
    try {
      const response = await fetch("/api/settings/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(emailSettings),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Email settings saved successfully");
      } else {
        throw new Error(data.error || "Failed to save email settings");
      }
    } catch (error: any) {
      console.error("Error saving email settings:", error);
      toast.error(error.message || "Failed to save email settings");
    } finally {
      setIsSavingEmail(false);
    }
  };

  const handleSaveUserSettings = async () => {
    setIsSavingUserSettings(true);
    try {
      const response = await fetch("/api/settings/user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferredOutboundNumber: selectedPreferredNumber || null,
          rememberOutboundNumber: rememberDialerChoice,
          autoCallSingleNumber,
          preferredCallMode: preferredCallMode || null,
        }),
      });

      const data = await response.json();

      if (response.ok && data.settings) {
        const normalized: UserSettings = {
          preferredOutboundNumber: data.settings.preferredOutboundNumber || "",
          rememberOutboundNumber: data.settings.rememberOutboundNumber ?? false,
          autoCallSingleNumber: data.settings.autoCallSingleNumber ?? true,
          preferredCallMode: data.settings.preferredCallMode || "webrtc",
        };
        setSelectedPreferredNumber(normalized.preferredOutboundNumber);
        setRememberDialerChoice(normalized.rememberOutboundNumber);
        setAutoCallSingleNumber(normalized.autoCallSingleNumber);
        setPreferredCallMode(normalized.preferredCallMode || "webrtc");
        toast.success("Dialer preferences saved");
      } else {
        throw new Error(data.error || "Failed to save dialer preferences");
      }
    } catch (error: any) {
      console.error("Error saving user settings:", error);
      toast.error(error.message || "Failed to save dialer preferences");
    } finally {
      setIsSavingUserSettings(false);
    }
  };

  const handleSave = async () => {
    if (!isAdmin) {
      toast.error("Only admins can update organization settings");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/settings/organization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Settings saved successfully");
      } else {
        throw new Error(data.error || "Failed to save settings");
      }
    } catch (error: any) {
      console.error("Error saving settings:", error);
      toast.error(error.message || "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <>
      <Toaster position="top-right" />
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            <p className="text-sm text-gray-600 mt-1">
              Manage organization and user preferences
            </p>
          </div>
          {isAdmin && (
            <Button
              onClick={handleSave}
              disabled={isSaving}
              loading={isSaving}
              leftIcon={<Save className="w-4 h-4" />}
            >
              Save Changes
            </Button>
          )}
        </div>

        {/* Organization Settings */}
        {isAdmin && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Organization Settings
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                These settings apply to all team members
              </p>
            </div>
            <div className="p-6 space-y-6">
              {/* Email Scraping Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-900 flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Enable Email Scraping
                  </label>
                  <p className="text-sm text-gray-600 mt-1">
                    Allow team members to scrape email addresses from business websites
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enable_email_scraping}
                    onChange={(e) =>
                      setSettings({ ...settings, enable_email_scraping: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* Email Outreach Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-900 flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Enable Email Outreach
                  </label>
                  <p className="text-sm text-gray-600 mt-1">
                    Allow team members to send emails to leads from within the app
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enable_email_outreach}
                    onChange={(e) =>
                      setSettings({ ...settings, enable_email_outreach: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* Lead Assignment Mode */}
              <div>
                <label className="text-sm font-medium text-gray-900 flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4" />
                  Default Lead Assignment Mode
                </label>
                <select
                  value={settings.default_lead_assignment_mode}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      default_lead_assignment_mode: e.target.value as "manual" | "round_robin",
                    })
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="manual">Manual (Admin assigns leads)</option>
                  <option value="round_robin">Round Robin (Auto-assign evenly)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  How new leads are assigned when imported
                </p>
              </div>

              {/* Max Leads Per Search */}
              <div>
                <label className="text-sm font-medium text-gray-900 mb-2 block">
                  Maximum Leads Per Search
                </label>
                <Input
                  type="number"
                  value={settings.max_leads_per_search}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      max_leads_per_search: parseInt(e.target.value) || 200,
                    })
                  }
                  min={10}
                  max={200}
                  className="w-32"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Safety limit to prevent excessive API usage (10-200)
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Email Settings (Admin only) */}
        {isAdmin && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Mail className="w-5 h-5" />
                  Email Configuration
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Configure shared email settings for your organization
                </p>
              </div>
              <Button
                onClick={handleSaveEmailSettings}
                disabled={isSavingEmail}
                loading={isSavingEmail}
                variant="secondary"
                leftIcon={<Save className="w-4 h-4" />}
              >
                Save Email Settings
              </Button>
            </div>
            <div className="p-6 space-y-6">
              {/* Default From Name */}
              <div>
                <label className="text-sm font-medium text-gray-900 mb-2 block">
                  Default &quot;From&quot; Name
                </label>
                <Input
                  type="text"
                  value={emailSettings.defaultFromName}
                  onChange={(e) =>
                    setEmailSettings({ ...emailSettings, defaultFromName: e.target.value })
                  }
                  placeholder="e.g., On-Kaul Auto Salvage Sales"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This name appears as the sender in recipient&apos;s inbox
                </p>
              </div>

              {/* Default From Email */}
              <div>
                <label className="text-sm font-medium text-gray-900 mb-2 block">
                  Default &quot;From&quot; Email Address
                </label>
                <Input
                  type="email"
                  value={emailSettings.defaultFromEmail}
                  onChange={(e) =>
                    setEmailSettings({ ...emailSettings, defaultFromEmail: e.target.value })
                  }
                  placeholder="e.g., sales@yourdomain.com"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Must be verified in your Brevo account
                </p>
              </div>

              {/* Default Reply-To */}
              <div>
                <label className="text-sm font-medium text-gray-900 mb-2 block">
                  Default Reply-To Email
                </label>
                <Input
                  type="email"
                  value={emailSettings.defaultReplyTo}
                  onChange={(e) =>
                    setEmailSettings({ ...emailSettings, defaultReplyTo: e.target.value })
                  }
                  placeholder="e.g., support@yourdomain.com"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Where replies will be sent (can be different from &quot;From&quot; address)
                </p>
              </div>

              {/* Inbound Subdomain */}
              <div>
                <label className="text-sm font-medium text-gray-900 mb-2 block">
                  Inbound Email Subdomain
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={emailSettings.inboundSubdomain}
                    onChange={(e) =>
                      setEmailSettings({ ...emailSettings, inboundSubdomain: e.target.value })
                    }
                    placeholder="reply"
                    className="w-32"
                  />
                  <span className="text-gray-500">.yourdomain.com</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Configure MX records to point this subdomain to Brevo for inbound emails
                </p>
              </div>

              {/* Email Signature */}
              <div>
                <label className="text-sm font-medium text-gray-900 mb-2 block">
                  Default Email Signature
                </label>
                <textarea
                  value={emailSettings.emailSignature}
                  onChange={(e) =>
                    setEmailSettings({ ...emailSettings, emailSignature: e.target.value })
                  }
                  placeholder="Best regards,
{{sender_name}}
Your Company Name
Phone: (555) 123-4567"
                  rows={5}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use {"{{sender_name}}"} to insert the salesperson&apos;s name automatically
                </p>
              </div>
            </div>
          </div>
        )}

        {/* SDR Tracking Link */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              SDR Tracking Link
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Your personalized trial signup link for Auto Salvage Automation
            </p>
          </div>
          <div className="p-6 space-y-4">
            {/* SDR Code Input */}
            <div>
              <label className="text-sm font-medium text-gray-900 mb-2 block">
                Your SDR Code
              </label>
              {isEditingSdrCode ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={editingSdrCode}
                    onChange={(e) => setEditingSdrCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="e.g., john-doe"
                    className="flex-1"
                    maxLength={30}
                  />
                  <Button
                    onClick={handleSaveSdrCode}
                    disabled={isSavingSdrCode || !editingSdrCode}
                    loading={isSavingSdrCode}
                    size="sm"
                  >
                    Save
                  </Button>
                  <Button
                    onClick={() => {
                      setEditingSdrCode(sdrCode);
                      setIsEditingSdrCode(false);
                    }}
                    variant="secondary"
                    size="sm"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 text-sm">
                    {sdrCode || <span className="text-gray-400 italic">Not set</span>}
                  </div>
                  <Button
                    onClick={() => setIsEditingSdrCode(true)}
                    variant="secondary"
                    size="sm"
                  >
                    {sdrCode ? "Edit" : "Set Code"}
                  </Button>
                </div>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Use lowercase letters, numbers, and hyphens (3-30 characters)
              </p>
            </div>

            {/* Tracking Link Display */}
            {sdrCode && (
              <div>
                <label className="text-sm font-medium text-gray-900 mb-2 block">
                  Your Tracking Link
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200 text-sm font-mono text-blue-700 truncate">
                    {getTrackingLink()}
                  </div>
                  <Button
                    onClick={copyTrackingLink}
                    variant="secondary"
                    size="sm"
                    leftIcon={copiedLink ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  >
                    {copiedLink ? "Copied!" : "Copy"}
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Share this link with leads. Free trial signups will be automatically assigned to you.
                </p>
              </div>
            )}

            {!sdrCode && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  <strong>Set your SDR code</strong> to get a personalized tracking link. 
                  When leads start a free trial using your link, they&apos;ll be automatically assigned to you in the CRM.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* User Settings (for all users) */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Settings className="w-5 h-5" />
              My Preferences
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Your personal settings and preferences
            </p>
          </div>
          <div className="p-6 space-y-5">
            {isLoadingUserSettings ? (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <LoadingSpinner size="sm" />
                Loading your preferences...
              </div>
            ) : (
              <>
                <div>
                  <label className="text-sm font-medium text-gray-900 mb-2 block">
                    Caller ID preference
                  </label>
                  <select
                    value={selectedPreferredNumber}
                    onChange={(e) => setSelectedPreferredNumber(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={availableNumbers.length === 0}
                  >
                    <option value="">No preference (ask me)</option>
                    {availableNumbers.map((number) => (
                      <option key={number.value} value={number.value}>
                        {number.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    We auto-select this when you skip the phone-choice step.
                  </p>
                  {availableNumbers.length === 0 && (
                    <p className="text-xs text-red-600 mt-1">
                      You don&apos;t have a caller ID yet. Ask an admin to assign one.
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-900 mb-2 block">
                    Default call mode
                  </label>
                  <select
                    value={preferredCallMode}
                    onChange={(e) => setPreferredCallMode(e.target.value as "webrtc" | "live" | "voicemail" | "")}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="webrtc">Browser Call (WebRTC)</option>
                    <option value="live">Live Call (Phone)</option>
                    <option value="voicemail">Voicemail Drop</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Used when we auto-start calls to skip the call-type screen.
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      Skip phone choice when dialing
                    </p>
                    <p className="text-xs text-gray-500">
                      Remember my caller ID so I don&apos;t have to pick it every call.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={rememberDialerChoice}
                    onChange={(e) => setRememberDialerChoice(e.target.checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      Auto-call when only one caller ID exists
                    </p>
                    <p className="text-xs text-gray-500">
                      If there&apos;s only one option, skip the picker entirely.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={autoCallSingleNumber}
                    onChange={(e) => setAutoCallSingleNumber(e.target.checked)}
                  />
                </div>

                <div className="text-xs text-gray-500">
                  Assigned caller ID: {assignedCallerId || "None"}
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={handleSaveUserSettings}
                    disabled={isSavingUserSettings}
                    loading={isSavingUserSettings}
                  >
                    Save Preferences
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
