"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Play, Pause, Square, Plus, TrendingUp, DollarSign, Clock } from "lucide-react";
import toast from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import Button from "@/components/Button";

interface Experiment {
  id: string;
  name: string;
  hypothesis: string | null;
  status: string;
  capital_cap_usd: number | null;
  time_cap_days: number | null;
  tranche_size_usd: number | null;
  primary_success_event: string | null;
  secondary_events: string[];
  bonus_rules: any[];
  started_at: string | null;
  ended_at: string | null;
  campaigns?: { name: string } | null;
}

interface PerformanceEvent {
  id: string;
  event_type: string;
  event_timestamp: string;
  lead_id: string | null;
}

interface CostRollup {
  source: string;
  cost_usd: number;
}

interface Evaluation {
  id: string;
  verdict: string;
  reason: string | null;
  created_at: string;
}

export default function ExperimentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const experimentId = params.id as string;
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [events, setEvents] = useState<PerformanceEvent[]>([]);
  const [costs, setCosts] = useState<CostRollup[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (experimentId) {
      loadExperiment();
      loadPerformance();
      loadCosts();
      loadEvaluations();
    }
  }, [experimentId]);

  async function loadExperiment() {
    try {
      const res = await fetch(`/api/governance/experiments/${experimentId}`);
      if (!res.ok) throw new Error("Failed to load experiment");
      const data = await res.json();
      setExperiment(data);
    } catch (error: any) {
      console.error("Error loading experiment:", error);
      toast.error("Failed to load experiment");
    } finally {
      setLoading(false);
    }
  }

  async function loadPerformance() {
    try {
      const res = await fetch(`/api/governance/performance-events?experiment_id=${experimentId}&limit=100`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch (error) {
      console.error("Error loading performance events:", error);
    }
  }

  async function loadCosts() {
    try {
      const res = await fetch(`/api/governance/cost-rollups?experiment_id=${experimentId}&aggregate=true`);
      if (res.ok) {
        const data = await res.json();
        setCosts(data);
      }
    } catch (error) {
      console.error("Error loading costs:", error);
    }
  }

  async function loadEvaluations() {
    try {
      const res = await fetch(`/api/governance/evaluations?experiment_id=${experimentId}`);
      if (res.ok) {
        const data = await res.json();
        setEvaluations(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("Error loading evaluations:", error);
    }
  }

  async function handleStart() {
    try {
      const res = await fetch(`/api/governance/experiments/${experimentId}/start`, {
        method: "POST",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to start experiment");
      }
      toast.success("Experiment started");
      loadExperiment();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function handleEnd(status: "completed" | "terminated") {
    if (!confirm(`Are you sure you want to ${status} this experiment?`)) return;
    
    try {
      const res = await fetch(`/api/governance/experiments/${experimentId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to end experiment");
      }
      toast.success(`Experiment ${status}`);
      loadExperiment();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!experiment) {
    return <div className="container mx-auto px-4 py-8">Experiment not found</div>;
  }

  const statusColors: Record<string, string> = {
    planned: "bg-gray-100 text-gray-800",
    running: "bg-green-100 text-green-800",
    paused: "bg-yellow-100 text-yellow-800",
    completed: "bg-blue-100 text-blue-800",
    terminated: "bg-red-100 text-red-800",
  };

  // Count events by type
  const eventCounts = {
    qpc: events.filter(e => e.event_type === "qpc").length,
    install_scheduled: events.filter(e => e.event_type === "install_scheduled").length,
    install_attended: events.filter(e => e.event_type === "install_attended").length,
    calculator_installed: events.filter(e => e.event_type === "calculator_installed").length,
    paid_conversion: events.filter(e => e.event_type === "paid_conversion").length,
  };

  const totalCost = costs.reduce((sum, c) => sum + parseFloat(c.cost_usd.toString()), 0);
  const costBySource = {
    labor: costs.filter(c => c.source === "labor").reduce((sum, c) => sum + parseFloat(c.cost_usd.toString()), 0),
    bonus: costs.filter(c => c.source === "bonus").reduce((sum, c) => sum + parseFloat(c.cost_usd.toString()), 0),
    twilio: costs.filter(c => c.source === "twilio").reduce((sum, c) => sum + parseFloat(c.cost_usd.toString()), 0),
    gcp: costs.filter(c => c.source === "gcp").reduce((sum, c) => sum + parseFloat(c.cost_usd.toString()), 0),
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
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">{experiment.name}</h1>
            {experiment.hypothesis && (
              <p className="text-gray-600 mt-2">{experiment.hypothesis}</p>
            )}
          </div>
          <span className={`px-3 py-1 rounded text-sm ${statusColors[experiment.status] || statusColors.planned}`}>
            {experiment.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Status Controls */}
          {experiment.status !== "completed" && experiment.status !== "terminated" && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Controls</h2>
              <div className="flex gap-2">
                {experiment.status === "planned" && (
                  <Button onClick={handleStart}>
                    <Play className="w-4 h-4 mr-2" />
                    Start Experiment
                  </Button>
                )}
                {experiment.status === "running" && (
                  <>
                    <Button onClick={() => handleEnd("completed")} variant="outline">
                      <Square className="w-4 h-4 mr-2" />
                      Mark Completed
                    </Button>
                    <Button onClick={() => handleEnd("terminated")} variant="outline">
                      <Square className="w-4 h-4 mr-2" />
                      Terminate
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Performance Summary */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Performance Summary</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-gray-500">QPCs</dt>
                <dd className="text-2xl font-bold">{eventCounts.qpc}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Installs Scheduled</dt>
                <dd className="text-2xl font-bold">{eventCounts.install_scheduled}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Installs Attended</dt>
                <dd className="text-2xl font-bold">{eventCounts.install_attended}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Installs Completed</dt>
                <dd className="text-2xl font-bold">{eventCounts.calculator_installed}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Paid Conversions</dt>
                <dd className="text-2xl font-bold">{eventCounts.paid_conversion}</dd>
              </div>
            </div>
          </div>

          {/* Cost Summary */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Cost Summary</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Labor</span>
                <span className="font-semibold">${costBySource.labor.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Bonuses</span>
                <span className="font-semibold">${costBySource.bonus.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Twilio</span>
                <span className="font-semibold">${costBySource.twilio.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>GCP</span>
                <span className="font-semibold">${costBySource.gcp.toFixed(2)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-bold">
                <span>Total</span>
                <span>${totalCost.toFixed(2)}</span>
              </div>
              {experiment.capital_cap_usd && (
                <div className="text-sm text-gray-500">
                  Cap: ${experiment.capital_cap_usd.toLocaleString()} ({((totalCost / experiment.capital_cap_usd) * 100).toFixed(1)}%)
                </div>
              )}
            </div>
          </div>

          {/* Evaluations */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Evaluations</h2>
              <Button
                onClick={() => router.push(`/dashboard/admin/governance/evaluations/new?experiment_id=${experimentId}`)}
                variant="outline"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Evaluation
              </Button>
            </div>
            {evaluations.length === 0 ? (
              <p className="text-gray-500">No evaluations yet</p>
            ) : (
              <div className="space-y-2">
                {evaluations.map((evaluation) => (
                  <div key={evaluation.id} className="border rounded p-3">
                    <div className="flex justify-between">
                      <span className="font-semibold">{evaluation.verdict}</span>
                      <span className="text-sm text-gray-500">
                        {new Date(evaluation.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {evaluation.reason && (
                      <p className="text-sm text-gray-600 mt-1">Reason: {evaluation.reason}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Rules Card Sidebar */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Experiment Rules</h2>
            <div className="space-y-4">
              {experiment.capital_cap_usd && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="w-4 h-4 text-gray-500" />
                    <dt className="text-sm font-medium">Capital Cap</dt>
                  </div>
                  <dd className="text-lg">${experiment.capital_cap_usd.toLocaleString()}</dd>
                </div>
              )}
              {experiment.time_cap_days && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-gray-500" />
                    <dt className="text-sm font-medium">Time Cap</dt>
                  </div>
                  <dd className="text-lg">{experiment.time_cap_days} days</dd>
                </div>
              )}
              {experiment.tranche_size_usd && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-gray-500" />
                    <dt className="text-sm font-medium">Tranche Size</dt>
                  </div>
                  <dd className="text-lg">${experiment.tranche_size_usd.toLocaleString()}</dd>
                </div>
              )}
              {experiment.primary_success_event && (
                <div>
                  <dt className="text-sm font-medium mb-1">Primary Success Event</dt>
                  <dd className="text-sm text-gray-600">{experiment.primary_success_event}</dd>
                </div>
              )}
              {experiment.bonus_rules && experiment.bonus_rules.length > 0 && (
                <div>
                  <dt className="text-sm font-medium mb-1">Bonus Rules</dt>
                  <dd className="text-sm text-gray-600">
                    {experiment.bonus_rules.map((rule: any, i: number) => (
                      <div key={i} className="mt-1">
                        {rule.event_type}: ${rule.bonus_amount_usd}
                      </div>
                    ))}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-sm font-medium mb-1">QPC Definition</dt>
                <dd className="text-sm text-gray-600">
                  Duration ≥ 150s AND outcome ∈ {"{Schedule, Info, Callback}"}
                </dd>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

