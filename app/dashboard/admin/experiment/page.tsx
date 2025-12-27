"use client";

import { useState, useEffect } from "react";
import { RefreshCw, FlaskConical } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";

interface VariantData {
  total: number;
  activated: number;
  activated24h: number;
  activationRate: number;
  activation24hRate: number;
}

export default function ExperimentPage() {
  const [data, setData] = useState<{
    variantA: VariantData;
    variantB: VariantData;
    sampleSize: number;
    recommendation: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/experiment-results");
      if (res.ok) setData(await res.json());
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  const getColor = (rate: number) => {
    if (rate < 25) return "text-red-600 bg-red-50";
    if (rate < 45) return "text-yellow-600 bg-yellow-50";
    return "text-green-600 bg-green-50";
  };

  if (isLoading) return <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FlaskConical className="h-6 w-6" />
            Follow-up Experiment (Admin Only)
          </h1>
          <p className="text-sm text-gray-500 mt-1">Silent A/B test - SDRs don't see this</p>
        </div>
        <button onClick={fetchData} className="p-2 hover:bg-gray-100 rounded-lg">
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>

      {data && (
        <>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">{data.recommendation}</p>
            <p className="text-xs text-blue-600 mt-1">Total sample: {data.sampleSize} trials</p>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Variant A */}
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4">Variant A: Product-Only</h2>
              <p className="text-xs text-gray-500 mb-4">24h product nudge, no SDR task</p>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Trials</span>
                  <span className="font-bold">{data.variantA.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Activated</span>
                  <span className="font-bold">{data.variantA.activated}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Activation Rate</span>
                  <span className={`font-bold px-2 py-1 rounded ${getColor(data.variantA.activationRate)}`}>
                    {data.variantA.activationRate}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Activated in 24h</span>
                  <span className={`font-bold px-2 py-1 rounded ${getColor(data.variantA.activation24hRate)}`}>
                    {data.variantA.activation24hRate}%
                  </span>
                </div>
              </div>
            </div>

            {/* Variant B */}
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4">Variant B: Product + SDR</h2>
              <p className="text-xs text-gray-500 mb-4">24h product nudge + SDR follow-up task</p>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Trials</span>
                  <span className="font-bold">{data.variantB.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Activated</span>
                  <span className="font-bold">{data.variantB.activated}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Activation Rate</span>
                  <span className={`font-bold px-2 py-1 rounded ${getColor(data.variantB.activationRate)}`}>
                    {data.variantB.activationRate}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Activated in 24h</span>
                  <span className={`font-bold px-2 py-1 rounded ${getColor(data.variantB.activation24hRate)}`}>
                    {data.variantB.activation24hRate}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


