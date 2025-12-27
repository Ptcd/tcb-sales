import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/governance/evaluations
 * List evaluations with filters
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const params = request.nextUrl.searchParams;
  
  let query = supabase
    .from("evaluations")
    .select(`
      *,
      experiments!experiment_id(id, name)
    `)
    .order("created_at", { ascending: false })
    .limit(500);
  
  if (params.get("experiment_id")) {
    query = query.eq("experiment_id", params.get("experiment_id"));
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error("Error fetching evaluations:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data || []);
}

/**
 * POST /api/governance/evaluations
 * Create evaluation (admin only, immutable after creation)
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
  
  if (!body.experiment_id || !body.verdict) {
    return NextResponse.json({ 
      error: "experiment_id and verdict are required" 
    }, { status: 400 });
  }
  
  // Validate verdict
  if (!["pass", "fail", "continue", "stop"].includes(body.verdict)) {
    return NextResponse.json({ 
      error: "verdict must be one of: pass, fail, continue, stop" 
    }, { status: 400 });
  }
  
  // Validate reason if provided
  if (body.reason && !["pitch_channel", "activation_process", "economics", "capital_time", "inconclusive"].includes(body.reason)) {
    return NextResponse.json({ 
      error: "Invalid reason value" 
    }, { status: 400 });
  }
  
  // Verify experiment exists
  const { data: experiment } = await supabase
    .from("experiments")
    .select("id, name")
    .eq("id", body.experiment_id)
    .single();
  
  if (!experiment) {
    return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
  }
  
  const { data, error } = await supabase
    .from("evaluations")
    .insert({
      experiment_id: body.experiment_id,
      verdict: body.verdict,
      reason: body.reason,
      recommended_next_action: body.recommended_next_action,
      admin_notes: body.admin_notes,
      capital_spent_usd: body.capital_spent_usd,
      tranches_consumed: body.tranches_consumed,
      created_by: user.id,
    })
    .select()
    .single();
  
  if (error) {
    console.error("Error creating evaluation:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data, { status: 201 });
}

