import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/governance/bonus-events
 * List bonus events with filters
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const params = request.nextUrl.searchParams;
  
  let query = supabase
    .from("bonus_events")
    .select(`
      *,
      user_profiles!team_member_id(id, full_name, email),
      experiments!experiment_id(id, name, status)
    `)
    .order("created_at", { ascending: false })
    .limit(500);
  
  if (params.get("experiment_id")) {
    query = query.eq("experiment_id", params.get("experiment_id"));
  }
  if (params.get("team_member_id")) {
    query = query.eq("team_member_id", params.get("team_member_id"));
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error("Error fetching bonus events:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data);
}

/**
 * POST /api/governance/bonus-events
 * Award bonus (admin only)
 * Validates experiment is running
 * Enforces one bonus per performance_event_id
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
  
  if (!body.experiment_id || !body.team_member_id || !body.event_type || !body.bonus_amount_usd) {
    return NextResponse.json({ 
      error: "experiment_id, team_member_id, event_type, and bonus_amount_usd are required" 
    }, { status: 400 });
  }
  
  // Validate experiment is running
  const { data: experiment } = await supabase
    .from("experiments")
    .select("status, name")
    .eq("id", body.experiment_id)
    .single();
  
  if (!experiment) {
    return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
  }
  
  if (experiment.status !== "running") {
    return NextResponse.json({ 
      error: `Cannot award bonus: experiment '${experiment.name}' is not running (status: ${experiment.status})` 
    }, { status: 400 });
  }
  
  // If performance_event_id provided, check for existing bonus
  if (body.performance_event_id) {
    const { data: existing } = await supabase
      .from("bonus_events")
      .select("id")
      .eq("performance_event_id", body.performance_event_id)
      .single();
    
    if (existing) {
      return NextResponse.json({ 
        error: "Bonus already awarded for this performance event" 
      }, { status: 409 });
    }
  }
  
  const { data, error } = await supabase
    .from("bonus_events")
    .insert({
      experiment_id: body.experiment_id,
      team_member_id: body.team_member_id,
      performance_event_id: body.performance_event_id,
      event_type: body.event_type,
      bonus_amount_usd: body.bonus_amount_usd,
    })
    .select()
    .single();
  
  if (error) {
    // Unique constraint violation on performance_event_id
    if (error.code === "23505") {
      return NextResponse.json({ 
        error: "Bonus already awarded for this performance event" 
      }, { status: 409 });
    }
    console.error("Error creating bonus event:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data, { status: 201 });
}


