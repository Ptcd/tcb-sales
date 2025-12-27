import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/governance/budget-burn?campaign_id=xxx
 * Returns budget burn status for a campaign
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get("campaign_id");

  if (!campaignId) {
    return NextResponse.json({ error: "campaign_id required" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  // Get campaign budget
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, name, capital_budget_usd")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Sum all revenue for this campaign
  const { data: revenueData } = await supabase
    .from("revenue_events")
    .select("amount_usd")
    .eq("campaign_id", campaignId);

  const totalRevenue = (revenueData || []).reduce(
    (sum, r) => sum + parseFloat(r.amount_usd || 0),
    0
  );

  // Sum all costs for this campaign
  const { data: costData } = await supabase
    .from("cost_rollups")
    .select("cost_usd")
    .eq("campaign_id", campaignId);

  const totalCosts = (costData || []).reduce(
    (sum, c) => sum + parseFloat(c.cost_usd || 0),
    0
  );

  const initialBudget = campaign.capital_budget_usd || 0;
  const remaining = initialBudget + totalRevenue - totalCosts;

  return NextResponse.json({
    campaign_id: campaignId,
    campaign_name: campaign.name,
    initial_budget: initialBudget,
    total_revenue: totalRevenue,
    total_costs: totalCosts,
    remaining: remaining,
  });
}

