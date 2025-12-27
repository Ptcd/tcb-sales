import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/recordings
 * 
 * Get recordings from scheduled activation meetings
 */

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin role
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, organization_id")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get calls with recordings from activation meetings
    const { data: calls, error } = await supabase
      .from("calls")
      .select(`
        id,
        twilio_call_sid,
        twilio_recording_sid,
        recording_url,
        recording_status,
        duration_seconds,
        started_at,
        ended_at,
        lead_id,
        search_results!inner (
          id,
          name,
          phone,
          organization_id
        )
      `)
      .eq("search_results.organization_id", profile.organization_id)
      .not("recording_url", "is", null)
      .order("started_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error fetching recordings:", error);
      return NextResponse.json({ error: "Failed to fetch recordings" }, { status: 500 });
    }

    // Transform data
    const recordings = (calls || []).map((call: any) => ({
      id: call.id,
      meeting_id: call.id,
      company_name: call.search_results?.name || "Unknown",
      phone: call.search_results?.phone || "",
      scheduled_at: call.started_at,
      duration_seconds: call.duration_seconds || 0,
      recording_url: call.recording_url,
      recording_status: call.recording_status || "completed",
      outcome: "completed",
    }));

    return NextResponse.json({
      success: true,
      recordings,
    });

  } catch (error: any) {
    console.error("Error in GET /api/admin/recordings:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
