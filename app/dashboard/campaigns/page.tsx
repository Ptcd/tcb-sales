"use client";

import { useState, useEffect } from "react";
import { Tag, Mail, MessageSquare, Phone, ChevronDown, ChevronUp } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "paused" | "archived";
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
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
  isActive: boolean;
}

interface CampaignData extends Campaign {
  emailTemplates: EmailTemplate[];
  smsTemplates: SMSTemplate[];
  callScripts: CallScript[];
}

export default function MyCampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [expandedScript, setExpandedScript] = useState<string | null>(null);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    setIsLoading(true);
    try {
      // Fetch campaigns the user is a member of
      const campaignsRes = await fetch("/api/campaigns");
      if (!campaignsRes.ok) throw new Error("Failed to fetch campaigns");
      const campaignsData = await campaignsRes.json();

      // Fetch templates and scripts for each campaign
      const campaignsWithData: CampaignData[] = await Promise.all(
        (campaignsData.campaigns || []).map(async (campaign: Campaign) => {
          // Fetch email templates
          const emailRes = await fetch("/api/email/templates");
          const emailData = emailRes.ok ? await emailRes.json() : { templates: [] };
          const emailTemplates = (emailData.templates || []).filter(
            (t: any) => t.campaignId === campaign.id
          );

          // Fetch SMS templates
          const smsRes = await fetch("/api/sms/templates");
          const smsData = smsRes.ok ? await smsRes.json() : { templates: [] };
          const smsTemplates = (smsData.templates || []).filter(
            (t: any) => t.campaignId === campaign.id
          );

          // Fetch call scripts
          const scriptsRes = await fetch(`/api/call-scripts?campaignId=${campaign.id}`);
          const scriptsData = scriptsRes.ok ? await scriptsRes.json() : { scripts: [] };

          return {
            ...campaign,
            emailTemplates,
            smsTemplates: smsTemplates.filter((t: SMSTemplate) => t.isActive),
            callScripts: (scriptsData.scripts || []).filter((s: CallScript) => s.isActive),
          };
        })
      );

      setCampaigns(campaignsWithData.filter((c) => c.status === "active"));
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      toast.error("Failed to load campaigns");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleCampaign = (campaignId: string) => {
    setExpandedCampaign(expandedCampaign === campaignId ? null : campaignId);
    setExpandedScript(null);
  };

  const toggleScript = (scriptId: string) => {
    setExpandedScript(expandedScript === scriptId ? null : scriptId);
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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Campaigns</h1>
          <p className="text-sm text-gray-600 mt-1">
            View templates and scripts for your assigned campaigns
          </p>
        </div>

        {campaigns.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center">
            <Tag className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Campaigns Assigned</h3>
            <p className="text-gray-600">
              You haven&apos;t been assigned to any active campaigns yet. Contact your admin.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {campaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden"
              >
                {/* Campaign Header */}
                <button
                  onClick={() => toggleCampaign(campaign.id)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Tag className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="text-left">
                      <h2 className="text-lg font-semibold text-gray-900">{campaign.name}</h2>
                      {campaign.description && (
                        <p className="text-sm text-gray-600">{campaign.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Mail className="w-4 h-4" />
                        {campaign.emailTemplates.length}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-4 h-4" />
                        {campaign.smsTemplates.length}
                      </span>
                      <span className="flex items-center gap-1">
                        <Phone className="w-4 h-4" />
                        {campaign.callScripts.length}
                      </span>
                    </div>
                    {expandedCampaign === campaign.id ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Expanded Content */}
                {expandedCampaign === campaign.id && (
                  <div className="border-t border-gray-200 p-6 space-y-6">
                    {/* Call Scripts Section */}
                    {campaign.callScripts.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                          <Phone className="w-4 h-4 text-purple-600" />
                          Call Scripts
                        </h3>
                        <div className="space-y-2">
                          {campaign.callScripts.map((script) => (
                            <div
                              key={script.id}
                              className="border border-purple-200 rounded-lg overflow-hidden"
                            >
                              <button
                                onClick={() => toggleScript(script.id)}
                                className="w-full px-4 py-3 flex items-center justify-between bg-purple-50 hover:bg-purple-100 transition-colors"
                              >
                                <span className="font-medium text-gray-900">{script.name}</span>
                                {expandedScript === script.id ? (
                                  <ChevronUp className="w-4 h-4 text-gray-400" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-gray-400" />
                                )}
                              </button>
                              {expandedScript === script.id && (
                                <div className="px-4 py-3 bg-white">
                                  <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                                    {script.content}
                                  </pre>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Email Templates Section */}
                    {campaign.emailTemplates.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                          <Mail className="w-4 h-4 text-blue-600" />
                          Email Templates
                        </h3>
                        <div className="grid gap-3">
                          {campaign.emailTemplates.map((template) => (
                            <div
                              key={template.id}
                              className="p-3 bg-blue-50 rounded-lg border border-blue-200"
                            >
                              <h4 className="font-medium text-gray-900">{template.name}</h4>
                              <p className="text-sm text-gray-600 mt-1">
                                Subject: {template.subject}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* SMS Templates Section */}
                    {campaign.smsTemplates.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-green-600" />
                          SMS Templates
                        </h3>
                        <div className="grid gap-3">
                          {campaign.smsTemplates.map((template) => (
                            <div
                              key={template.id}
                              className="p-3 bg-green-50 rounded-lg border border-green-200"
                            >
                              <h4 className="font-medium text-gray-900">{template.name}</h4>
                              <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                                {template.message}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Empty state */}
                    {campaign.emailTemplates.length === 0 &&
                      campaign.smsTemplates.length === 0 &&
                      campaign.callScripts.length === 0 && (
                        <p className="text-gray-500 text-center py-4">
                          No templates or scripts have been added to this campaign yet.
                        </p>
                      )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}



