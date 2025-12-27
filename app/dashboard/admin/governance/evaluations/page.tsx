"use client";

import { useState, useEffect } from "react";
import { FileText, Plus, CheckCircle, XCircle, AlertCircle, ArrowRight } from "lucide-react";
import toast from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import Button from "@/components/Button";
import Link from "next/link";

interface Evaluation {
  id: string;
  experiment_id: string;
  verdict: "pass" | "fail" | "continue" | "stop";
  reason: string | null;
  recommended_next_action: string | null;
  admin_notes: string | null;
  capital_spent_usd: number | null;
  tranches_consumed: number | null;
  created_at: string;
  experiments?: { name: string; campaigns?: { name: string } };
}

export default function GovernanceEvaluationsPage() {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchEvaluations();
  }, []);

  const fetchEvaluations = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/governance/evaluations");
      if (!response.ok) throw new Error("Failed to fetch evaluations");

      const data = await response.json();
      setEvaluations(data || []);
    } catch (error: any) {
      console.error("Error fetching evaluations:", error);
      toast.error("Failed to load evaluations");
    } finally {
      setIsLoading(false);
    }
  };

  const getVerdictIcon = (verdict: string) => {
    switch (verdict) {
      case "pass":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "fail":
        return <XCircle className="w-4 h-4 text-red-600" />;
      case "continue":
        return <ArrowRight className="w-4 h-4 text-blue-600" />;
      case "stop":
        return <AlertCircle className="w-4 h-4 text-yellow-600" />;
      default:
        return <FileText className="w-4 h-4 text-gray-400" />;
    }
  };

  const getVerdictColor = (verdict: string) => {
    switch (verdict) {
      case "pass":
        return "bg-green-100 text-green-800";
      case "fail":
        return "bg-red-100 text-red-800";
      case "continue":
        return "bg-blue-100 text-blue-800";
      case "stop":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
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
          <h2 className="text-2xl font-bold text-gray-900">Evaluations</h2>
          <p className="text-sm text-gray-600 mt-1">
            Human judgment on experiment performance
          </p>
        </div>
        <Link href="/dashboard/admin/governance/evaluations/new">
          <Button leftIcon={<Plus className="w-4 h-4" />}>
            New Evaluation
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <p className="text-sm text-gray-500">Total</p>
          <p className="text-2xl font-bold">{evaluations.length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <p className="text-sm text-green-600">Pass</p>
          <p className="text-2xl font-bold text-green-600">
            {evaluations.filter(e => e.verdict === "pass").length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <p className="text-sm text-red-600">Fail</p>
          <p className="text-2xl font-bold text-red-600">
            {evaluations.filter(e => e.verdict === "fail").length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <p className="text-sm text-blue-600">Continue</p>
          <p className="text-2xl font-bold text-blue-600">
            {evaluations.filter(e => e.verdict === "continue").length}
          </p>
        </div>
      </div>

      {/* Evaluations List */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        {evaluations.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600">No evaluations found</p>
            <p className="text-sm text-gray-500 mt-1">
              Evaluations are created after experiments run
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                  Experiment
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase">
                  Verdict
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                  Reason
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase">
                  Capital Spent
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                  Next Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {evaluations.map((evaluation) => (
                <tr key={evaluation.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {formatDate(evaluation.created_at)}
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-gray-900">
                        {evaluation.experiments?.name || "—"}
                      </p>
                      <p className="text-sm text-gray-500">
                        {evaluation.experiments?.campaigns?.name || "—"}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${getVerdictColor(evaluation.verdict)}`}
                    >
                      {getVerdictIcon(evaluation.verdict)}
                      {evaluation.verdict}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {evaluation.reason?.replace(/_/g, " ") || "—"}
                  </td>
                  <td className="px-6 py-4 text-center text-gray-600">
                    {evaluation.capital_spent_usd
                      ? `$${evaluation.capital_spent_usd.toLocaleString()}`
                      : "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {evaluation.recommended_next_action?.replace(/_/g, " ") || "—"}
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


