import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/cron/generate-cost-rollups
 * Daily cron job to aggregate costs from yesterday
 * V1: Labor costs rolled at campaign level only (experiment attribution derived later)
 */
export async function GET(request: NextRequest) {
  // Verify cron secret if set
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const dateStr = yesterday.toISOString().split("T")[0];

  console.log(`[Cost Rollups] Processing costs for ${dateStr}`);

  let rollupsCreated = 0;
  const errors: string[] = [];

  // 1. LABOR COSTS
  // Sum time_logs for yesterday, multiply by hourly_rate
  // V1: Roll at campaign level only
  const { data: timeLogs, error: timeLogsError } = await supabase
    .from("time_logs")
    .select(`
      campaign_id,
      hours_logged,
      user_profiles!inner(id, hourly_rate_usd)
    `)
    .eq("date", dateStr);

  if (timeLogsError) {
    console.error("Error fetching time logs:", timeLogsError);
    errors.push(`Time logs fetch failed: ${timeLogsError.message}`);
  } else {
    // Group by campaign and calculate cost
    const laborByCampaign = new Map<string, number>();
    for (const log of timeLogs || []) {
      const rate = (log.user_profiles as any)?.hourly_rate_usd || 0;
      if (rate === 0) {
        console.warn(`User ${(log.user_profiles as any)?.id} has no hourly_rate_usd set`);
        continue;
      }
      const cost = parseFloat(log.hours_logged) * rate;
      const current = laborByCampaign.get(log.campaign_id) || 0;
      laborByCampaign.set(log.campaign_id, current + cost);
    }

    // Insert labor rollups at campaign level
    for (const [campaignId, cost] of laborByCampaign) {
      const { error: insertError } = await supabase.from("cost_rollups").insert({
        date: dateStr,
        campaign_id: campaignId,
        experiment_id: null, // V1: campaign-level only
        source: "labor",
        cost_usd: cost,
      });

      if (insertError) {
        console.error(`Error inserting labor rollup for campaign ${campaignId}:`, insertError);
        errors.push(`Labor rollup failed for campaign ${campaignId}: ${insertError.message}`);
      } else {
        rollupsCreated++;
      }
    }
  }

  // 2. BONUS COSTS
  // Sum bonuses created yesterday, group by campaign
  const { data: bonuses, error: bonusesError } = await supabase
    .from("bonus_events")
    .select(`
      experiment_id,
      bonus_amount_usd,
      experiments!inner(campaign_id)
    `)
    .gte("created_at", `${dateStr}T00:00:00Z`)
    .lt("created_at", `${dateStr}T23:59:59Z`);

  if (bonusesError) {
    console.error("Error fetching bonus events:", bonusesError);
    errors.push(`Bonus events fetch failed: ${bonusesError.message}`);
  } else {
    const bonusByCampaign = new Map<string, { experimentId: string; cost: number }>();
    for (const bonus of bonuses || []) {
      const campaignId = (bonus.experiments as any)?.campaign_id;
      if (!campaignId) continue;
      const current = bonusByCampaign.get(campaignId) || { 
        experimentId: bonus.experiment_id, 
        cost: 0 
      };
      current.cost += parseFloat(bonus.bonus_amount_usd);
      bonusByCampaign.set(campaignId, current);
    }

    for (const [campaignId, { experimentId, cost }] of bonusByCampaign) {
      const { error: insertError } = await supabase.from("cost_rollups").insert({
        date: dateStr,
        campaign_id: campaignId,
        experiment_id: experimentId,
        source: "bonus",
        cost_usd: cost,
      });

      if (insertError) {
        console.error(`Error inserting bonus rollup for campaign ${campaignId}:`, insertError);
        errors.push(`Bonus rollup failed for campaign ${campaignId}: ${insertError.message}`);
      } else {
        rollupsCreated++;
      }
    }
  }

  // 3. TWILIO COSTS
  // TODO: Implement Twilio Usage Records API call
  // Pull yesterday's usage, sum costs for calls >= 150s
  // For now, log that it's not implemented
  console.log("[Cost Rollups] Twilio cost integration not yet implemented in V1");

  // 4. GCP COSTS
  // Deferred to V2 (BigQuery export pipeline)
  console.log("[Cost Rollups] GCP costs deferred to V2");

  return NextResponse.json({
    success: true,
    date: dateStr,
    rollups_created: rollupsCreated,
    errors: errors.length > 0 ? errors : undefined,
  });
}

/**
 * POST /api/cron/generate-cost-rollups
 * Manual trigger for testing
 */
export async function POST(request: NextRequest) {
  return GET(request);
}


