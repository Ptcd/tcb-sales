"use client";

import { useState, useEffect } from "react";
import { Tag, Plus, Edit, Trash2, Users, FileText } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";
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
  lead_filters?: {
    require_website?: boolean;
    require_phone?: boolean;
    require_email?: boolean;
    min_rating?: number;
    min_reviews?: number;
  } | null;
  member_count?: number;
  lead_count?: number;
  created_at: string;
  updated_at: string;
}

export default function CampaignManagementPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/campaigns");
      if (!response.ok) throw new Error("Failed to fetch campaigns");

      const data = await response.json();
      setCampaigns(data.campaigns || []);
    } catch (error: any) {
      console.error("Error fetching campaigns:", error);
      toast.error("Failed to load campaigns");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCampaign = async (campaign: Campaign) => {
    if (campaign.name === "Default Campaign") {
      toast.error("Cannot delete the default campaign");
      return;
    }

    if (!confirm(`Are you sure you want to delete "${campaign.name}"? This will remove all members and leads from this campaign.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete campaign");
      }

      toast.success("Campaign deleted successfully");
      fetchCampaigns();
    } catch (error: any) {
      console.error("Error deleting campaign:", error);
      toast.error(error.message || "Failed to delete campaign");
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
            <h1 className="text-2xl font-bold text-gray-900">Campaign Management</h1>
            <p className="text-sm text-gray-600 mt-1">
              Create and manage campaigns for organizing leads and team members
            </p>
          </div>
          <Link href="/dashboard/admin/campaigns/new">
            <Button leftIcon={<Plus className="w-4 h-4" />}>
              Create Campaign
            </Button>
          </Link>
        </div>

        {/* Campaigns List */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Tag className="w-5 h-5" />
              Campaigns ({campaigns.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-200">
            {campaigns.length === 0 ? (
              <div className="p-8 text-center">
                <Tag className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Campaigns</h3>
                <p className="text-gray-600 mb-4">
                  Create your first campaign to organize leads and team members
                </p>
                <Link href="/dashboard/admin/campaigns/new">
                  <Button leftIcon={<Plus className="w-4 h-4" />}>
                    Create Campaign
                  </Button>
                </Link>
              </div>
            ) : (
              campaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className="p-6 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {campaign.name}
                        </h3>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            campaign.status === "active"
                              ? "bg-green-100 text-green-800"
                              : campaign.status === "paused"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {campaign.status}
                        </span>
                      </div>
                      {campaign.description && (
                        <p className="text-sm text-gray-600 mb-3">
                          {campaign.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          <span>{campaign.member_count || 0} members</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <FileText className="w-4 h-4" />
                          <span>{campaign.lead_count || 0} leads</span>
                        </div>
                      </div>
                      {campaign.lead_filters && Object.keys(campaign.lead_filters).length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {campaign.lead_filters.require_website && (
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              Requires Website
                            </span>
                          )}
                          {campaign.lead_filters.require_phone && (
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              Requires Phone
                            </span>
                          )}
                          {campaign.lead_filters.require_email && (
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              Requires Email
                            </span>
                          )}
                          {campaign.lead_filters.min_rating !== undefined && (
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              Min Rating: {campaign.lead_filters.min_rating}★
                            </span>
                          )}
                          {campaign.lead_filters.min_reviews !== undefined && (
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              Min Reviews: {campaign.lead_filters.min_reviews}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/admin/campaigns/${campaign.id}/edit`}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit campaign"
                      >
                        <Edit className="w-4 h-4" />
                      </Link>
                      {campaign.name !== "Default Campaign" && (
                        <button
                          onClick={() => handleDeleteCampaign(campaign)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete campaign"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
