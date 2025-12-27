import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/governance/cost-rollups
 * Get aggregated costs with filters
 * Append-only table (no POST/PATCH - created by cron)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const params = request.nextUrl.searchParams;
  
  let query = supabase
    .from("cost_rollups")
    .select("*")
    .order("date", { ascending: false })
    .limit(1000);
  
  if (params.get("campaign_id")) {
    query = query.eq("campaign_id", params.get("campaign_id"));
  }
  if (params.get("experiment_id")) {
    query = query.eq("experiment_id", params.get("experiment_id"));
  }
  if (params.get("source")) {
    query = query.eq("source", params.get("source"));
  }
  if (params.get("start_date")) {
    query = query.gte("date", params.get("start_date"));
  }
  if (params.get("end_date")) {
    query = query.lte("date", params.get("end_date"));
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error("Error fetching cost rollups:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  // Aggregate by campaign/experiment/source if requested
  if (params.get("aggregate") === "true") {
    const aggregated = new Map<string, { campaign_id: string; experiment_id: string | null; source: string; total_cost: number }>();
    
    for (const row of data || []) {
      const key = `${row.campaign_id}-${row.experiment_id || 'null'}-${row.source}`;
      const current = aggregated.get(key) || {
        campaign_id: row.campaign_id,
        experiment_id: row.experiment_id,
        source: row.source,
        total_cost: 0,
      };
      current.total_cost += parseFloat(row.cost_usd);
      aggregated.set(key, current);
    }
    
    return NextResponse.json(Array.from(aggregated.values()));
  }
  
  return NextResponse.json(data);
}


