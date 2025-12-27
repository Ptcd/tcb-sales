import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/governance/experiments?campaign_id=xxx
 * List experiments, optionally filtered by campaign
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const campaignId = request.nextUrl.searchParams.get("campaign_id");
  
  let query = supabase
    .from("experiments")
    .select(`
      *,
      campaigns!inner(id, name)
    `)
    .order("created_at", { ascending: false });
  
  if (campaignId) {
    query = query.eq("campaign_id", campaignId);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error("Error fetching experiments:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data);
}

/**
 * POST /api/governance/experiments
 * Create experiment (admin only)
 * Always starts as 'planned' status
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  
  // Check authentication
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  // Check admin role
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  
  const body = await request.json();
  
  // Validate required fields
  if (!body.campaign_id || !body.name) {
    return NextResponse.json({ 
      error: "campaign_id and name are required" 
    }, { status: 400 });
  }
  
  // Verify campaign exists
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", body.campaign_id)
    .single();
  
  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  
  const { data, error } = await supabase
    .from("experiments")
    .insert({
      campaign_id: body.campaign_id,
      name: body.name,
      hypothesis: body.hypothesis,
      status: "planned", // Always start as planned
      capital_cap_usd: body.capital_cap_usd,
      time_cap_days: body.time_cap_days,
      tranche_size_usd: body.tranche_size_usd,
      primary_success_event: body.primary_success_event,
      secondary_events: body.secondary_events || [],
      bonus_rules: body.bonus_rules || [],
    })
    .select()
    .single();
  
  if (error) {
    console.error("Error creating experiment:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data, { status: 201 });
}

