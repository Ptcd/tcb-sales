import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user profile to check role - admin only
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Get query params
  const searchParams = request.nextUrl.searchParams;
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "startDate and endDate are required" },
      { status: 400 }
    );
  }

  const startIso = new Date(startDate).toISOString();
  const endIso = new Date(endDate).toISOString();

  try {
    // Get all users in the organization
    const { data: orgUsers } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("organization_id", profile.organization_id);

    if (!orgUsers) {
      return NextResponse.json({
        success: true,
        funnel: {
          dials: 0,
          conversations: 0,
          booked: 0,
          attended: 0,
          installed: 0,
          firstLead: 0,
        },
        conversionRates: {},
      });
    }

    const userIds = orgUsers.map(u => u.id);

    // Stage 1: Dials (all outbound calls)
    const { count: dials } = await supabase
      .from("calls")
      .select("*", { count: "exact", head: true })
      .in("user_id", userIds)
      .eq("call_type", "outbound")
      .gte("initiated_at", startIso)
      .lt("initiated_at", endIso);

    // Stage 2: Conversations (calls >= 30 seconds)
    const { count: conversations } = await supabase
      .from("calls")
      .select("*", { count: "exact", head: true })
      .in("user_id", userIds)
      .eq("call_type", "outbound")
      .gte("initiated_at", startIso)
      .lt("initiated_at", endIso)
      .gte("duration", 30);

    // Stage 3: Booked (all scheduled activation meetings)
    const { count: booked } = await supabase
      .from("activation_meetings")
      .select("*", { count: "exact", head: true })
      .gte("scheduled_start_at", startIso)
      .lt("scheduled_start_at", endIso);

    // Stage 4: Attended (status = 'completed')
    const { count: attended } = await supabase
      .from("activation_meetings")
      .select("*", { count: "exact", head: true })
      .eq("status", "completed")
      .gte("completed_at", startIso)
      .lt("completed_at", endIso);

    // Stage 5: Installed (embed_snippet_copied_at set)
    const { count: installed } = await supabase
      .from("trial_pipeline")
      .select("*", { count: "exact", head: true })
      .not("embed_snippet_copied_at", "is", null)
      .gte("embed_snippet_copied_at", startIso)
      .lt("embed_snippet_copied_at", endIso);

    // Stage 6: First Lead (first_lead_received_at set)
    const { count: firstLead } = await supabase
      .from("trial_pipeline")
      .select("*", { count: "exact", head: true })
      .not("first_lead_received_at", "is", null)
      .gte("first_lead_received_at", startIso)
      .lt("first_lead_received_at", endIso);

    const funnel = {
      dials: dials || 0,
      conversations: conversations || 0,
      booked: booked || 0,
      attended: attended || 0,
      installed: installed || 0,
      firstLead: firstLead || 0,
    };

    // Calculate conversion rates
    const conversionRates = {
      dialsToConversations: funnel.dials > 0
        ? ((funnel.conversations / funnel.dials) * 100).toFixed(1)
        : "0.0",
      conversationsToBooked: funnel.conversations > 0
        ? ((funnel.booked / funnel.conversations) * 100).toFixed(1)
        : "0.0",
      bookedToAttended: funnel.booked > 0
        ? ((funnel.attended / funnel.booked) * 100).toFixed(1)
        : "0.0",
      attendedToInstalled: funnel.attended > 0
        ? ((funnel.installed / funnel.attended) * 100).toFixed(1)
        : "0.0",
      installedToFirstLead: funnel.installed > 0
        ? ((funnel.firstLead / funnel.installed) * 100).toFixed(1)
        : "0.0",
    };

    return NextResponse.json({
      success: true,
      funnel,
      conversionRates,
      startDate,
      endDate,
    });
  } catch (error: any) {
    console.error("Error calculating funnel:", error);
    return NextResponse.json(
      { error: error.message || "Failed to calculate funnel" },
      { status: 500 }
    );
  }
}
