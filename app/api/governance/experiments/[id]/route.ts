import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/governance/experiments/[id]
 * Get single experiment with performance summary
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from("experiments")
    .select(`
      *,
      campaigns!inner(id, name, product_id, products(id, name))
    `)
    .eq("id", id)
    .single();
  
  if (error || !data) {
    return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
  }
  
  return NextResponse.json(data);
}

/**
 * PATCH /api/governance/experiments/[id]
 * Update experiment (admin only)
 * Cannot change status to running (use /start endpoint)
 * Cannot change status from completed/terminated
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
  
  // Get current experiment
  const { data: current } = await supabase
    .from("experiments")
    .select("status")
    .eq("id", id)
    .single();
  
  if (!current) {
    return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
  }
  
  // Cannot modify completed/terminated experiments
  if (current.status === "completed" || current.status === "terminated") {
    return NextResponse.json({ 
      error: "Cannot modify completed or terminated experiment" 
    }, { status: 400 });
  }
  
  const body = await request.json();
  
  // Prevent status changes via PATCH (use /start or /end endpoints)
  if (body.status && body.status !== current.status) {
    return NextResponse.json({ 
      error: "Cannot change status via PATCH. Use /start or /end endpoints." 
    }, { status: 400 });
  }
  
  const { data, error } = await supabase
    .from("experiments")
    .update({
      name: body.name,
      hypothesis: body.hypothesis,
      capital_cap_usd: body.capital_cap_usd,
      time_cap_days: body.time_cap_days,
      tranche_size_usd: body.tranche_size_usd,
      primary_success_event: body.primary_success_event,
      secondary_events: body.secondary_events,
      bonus_rules: body.bonus_rules,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  
  if (error) {
    console.error("Error updating experiment:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data);
}

