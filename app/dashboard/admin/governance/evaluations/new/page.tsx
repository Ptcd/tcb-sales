"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import toast from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import Button from "@/components/Button";
import Input from "@/components/Input";

interface Experiment {
  id: string;
  name: string;
  capital_cap_usd: number | null;
  time_cap_days: number | null;
  tranche_size_usd: number | null;
}

export default function NewEvaluationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const experimentIdParam = searchParams.get("experiment_id");
  
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    verdict: "continue" as "pass" | "fail" | "continue" | "stop",
    reason: "" as "pitch_channel" | "activation_process" | "economics" | "capital_time" | "inconclusive" | "",
    recommended_next_action: "" as "continue_experiment" | "extend_budget" | "start_new_experiment" | "graduate_campaign" | "kill_campaign" | "",
    admin_notes: "",
    capital_spent_usd: "",
    tranches_consumed: "",
  });

  useEffect(() => {
    if (experimentIdParam) {
      loadExperiment();
    } else {
      setLoading(false);
    }
  }, [experimentIdParam]);

  async function loadExperiment() {
    try {
      const res = await fetch(`/api/governance/experiments/${experimentIdParam}`);
      if (res.ok) {
        const data = await res.json();
        setExperiment(data);
      }
    } catch (error) {
      console.error("Error loading experiment:", error);
      toast.error("Failed to load experiment");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    
    try {
      const res = await fetch("/api/governance/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experiment_id: experimentIdParam,
          ...formData,
          capital_spent_usd: formData.capital_spent_usd ? parseFloat(formData.capital_spent_usd) : null,
          tranches_consumed: formData.tranches_consumed ? parseInt(formData.tranches_consumed) : null,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create evaluation");
      }

      toast.success("Evaluation created");
      router.push(`/dashboard/admin/governance/experiments/${experimentIdParam}`);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!experimentIdParam) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-red-600">Experiment ID required</p>
      </div>
    );
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
        <h1 className="text-3xl font-bold">Create Evaluation</h1>
        {experiment && (
          <p className="text-gray-600 mt-1">Experiment: {experiment.name}</p>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h3 className="font-semibold mb-2">How to Evaluate</h3>
        <ul className="text-sm space-y-1 list-disc list-inside">
          <li>Look at spend vs cap, tranches consumed, installs per tranche</li>
          <li>Check where the funnel breaks (QPC→Schedule, Schedule→Attend, Attend→Install)</li>
          <li>Pick verdict: Continue (trend improving), Pass (validated), Fail (fundamental issue), Stop (stop-loss hit)</li>
          <li>Choose reason: pitch_channel, activation_process, economics, capital_time, or inconclusive</li>
        </ul>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium mb-1">Verdict *</label>
          <select
            value={formData.verdict}
            onChange={(e) => setFormData({ ...formData, verdict: e.target.value as any })}
            className="w-full border rounded px-3 py-2"
            required
          >
            <option value="continue">Continue</option>
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
            <option value="stop">Stop</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Reason</label>
          <select
            value={formData.reason}
            onChange={(e) => setFormData({ ...formData, reason: e.target.value as any })}
            className="w-full border rounded px-3 py-2"
          >
            <option value="">Select reason</option>
            <option value="pitch_channel">Pitch/Channel (people don't want it / wrong ICP / message issue)</option>
            <option value="activation_process">Activation Process (handoff/install process failing)</option>
            <option value="economics">Economics (too expensive per tranche once stable)</option>
            <option value="capital_time">Capital/Time (ran out of budget/time)</option>
            <option value="inconclusive">Inconclusive (data broken or too little signal)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Recommended Next Action</label>
          <select
            value={formData.recommended_next_action}
            onChange={(e) => setFormData({ ...formData, recommended_next_action: e.target.value as any })}
            className="w-full border rounded px-3 py-2"
          >
            <option value="">Select action</option>
            <option value="continue_experiment">Continue Experiment</option>
            <option value="extend_budget">Extend Budget</option>
            <option value="start_new_experiment">Start New Experiment</option>
            <option value="graduate_campaign">Graduate Campaign (evergreen)</option>
            <option value="kill_campaign">Kill Campaign</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Capital Spent ($)</label>
            <Input
              type="number"
              step="0.01"
              value={formData.capital_spent_usd}
              onChange={(e) => setFormData({ ...formData, capital_spent_usd: e.target.value })}
              placeholder={experiment?.capital_cap_usd?.toString() || ""}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Tranches Consumed</label>
            <Input
              type="number"
              value={formData.tranches_consumed}
              onChange={(e) => setFormData({ ...formData, tranches_consumed: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Admin Notes *</label>
          <textarea
            value={formData.admin_notes}
            onChange={(e) => setFormData({ ...formData, admin_notes: e.target.value })}
            className="w-full border rounded px-3 py-2"
            rows={6}
            placeholder="Always log: What changed, What you learned, The one hypothesis for next iteration"
            required
          />
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            <strong>Override Doctrine:</strong> You may override stop-loss/caps only if rationale is logged, 
            override is tied to this evaluation, and you specify the exact condition that ends the override.
          </p>
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Creating..." : "Create Evaluation"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}


