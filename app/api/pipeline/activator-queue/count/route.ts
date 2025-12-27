import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/pipeline/activator-queue/count
 * Returns the count of items in Activator queue for header badge
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ count: 0 });
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("is_activator, role")
      .eq("id", user.id)
      .single();

    // Only activators and admins see count
    if (!profile?.is_activator && profile?.role !== "admin") {
      return NextResponse.json({ count: 0 });
    }

    const now = new Date();
    const nowISO = now.toISOString();
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

    // Count blocked items
    const { count: blockedCount } = await supabase
      .from("trial_pipeline")
      .select("*", { count: "exact", head: true })
      .eq("followup_owner_role", "activator")
      .eq("activation_status", "blocked")
      .eq("credits_remaining", 20)
      .lte("next_followup_at", nowISO);

    // Count unproven items (installed but credits still 20)
    const { data: unprovenMeetings } = await supabase
      .from("activation_meetings")
      .select(`
        id,
        trial_pipeline:trial_pipeline_id (
          credits_remaining,
          last_meeting_outcome
        )
      `)
      .eq("status", "completed")
      .lte("completed_at", thirtyMinutesAgo)
      .not("install_url", "is", null);

    const unprovenCount = (unprovenMeetings || []).filter((m: any) => {
      const pipeline = m.trial_pipeline;
      return pipeline && 
             pipeline.credits_remaining === 20 && 
             pipeline.last_meeting_outcome === 'installed_proven';
    }).length;

    return NextResponse.json({ 
      count: (blockedCount || 0) + unprovenCount,
      blocked: blockedCount || 0,
      unproven: unprovenCount,
    });
  } catch (error) {
    console.error("Error getting activator queue count:", error);
    return NextResponse.json({ count: 0 });
  }
}


