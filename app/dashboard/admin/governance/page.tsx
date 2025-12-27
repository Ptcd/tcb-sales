"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { FlaskConical, Package, TrendingUp, BarChart3, Tag, Clock, DollarSign, FileText } from "lucide-react";
import toast from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";

interface Product {
  id: string;
  name: string;
  active: boolean;
}

interface Campaign {
  id: string;
  name: string;
  product_id: string | null;
  owner_user_id: string | null;
  capital_budget_usd: number | null;
  products?: { name: string } | null;
}

interface Experiment {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
}

const tabs = [
  { name: "Overview", href: "/dashboard/admin/governance", icon: BarChart3 },
  { name: "Campaigns", href: "/dashboard/admin/governance/campaigns", icon: Tag },
  { name: "Performance", href: "/dashboard/admin/governance/performance", icon: BarChart3 },
  { name: "Experiments", href: "/dashboard/admin/governance/experiments", icon: FlaskConical },
  { name: "Time Logs", href: "/dashboard/admin/governance/time-logs", icon: Clock },
  { name: "Payroll", href: "/dashboard/admin/governance/payroll", icon: DollarSign },
  { name: "Evaluations", href: "/dashboard/admin/governance/evaluations", icon: FileText },
];

export default function GovernanceDashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [products, setProducts] = useState<Product[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      
      const [productsRes, campaignsRes, experimentsRes] = await Promise.all([
        fetch("/api/governance/products"),
        fetch("/api/campaigns"),
        fetch("/api/governance/experiments"),
      ]);

      if (!productsRes.ok || !campaignsRes.ok || !experimentsRes.ok) {
        throw new Error("Failed to load data");
      }

      const [productsData, campaignsResponse, experimentsData] = await Promise.all([
        productsRes.json(),
        campaignsRes.json(),
        experimentsRes.json(),
      ]);

      // Handle campaigns API response format
      const campaignsData = campaignsResponse.campaigns || campaignsResponse;

      setProducts(productsData);
      setCampaigns(campaignsData);
      setExperiments(experimentsData);
      
      // Load products for campaigns
      const campaignsWithProducts = await Promise.all(
        campaignsData.map(async (campaign: Campaign) => {
          if (campaign.product_id) {
            const product = productsData.find((p: Product) => p.id === campaign.product_id);
            return { ...campaign, products: product || null };
          }
          return campaign;
        })
      );
      setCampaigns(campaignsWithProducts);
    } catch (error: any) {
      console.error("Error loading governance data:", error);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Capital Governance</h1>
        <p className="text-gray-600">Manage distribution experiments with capital discipline</p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href || 
              (tab.href !== "/dashboard/admin/governance" && pathname?.startsWith(tab.href));
            return (
              <Link
                key={tab.name}
                href={tab.href}
                className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm ${
                  isActive
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.name}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Overview content when on main page */}
      {pathname === "/dashboard/admin/governance" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-2">
            <Package className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold">Products</h2>
          </div>
          <p className="text-3xl font-bold">{products.length}</p>
          <p className="text-sm text-gray-500 mt-1">Active products</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-6 h-6 text-green-600" />
            <h2 className="text-xl font-semibold">Campaigns</h2>
          </div>
          <p className="text-3xl font-bold">{campaigns.length}</p>
          <p className="text-sm text-gray-500 mt-1">Total campaigns</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-2">
            <FlaskConical className="w-6 h-6 text-purple-600" />
            <h2 className="text-xl font-semibold">Experiments</h2>
          </div>
          <p className="text-3xl font-bold">{experiments.filter(e => e.status === "running").length}</p>
          <p className="text-sm text-gray-500 mt-1">Running experiments</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold">Campaigns</h2>
        </div>
        <div className="p-6">
          {campaigns.length === 0 ? (
            <p className="text-gray-500">No campaigns found</p>
          ) : (
            <div className="space-y-4">
              {campaigns.map((campaign) => {
                const campaignExperiments = experiments.filter(e => e.campaign_id === campaign.id);
                const runningExp = campaignExperiments.find(e => e.status === "running");
                
                return (
                  <div
                    key={campaign.id}
                    className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/dashboard/admin/governance/campaigns/${campaign.id}`)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-lg">{campaign.name}</h3>
                        <p className="text-sm text-gray-500">
                          Product: {campaign.products?.name || "N/A"}
                          {campaign.capital_budget_usd && ` • Budget: $${campaign.capital_budget_usd.toLocaleString()}`}
                        </p>
                      </div>
                      <div className="text-right">
                        {runningExp && (
                          <span className="inline-block px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                            Running: {runningExp.name}
                          </span>
                        )}
                        <p className="text-sm text-gray-500 mt-1">
                          {campaignExperiments.length} experiment(s)
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
}

