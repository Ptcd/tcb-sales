"use client";

import { useState, useEffect } from "react";
import { FlaskConical, Plus, Play, Pause, CheckCircle, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import Button from "@/components/Button";
import Link from "next/link";

interface Experiment {
  id: string;
  campaign_id: string;
  name: string;
  hypothesis: string | null;
  status: "planned" | "running" | "paused" | "completed" | "terminated";
  start_date: string | null;
  end_date: string | null;
  started_at: string | null;
  ended_at: string | null;
  capital_cap_usd: number | null;
  time_cap_days: number | null;
  created_at: string;
  campaigns?: { name: string };
}

export default function GovernanceExperimentsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchExperiments();
  }, []);

  const fetchExperiments = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/governance/experiments");
      if (!response.ok) throw new Error("Failed to fetch experiments");

      const data = await response.json();
      setExperiments(data || []);
    } catch (error: any) {
      console.error("Error fetching experiments:", error);
      toast.error("Failed to load experiments");
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running":
        return <Play className="w-4 h-4 text-green-600" />;
      case "paused":
        return <Pause className="w-4 h-4 text-yellow-600" />;
      case "completed":
        return <CheckCircle className="w-4 h-4 text-blue-600" />;
      case "terminated":
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return <FlaskConical className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
        return "bg-green-100 text-green-800";
      case "paused":
        return "bg-yellow-100 text-yellow-800";
      case "completed":
        return "bg-blue-100 text-blue-800";
      case "terminated":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Experiments</h2>
          <p className="text-sm text-gray-600 mt-1">
            Track conversion hypotheses with capital discipline
          </p>
        </div>
        <Link href="/dashboard/admin/governance/experiments/new">
          <Button leftIcon={<Plus className="w-4 h-4" />}>
            New Experiment
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <p className="text-sm text-gray-500">Total</p>
          <p className="text-2xl font-bold">{experiments.length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <p className="text-sm text-green-600">Running</p>
          <p className="text-2xl font-bold text-green-600">
            {experiments.filter(e => e.status === "running").length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <p className="text-sm text-blue-600">Completed</p>
          <p className="text-2xl font-bold text-blue-600">
            {experiments.filter(e => e.status === "completed").length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <p className="text-sm text-gray-500">Planned</p>
          <p className="text-2xl font-bold">
            {experiments.filter(e => e.status === "planned").length}
          </p>
        </div>
      </div>

      {/* Experiments List */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        {experiments.length === 0 ? (
          <div className="text-center py-12">
            <FlaskConical className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600">No experiments found</p>
            <Link href="/dashboard/admin/governance/experiments/new">
              <Button variant="outline" className="mt-4">
                Create Your First Experiment
              </Button>
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                  Experiment
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                  Campaign
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase">
                  Capital Cap
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase">
                  Time Cap
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {experiments.map((experiment) => (
                <tr key={experiment.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-100 rounded-lg">
                        {getStatusIcon(experiment.status)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{experiment.name}</p>
                        {experiment.hypothesis && (
                          <p className="text-sm text-gray-500 truncate max-w-xs">
                            {experiment.hypothesis}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {experiment.campaigns?.name || "—"}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(experiment.status)}`}
                    >
                      {getStatusIcon(experiment.status)}
                      {experiment.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-gray-600">
                    {experiment.capital_cap_usd
                      ? `$${experiment.capital_cap_usd.toLocaleString()}`
                      : "—"}
                  </td>
                  <td className="px-6 py-4 text-center text-gray-600">
                    {experiment.time_cap_days
                      ? `${experiment.time_cap_days} days`
                      : "—"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link href={`/dashboard/admin/governance/experiments/${experiment.id}`}>
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


