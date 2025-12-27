import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/governance/experiments/[id]/end
 * End experiment (admin only)
 * Body: { status: "completed" | "terminated" }
 * Sets ended_at timestamp for event attribution
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
  
  const body = await request.json();
  const finalStatus = body.status;
  
  if (finalStatus !== "completed" && finalStatus !== "terminated") {
    return NextResponse.json({ 
      error: "status must be 'completed' or 'terminated'" 
    }, { status: 400 });
  }
  
  // Get current experiment
  const { data: experiment } = await supabase
    .from("experiments")
    .select("status")
    .eq("id", id)
    .single();
  
  if (!experiment) {
    return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
  }
  
  if (experiment.status === "completed" || experiment.status === "terminated") {
    return NextResponse.json({ 
      error: "Experiment already ended. Cannot modify." 
    }, { status: 400 });
  }
  
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("experiments")
    .update({ 
      status: finalStatus, 
      end_date: now.split("T")[0],
      ended_at: now, // Critical: timestamp for event attribution
      updated_at: now,
    })
    .eq("id", id)
    .select()
    .single();
  
  if (error) {
    console.error("Error ending experiment:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data);
}


