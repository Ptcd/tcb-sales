import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/governance/time-logs
 * List time logs with filters
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const params = request.nextUrl.searchParams;
  
  let query = supabase
    .from("time_logs")
    .select(`
      *,
      user_profiles!team_member_id(id, full_name, email),
      campaigns!campaign_id(id, name)
    `)
    .order("date", { ascending: false })
    .limit(500);
  
  if (params.get("campaign_id")) {
    query = query.eq("campaign_id", params.get("campaign_id"));
  }
  if (params.get("team_member_id")) {
    query = query.eq("team_member_id", params.get("team_member_id"));
  }
  if (params.get("start_date")) {
    query = query.gte("date", params.get("start_date"));
  }
  if (params.get("end_date")) {
    query = query.lte("date", params.get("end_date"));
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error("Error fetching time logs:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data);
}

/**
 * POST /api/governance/time-logs
 * Create time log entry (admin only)
 * Enforces one entry per (team_member_id, campaign_id, date)
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
  
  if (!body.team_member_id || !body.campaign_id || !body.date || body.hours_logged === undefined) {
    return NextResponse.json({ 
      error: "team_member_id, campaign_id, date, and hours_logged are required" 
    }, { status: 400 });
  }
  
  // Validate hours
  if (body.hours_logged < 0 || body.hours_logged > 24) {
    return NextResponse.json({ 
      error: "hours_logged must be between 0 and 24" 
    }, { status: 400 });
  }
  
  // Check if entry already exists (upsert behavior)
  const { data: existing } = await supabase
    .from("time_logs")
    .select("id")
    .eq("team_member_id", body.team_member_id)
    .eq("campaign_id", body.campaign_id)
    .eq("date", body.date)
    .single();
  
  if (existing) {
    // Update existing entry
    const { data, error } = await supabase
      .from("time_logs")
      .update({
        hours_logged: body.hours_logged,
        notes: body.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();
    
    if (error) {
      console.error("Error updating time log:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json(data);
  }
  
  // Create new entry
  const { data, error } = await supabase
    .from("time_logs")
    .insert({
      team_member_id: body.team_member_id,
      campaign_id: body.campaign_id,
      date: body.date,
      hours_logged: body.hours_logged,
      notes: body.notes,
    })
    .select()
    .single();
  
  if (error) {
    console.error("Error creating time log:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data, { status: 201 });
}

/**
 * PATCH /api/governance/time-logs
 * Update time log (admin only, same day only)
 * Expects { id, hours_logged?, notes? } in request body
 */
export async function PATCH(request: NextRequest) {
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
  
  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  
  const { id } = body;
  
  // Get current entry
  const { data: current } = await supabase
    .from("time_logs")
    .select("date")
    .eq("id", id)
    .single();
  
  if (!current) {
    return NextResponse.json({ error: "Time log not found" }, { status: 404 });
  }
  
  // Validate hours if provided
  if (body.hours_logged !== undefined) {
    if (body.hours_logged < 0 || body.hours_logged > 24) {
      return NextResponse.json({ 
        error: "hours_logged must be between 0 and 24" 
      }, { status: 400 });
    }
  }
  
  const { data, error } = await supabase
    .from("time_logs")
    .update({
      hours_logged: body.hours_logged,
      notes: body.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  
  if (error) {
    console.error("Error updating time log:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data);
}

