"use client";

import { useState, useEffect, useMemo } from "react";
import { X, Plus, Edit, Trash2, MessageSquare, Save, XCircle, Tag } from "lucide-react";
import { SMSTemplate } from "@/lib/types";
import toast from "react-hot-toast";

interface Campaign {
  id: string;
  name: string;
}

interface TemplateManagementProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TemplateManagement({
  isOpen,
  onClose,
}: TemplateManagementProps) {
  const [templates, setTemplates] = useState<SMSTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Partial<SMSTemplate> & { campaignId?: string }>({
    name: "",
    message: "",
    isActive: true,
    campaignId: "",
  });

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
      fetchCampaigns();
    }
  }, [isOpen]);

  // Group templates by campaign
  const templatesByCampaign = useMemo(() => {
    const grouped = new Map<string, SMSTemplate[]>();
    
    // Group templates
    for (const template of templates) {
      const campaignName = template.campaignName || "No Campaign";
      if (!grouped.has(campaignName)) {
        grouped.set(campaignName, []);
      }
      grouped.get(campaignName)!.push(template);
    }
    
    // Sort by campaign name
    return Array.from(grouped.entries()).sort((a, b) => {
      if (a[0] === "No Campaign") return 1;
      if (b[0] === "No Campaign") return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [templates]);

  const fetchCampaigns = async () => {
    try {
      const response = await fetch("/api/campaigns");
      if (response.ok) {
        const data = await response.json();
        setCampaigns(data.campaigns || []);
        // Set default campaign if we have one and we're creating
        if (data.campaigns?.length > 0 && !editingTemplate.campaignId) {
          setEditingTemplate(prev => ({ ...prev, campaignId: data.campaigns[0].id }));
        }
      }
    } catch (error) {
      console.error("Error fetching campaigns:", error);
    }
  };

  const fetchTemplates = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/sms/templates");
      if (!response.ok) throw new Error("Failed to fetch templates");

      const data = await response.json();
      setTemplates(data.templates || []);
    } catch (error) {
      console.error("Error fetching templates:", error);
      toast.error("Failed to load SMS templates");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setIsCreating(true);
    setEditingTemplate({ 
      name: "", 
      message: "", 
      isActive: true,
      campaignId: campaigns.length > 0 ? campaigns[0].id : "",
    });
    setIsEditing(null);
  };

  const handleEdit = (template: SMSTemplate) => {
    setIsEditing(template.id);
    setEditingTemplate({ ...template, campaignId: template.campaignId || "" });
    setIsCreating(false);
  };

  const handleCancel = () => {
    setIsCreating(false);
    setIsEditing(null);
    setEditingTemplate({ 
      name: "", 
      message: "", 
      isActive: true,
      campaignId: campaigns.length > 0 ? campaigns[0].id : "",
    });
  };

  const handleSave = async () => {
    if (!editingTemplate.name?.trim() || !editingTemplate.message?.trim()) {
      toast.error("Please provide both name and message");
      return;
    }

    if (editingTemplate.message && editingTemplate.message.length > 1600) {
      toast.error("Message too long (max 1600 characters)");
      return;
    }

    if (isCreating && !editingTemplate.campaignId) {
      toast.error("Please select a campaign");
      return;
    }

    try {
      if (isCreating) {
        // Create new template
        const response = await fetch("/api/sms/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editingTemplate.name.trim(),
            message: editingTemplate.message.trim(),
            isActive: editingTemplate.isActive,
            campaignId: editingTemplate.campaignId,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to create template");
        }

        toast.success("Template created successfully");
      } else if (isEditing) {
        // Update existing template
        const response = await fetch(`/api/sms/templates/${isEditing}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editingTemplate.name?.trim(),
            message: editingTemplate.message?.trim(),
            isActive: editingTemplate.isActive,
          }),
        });

        if (!response.ok) throw new Error("Failed to update template");

        toast.success("Template updated successfully");
      }

      // Refresh templates
      await fetchTemplates();
      handleCancel();
    } catch (error) {
      console.error("Error saving template:", error);
      toast.error(`Failed to ${isCreating ? "create" : "update"} template`);
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm("Are you sure you want to delete this template?")) {
      return;
    }

    try {
      const response = await fetch(`/api/sms/templates/${templateId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete template");

      toast.success("Template deleted successfully");
      await fetchTemplates();
    } catch (error) {
      console.error("Error deleting template:", error);
      toast.error("Failed to delete template");
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Side Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-purple-700">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-6 w-6 text-white" />
            <h2 className="text-xl font-bold text-white">SMS Templates</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-purple-100 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Create New Button */}
          {!isCreating && !isEditing && (
            <button
              onClick={handleCreate}
              className="mb-6 flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Create New Template</span>
            </button>
          )}

          {/* Create/Edit Form */}
          {(isCreating || isEditing) && (
            <div className="mb-6 p-4 border-2 border-purple-200 rounded-lg bg-purple-50">
              {/* Campaign Selector - only for new templates */}
              {isCreating && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Tag className="inline h-4 w-4 mr-1" />
                    Campaign
                  </label>
                  <select
                    value={editingTemplate.campaignId || ""}
                    onChange={(e) =>
                      setEditingTemplate({ ...editingTemplate, campaignId: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="">Select a campaign...</option>
                    {campaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Template Name
                </label>
                <input
                  type="text"
                  value={editingTemplate.name || ""}
                  onChange={(e) =>
                    setEditingTemplate({ ...editingTemplate, name: e.target.value })
                  }
                  placeholder="e.g., Junk Car Initial Contact"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  maxLength={100}
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Message
                </label>
                <textarea
                  value={editingTemplate.message || ""}
                  onChange={(e) =>
                    setEditingTemplate({
                      ...editingTemplate,
                      message: e.target.value,
                    })
                  }
                  placeholder="Type your SMS template here..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                  rows={6}
                  maxLength={1600}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {(editingTemplate.message?.length || 0)} / 1600 characters
                </p>
              </div>

              <div className="mb-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editingTemplate.isActive}
                    onChange={(e) =>
                      setEditingTemplate({
                        ...editingTemplate,
                        isActive: e.target.checked,
                      })
                    }
                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-sm text-gray-700">Active</span>
                </label>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  <Save className="h-4 w-4" />
                  <span>Save</span>
                </button>
                <button
                  onClick={handleCancel}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <XCircle className="h-4 w-4" />
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          )}

          {/* Loading State */}
          {isLoading ? (
            <p className="text-center text-gray-500 py-8">Loading templates...</p>
          ) : templates.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No templates yet</p>
              <p className="text-sm text-gray-400 mt-2">
                Create your first template to get started
              </p>
            </div>
          ) : (
            <>
              {/* Templates grouped by campaign */}
              {templatesByCampaign.map(([campaignName, campaignTemplates]) => (
                <div key={campaignName} className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Tag className="h-4 w-4 text-purple-600" />
                    <h3 className="text-sm font-semibold text-gray-900">
                      {campaignName}
                    </h3>
                    <span className="text-xs text-gray-500">
                      ({campaignTemplates.length} template{campaignTemplates.length !== 1 ? "s" : ""})
                    </span>
                  </div>
                  <div className="space-y-3 pl-6 border-l-2 border-purple-200">
                    {campaignTemplates.map((template) => (
                      <TemplateCard
                        key={template.id}
                        template={template}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}

interface TemplateCardProps {
  template: SMSTemplate;
  onEdit: (template: SMSTemplate) => void;
  onDelete: (templateId: string) => void;
}

function TemplateCard({ template, onEdit, onDelete }: TemplateCardProps) {
  return (
    <div
      className={`p-4 border rounded-lg transition-all ${
        template.isActive
          ? "border-green-200 bg-green-50"
          : "border-gray-200 bg-gray-50"
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <h4 className="font-semibold text-gray-900">{template.name}</h4>
          {!template.isActive && (
            <span className="text-xs text-gray-500">(Inactive)</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onEdit(template)}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="Edit template"
          >
            <Edit className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(template.id)}
            className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
            title="Delete template"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-700 line-clamp-2">{template.message}</p>
      <p className="text-xs text-gray-400 mt-2">
        {new Date(template.createdAt).toLocaleDateString()}
      </p>
    </div>
  );
}
