import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/governance/experiments/[id]/start
 * Start experiment (admin only)
 * CRITICAL: Enforces ONE RUNNING experiment per campaign
 * Sets started_at timestamp for event attribution
 */
export async function POST(
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
  
  // 1. Get the experiment
  const { data: experiment, error: fetchError } = await supabase
    .from("experiments")
    .select("*, campaigns(id)")
    .eq("id", id)
    .single();
  
  if (fetchError || !experiment) {
    return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
  }
  
  // 2. Validate status
  if (experiment.status !== "planned" && experiment.status !== "paused") {
    return NextResponse.json({ 
      error: `Cannot start experiment with status '${experiment.status}'. Must be 'planned' or 'paused'.` 
    }, { status: 400 });
  }
  
  // 3. Check no other running experiment in same campaign
  // (DB constraint also enforces this, but we check first for better error message)
  const { data: running } = await supabase
    .from("experiments")
    .select("id, name")
    .eq("campaign_id", experiment.campaign_id)
    .eq("status", "running")
    .neq("id", id);
  
  if (running && running.length > 0) {
    return NextResponse.json({ 
      error: `Cannot start: experiment '${running[0].name}' is already running in this campaign` 
    }, { status: 409 });
  }
  
  // 4. Start the experiment
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("experiments")
    .update({ 
      status: "running", 
      start_date: now.split("T")[0],
      started_at: now, // Critical: timestamp for event attribution
      updated_at: now,
    })
    .eq("id", id)
    .select()
    .single();
  
  if (error) {
    // If unique constraint violation, another experiment started
    if (error.code === "23505") {
      return NextResponse.json({ 
        error: "Another experiment is already running in this campaign" 
      }, { status: 409 });
    }
    console.error("Error starting experiment:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data);
}


