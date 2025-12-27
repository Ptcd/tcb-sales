import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/pipeline/sdr-queue/count
 * Returns the count of items in SDR queue for header badge
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ count: 0 });
    }

    const now = new Date().toISOString();

    const { count } = await supabase
      .from("trial_pipeline")
      .select("*", { count: "exact", head: true })
      .eq("followup_owner_role", "sdr")
      .in("activation_status", ["no_show", "queued"])
      .eq("credits_remaining", 20)
      .lte("next_followup_at", now);

    return NextResponse.json({ count: count || 0 });
  } catch (error) {
    console.error("Error getting SDR queue count:", error);
    return NextResponse.json({ count: 0 });
  }
}


