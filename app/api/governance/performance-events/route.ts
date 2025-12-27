import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Helper: Find running experiment for a campaign at a specific timestamp
 * Uses started_at and ended_at for accurate attribution
 * Returns null if no experiment was running at that timestamp
 */
async function getRunningExperimentAtTimestamp(
  supabase: any,
  campaignId: string,
  timestamp: string
): Promise<string | null> {
  // Find experiment that was running at the given timestamp
  // Must have started_at <= timestamp AND (ended_at IS NULL OR ended_at > timestamp)
  const { data } = await supabase
    .from("experiments")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("status", "running")
    .not("started_at", "is", null)
    .lte("started_at", timestamp)
    .or(`ended_at.is.null,ended_at.gt.${timestamp}`)
    .order("started_at", { ascending: false })
    .limit(1);
  
  // Handle both single and array responses
  const experiment = Array.isArray(data) ? data[0] : data;
  return experiment?.id || null;
}

/**
 * GET /api/governance/performance-events
 * List performance events with filters
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const params = request.nextUrl.searchParams;
  
  let query = supabase
    .from("performance_events")
    .select("*")
    .order("event_timestamp", { ascending: false })
    .limit(500);
  
  if (params.get("experiment_id")) {
    query = query.eq("experiment_id", params.get("experiment_id"));
  }
  if (params.get("campaign_id")) {
    query = query.eq("campaign_id", params.get("campaign_id"));
  }
  if (params.get("event_type")) {
    query = query.eq("event_type", params.get("event_type"));
  }
  if (params.get("start_date")) {
    query = query.gte("event_timestamp", params.get("start_date"));
  }
  if (params.get("end_date")) {
    query = query.lte("event_timestamp", params.get("end_date"));
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error("Error fetching performance events:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data);
}

/**
 * POST /api/governance/performance-events
 * Record performance event
 * Auto-attributes to running experiment at event_timestamp
 * Rejects backdated events if timestamp is before experiment started_at
 */
export async function POST(request: NextRequest) {
  const supabase = createServiceRoleClient();
  const body = await request.json();
  
  if (!body.campaign_id || !body.event_type) {
    return NextResponse.json({ 
      error: "campaign_id and event_type are required" 
    }, { status: 400 });
  }
  
  // Use provided timestamp or current time
  const eventTimestamp = body.event_timestamp || new Date().toISOString();
  
  // Auto-attribute to running experiment at event_timestamp
  const experimentId = await getRunningExperimentAtTimestamp(
    supabase,
    body.campaign_id,
    eventTimestamp
  );
  
  // If event is backdated and no experiment was running, reject it
  // (unless explicitly allowed via metadata flag)
  if (!experimentId && body.event_timestamp) {
    const eventDate = new Date(eventTimestamp);
    const now = new Date();
    const isBackdated = eventDate < now;
    
    if (isBackdated && !body.allow_backdated) {
      return NextResponse.json({ 
        error: "Cannot attribute backdated event: no experiment was running at event_timestamp" 
      }, { status: 400 });
    }
  }
  
  const { data, error } = await supabase
    .from("performance_events")
    .insert({
      campaign_id: body.campaign_id,
      experiment_id: experimentId, // null if no running experiment
      lead_id: body.lead_id,
      user_id: body.user_id,
      event_type: body.event_type,
      event_timestamp: eventTimestamp,
      metadata_json: body.metadata_json || {},
    })
    .select()
    .single();
  
  if (error) {
    console.error("Error creating performance event:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data, { status: 201 });
}

