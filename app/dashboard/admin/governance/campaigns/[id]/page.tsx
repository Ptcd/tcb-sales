"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { BookOpen, FlaskConical, Plus } from "lucide-react";
import toast from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import Button from "@/components/Button";

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  product_id: string | null;
  owner_user_id: string | null;
  capital_budget_usd: number | null;
  products?: { name: string } | null;
}

interface Experiment {
  id: string;
  name: string;
  status: string;
  hypothesis: string | null;
  created_at: string;
}

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;
  const [activeTab, setActiveTab] = useState<"overview" | "experiments" | "playbook">("overview");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [playbookContent, setPlaybookContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [budgetBurn, setBudgetBurn] = useState<{
    initial_budget: number;
    total_revenue: number;
    total_costs: number;
    remaining: number;
  } | null>(null);

  useEffect(() => {
    if (campaignId) {
      loadCampaign();
      loadExperiments();
      loadBudgetBurn();
      if (activeTab === "playbook") {
        loadPlaybook();
      }
    }
  }, [campaignId, activeTab]);

  async function loadCampaign() {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`);
      if (!res.ok) throw new Error("Failed to load campaign");
      const response = await res.json();
      const data = response.campaign || response; // Handle both response formats
      
      // Load product if product_id exists
      if (data.product_id) {
        const productRes = await fetch(`/api/governance/products`);
        if (productRes.ok) {
          const products = await productRes.json();
          const product = products.find((p: any) => p.id === data.product_id);
          data.products = product || null;
        }
      }
      
      setCampaign(data);
    } catch (error: any) {
      console.error("Error loading campaign:", error);
      toast.error("Failed to load campaign");
    }
  }

  async function loadExperiments() {
    try {
      const res = await fetch(`/api/governance/experiments?campaign_id=${campaignId}`);
      if (!res.ok) throw new Error("Failed to load experiments");
      const data = await res.json();
      setExperiments(data);
    } catch (error: any) {
      console.error("Error loading experiments:", error);
      toast.error("Failed to load experiments");
    } finally {
      setLoading(false);
    }
  }

  async function loadPlaybook() {
    try {
      // Load playbook content from API or static file
      // For now, show a message that it's available in the project root
      setPlaybookContent(`# Experiment Playbook

The Experiment Playbook is available in the project root as EXPERIMENT_PLAYBOOK.md.

This playbook contains:
- Roles & responsibilities
- Weekly rhythm and cadence
- How to start an experiment
- Golden metrics
- How to run an evaluation
- Kill vs iterate vs continue decision tree
- Override doctrine
- Bonus rules guidance
- Data integrity rules

For the full playbook content, refer to EXPERIMENT_PLAYBOOK.md in the project root.`);
    } catch (error) {
      console.error("Error loading playbook:", error);
    }
  }

  async function loadBudgetBurn() {
    try {
      const res = await fetch(`/api/governance/budget-burn?campaign_id=${campaignId}`);
      if (res.ok) {
        const data = await res.json();
        setBudgetBurn(data);
      } else {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        console.error("Error loading budget burn:", errorData);
        // If table doesn't exist, budgetBurn will remain null and card won't show
      }
    } catch (error) {
      console.error("Error loading budget burn:", error);
    }
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!campaign) {
    return <div className="container mx-auto px-4 py-8">Campaign not found</div>;
  }

  const statusColors: Record<string, string> = {
    planned: "bg-gray-100 text-gray-800",
    running: "bg-green-100 text-green-800",
    paused: "bg-yellow-100 text-yellow-800",
    completed: "bg-blue-100 text-blue-800",
    terminated: "bg-red-100 text-red-800",
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <button
          onClick={() => router.push("/dashboard/admin/governance")}
          className="text-blue-600 hover:underline mb-2"
        >
          ← Back to Governance
        </button>
        <h1 className="text-3xl font-bold">{campaign.name}</h1>
        {campaign.description && (
          <p className="text-gray-600 mt-2">{campaign.description}</p>
        )}
      </div>

      <div className="border-b mb-6">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-4 py-2 border-b-2 ${
              activeTab === "overview"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("experiments")}
            className={`px-4 py-2 border-b-2 ${
              activeTab === "experiments"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500"
            }`}
          >
            <FlaskConical className="w-4 h-4 inline mr-2" />
            Experiments
          </button>
          <button
            onClick={() => setActiveTab("playbook")}
            className={`px-4 py-2 border-b-2 ${
              activeTab === "playbook"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500"
            }`}
          >
            <BookOpen className="w-4 h-4 inline mr-2" />
            Playbook
          </button>
        </nav>
      </div>

      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Campaign Details</h2>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-gray-500">Product</dt>
                <dd className="font-medium">{campaign.products?.name || "N/A"}</dd>
              </div>
              {campaign.capital_budget_usd && (
                <div>
                  <dt className="text-sm text-gray-500">Capital Budget</dt>
                  <dd className="font-medium">${campaign.capital_budget_usd.toLocaleString()}</dd>
                </div>
              )}
            </dl>
          </div>

          {budgetBurn && budgetBurn.initial_budget > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Budget Status</h2>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Initial Budget</p>
                  <p className="text-2xl font-bold">${budgetBurn.initial_budget.toLocaleString()}</p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-gray-500">+ Revenue</p>
                  <p className="text-2xl font-bold text-green-600">+${budgetBurn.total_revenue.toLocaleString()}</p>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <p className="text-sm text-gray-500">- Costs</p>
                  <p className="text-2xl font-bold text-red-600">-${budgetBurn.total_costs.toLocaleString()}</p>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-gray-500">Remaining</p>
                  <p className={`text-2xl font-bold ${budgetBurn.remaining >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    ${budgetBurn.remaining.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "experiments" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Experiments</h2>
            <Button
              onClick={() => router.push(`/dashboard/admin/governance/experiments/new?campaign_id=${campaignId}`)}
            >
              <Plus className="w-4 h-4 mr-2" />
              New Experiment
            </Button>
          </div>

          {experiments.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-6 text-center">
              <p className="text-gray-500">No experiments yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {experiments.map((exp) => (
                <div
                  key={exp.id}
                  className="bg-white rounded-lg shadow p-6 cursor-pointer hover:bg-gray-50"
                  onClick={() => router.push(`/dashboard/admin/governance/experiments/${exp.id}`)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-lg">{exp.name}</h3>
                      {exp.hypothesis && (
                        <p className="text-sm text-gray-600 mt-1">{exp.hypothesis}</p>
                      )}
                    </div>
                    <span className={`px-3 py-1 rounded text-sm ${statusColors[exp.status] || statusColors.planned}`}>
                      {exp.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "playbook" && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Experiment Playbook</h2>
          {playbookContent ? (
            <div className="prose max-w-none">
              <pre className="whitespace-pre-wrap font-sans text-sm">{playbookContent}</pre>
            </div>
          ) : (
            <p className="text-gray-500">Loading playbook...</p>
          )}
        </div>
      )}
    </div>
  );
}

