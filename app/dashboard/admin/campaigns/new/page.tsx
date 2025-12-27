"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Tag } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import Input from "@/components/Input";
import Button from "@/components/Button";
import Link from "next/link";

export default function NewCampaignPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    status: "active" as "active" | "paused" | "archived",
    email_address: "",
    email_from_name: "",
    email_signature: "",
    lead_filters: {
      require_website: false,
      require_phone: false,
      require_email: false,
      min_rating: "" as string | number,
      min_reviews: "" as string | number,
    },
  });
  const [senders, setSenders] = useState<{ id: string; name: string; email: string }[]>([]);
  const [sendersLoading, setSendersLoading] = useState(true);
  const [sendersError, setSendersError] = useState<string | null>(null);

  useEffect(() => {
    fetchSenders();
  }, []);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error("Campaign name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          status: formData.status,
          email_address: formData.email_address.trim() || null,
          email_from_name: formData.email_from_name.trim() || null,
          email_signature: formData.email_signature || null,
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
        throw new Error(data.error || "Failed to create campaign");
      }

      toast.success("Campaign created successfully");
      router.push("/dashboard/admin/campaigns");
    } catch (error: any) {
      console.error("Error creating campaign:", error);
      toast.error(error.message || "Failed to create campaign");
    } finally {
      setIsSubmitting(false);
    }
  };

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
              <h1 className="text-2xl font-bold text-gray-900">Create New Campaign</h1>
              <p className="text-sm text-gray-600">
                Set up a new campaign to organize leads and team members
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
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-4 pt-4">
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
                {isSubmitting ? "Creating..." : "Create Campaign"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}



