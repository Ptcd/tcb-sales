"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import toast from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import Button from "@/components/Button";
import Input from "@/components/Input";

interface Campaign {
  id: string;
  name: string;
}

export default function NewExperimentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const campaignIdParam = searchParams.get("campaign_id");
  
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    campaign_id: campaignIdParam || "",
    name: "",
    hypothesis: "",
    capital_cap_usd: "",
    time_cap_days: "",
    tranche_size_usd: "",
    primary_success_event: "",
    secondary_events: [] as string[],
    bonus_rules: [] as any[],
  });

  useEffect(() => {
    loadCampaigns();
  }, []);

  async function loadCampaigns() {
    try {
      const res = await fetch("/api/campaigns");
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data);
      }
    } catch (error) {
      console.error("Error loading campaigns:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    
    try {
      const res = await fetch("/api/governance/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          capital_cap_usd: formData.capital_cap_usd ? parseFloat(formData.capital_cap_usd) : null,
          time_cap_days: formData.time_cap_days ? parseInt(formData.time_cap_days) : null,
          tranche_size_usd: formData.tranche_size_usd ? parseFloat(formData.tranche_size_usd) : null,
          secondary_events: formData.secondary_events,
          bonus_rules: formData.bonus_rules,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create experiment");
      }

      const data = await res.json();
      toast.success("Experiment created");
      router.push(`/dashboard/admin/governance/experiments/${data.id}`);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="text-blue-600 hover:underline mb-2 flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <h1 className="text-3xl font-bold">Create Experiment</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium mb-1">Campaign *</label>
          <select
            value={formData.campaign_id}
            onChange={(e) => setFormData({ ...formData, campaign_id: e.target.value })}
            className="w-full border rounded px-3 py-2"
            required
          >
            <option value="">Select campaign</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Name *</label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Exp 2 — Install Appointment → Activator Install"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Hypothesis</label>
          <textarea
            value={formData.hypothesis}
            onChange={(e) => setFormData({ ...formData, hypothesis: e.target.value })}
            className="w-full border rounded px-3 py-2"
            rows={4}
            placeholder="Describe the conversion hypothesis..."
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Capital Cap ($)</label>
            <Input
              type="number"
              step="0.01"
              value={formData.capital_cap_usd}
              onChange={(e) => setFormData({ ...formData, capital_cap_usd: e.target.value })}
              placeholder="4000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Time Cap (days)</label>
            <Input
              type="number"
              value={formData.time_cap_days}
              onChange={(e) => setFormData({ ...formData, time_cap_days: e.target.value })}
              placeholder="14"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Tranche Size ($)</label>
            <Input
              type="number"
              step="0.01"
              value={formData.tranche_size_usd}
              onChange={(e) => setFormData({ ...formData, tranche_size_usd: e.target.value })}
              placeholder="1000"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Primary Success Event</label>
          <Input
            value={formData.primary_success_event}
            onChange={(e) => setFormData({ ...formData, primary_success_event: e.target.value })}
            placeholder="e.g., calculator_installed"
          />
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Creating..." : "Create Experiment"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}


