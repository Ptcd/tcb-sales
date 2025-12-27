import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/activations/events?trialPipelineId=xxx
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const trialPipelineId = searchParams.get("trialPipelineId");
  if (!trialPipelineId) {
    return NextResponse.json({ error: "trialPipelineId required" }, { status: 400 });
  }

  // Get events with actor names
  const { data: events, error } = await supabase
    .from("activation_events")
    .select(`
      *,
      actor:user_profiles!actor_user_id(full_name, email)
    `)
    .eq("trial_pipeline_id", trialPipelineId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, events: events || [] });
}


