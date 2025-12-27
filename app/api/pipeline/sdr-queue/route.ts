import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/pipeline/sdr-queue
 * 
 * SDR Queue: "Install Follow-ups"
 * Shows no-shows and canceled installs that need SDR attention
 * 
 * Filter:
 * - followup_owner_role = 'sdr'
 * - activation_status IN ('no_show', 'queued')
 * - credits_remaining = 20 (not proven yet)
 * - next_followup_at <= now (overdue or due today)
 * 
 * Columns:
 * - Company, phone, website
 * - meeting.status (no_show/canceled)
 * - last_meeting_outcome
 * - original_scheduled_time
 * - next_followup_at
 * - attempt_number, reschedule_count
 * - call script hint
 */

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const includeUpcoming = searchParams.get("includeUpcoming") === "true";

    const now = new Date().toISOString();

    // Get SDR queue items from trial_pipeline
    let query = supabase
      .from("trial_pipeline")
      .select(`
        id,
        crm_lead_id,
        next_followup_at,
        last_meeting_outcome,
        activation_status,
        no_show_count,
        reschedule_count,
        no_show_at,
        next_action
      `)
      .eq("followup_owner_role", "sdr")
      .in("activation_status", ["no_show", "queued"])
      .eq("credits_remaining", 20);

    // Filter by due date unless includeUpcoming
    if (!includeUpcoming) {
      query = query.lte("next_followup_at", now);
    }

    query = query.order("next_followup_at", { ascending: true });

    const { data: queueItems, error: pipelineError } = await query;

    if (pipelineError) {
      console.error("Error fetching SDR queue:", pipelineError);
      return NextResponse.json(
        { error: "Failed to fetch SDR queue" },
        { status: 500 }
      );
    }

    if (!queueItems || queueItems.length === 0) {
      return NextResponse.json({
        success: true,
        items: [],
        count: 0,
        overdueCount: 0,
        todayCount: 0,
      });
    }

    // Get lead details
    const leadIds = queueItems.map(item => item.crm_lead_id).filter(Boolean);
    const { data: leads } = await supabase
      .from("search_results")
      .select("id, name, phone, website, email")
      .in("id", leadIds)
      .eq("organization_id", profile.organization_id);

    // Get meeting details
    const pipelineIds = queueItems.map(item => item.id);
    const { data: meetings } = await supabase
      .from("activation_meetings")
      .select(`
        trial_pipeline_id,
        scheduled_start_at,
        scheduled_timezone,
        status,
        attempt_number,
        attendee_name
      `)
      .in("trial_pipeline_id", pipelineIds)
      .order("created_at", { ascending: false });

    // Create lookup maps
    const leadsMap = new Map(leads?.map(l => [l.id, l]) || []);
    const meetingsMap = new Map<string, any>();
    meetings?.forEach(m => {
      // Only keep the most recent meeting per pipeline
      if (!meetingsMap.has(m.trial_pipeline_id)) {
        meetingsMap.set(m.trial_pipeline_id, m);
      }
    });

    // Calculate counts
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let overdueCount = 0;
    let todayCount = 0;

    // Transform data for frontend
    const items = queueItems.map((item) => {
      const lead = leadsMap.get(item.crm_lead_id);
      const meeting = meetingsMap.get(item.id);
      
      const followupDate = item.next_followup_at ? new Date(item.next_followup_at) : null;
      const isOverdue = followupDate && followupDate < todayStart;
      const isToday = followupDate && followupDate >= todayStart && followupDate <= today;

      if (isOverdue) overdueCount++;
      if (isToday) todayCount++;

      // Generate call script hint based on status
      let callScriptHint = "";
      if (item.activation_status === "no_show") {
        const scheduledTime = meeting?.scheduled_start_at 
          ? new Date(meeting.scheduled_start_at).toLocaleDateString() 
          : "recently";
        callScriptHint = `"Hi, I'm calling about the calculator install we had scheduled for ${scheduledTime}. It looks like we missed each other. I'd love to get that rescheduled - do you have 15 minutes this week?"`;
      } else {
        callScriptHint = `"Hi, I'm calling to reschedule your calculator install appointment. When would be a good time this week?"`;
      }

      return {
        id: item.id,
        leadId: item.crm_lead_id,
        companyName: lead?.name || "Unknown",
        phone: lead?.phone || "",
        website: lead?.website || "",
        email: lead?.email || "",
        activationStatus: item.activation_status,
        lastOutcome: item.last_meeting_outcome || "none",
        nextAction: item.next_action || "Reschedule install",
        noShowCount: item.no_show_count || 0,
        rescheduleCount: item.reschedule_count || 0,
        noShowAt: item.no_show_at,
        attemptNumber: meeting?.attempt_number || 1,
        attendeeName: meeting?.attendee_name || null,
        originalScheduledTime: meeting?.scheduled_start_at || null,
        scheduledTimezone: meeting?.scheduled_timezone || null,
        meetingStatus: meeting?.status || null,
        nextFollowupAt: item.next_followup_at,
        isOverdue,
        isToday,
        callScriptHint,
      };
    });

    return NextResponse.json({
      success: true,
      items,
      count: items.length,
      overdueCount,
      todayCount,
    });
  } catch (error: any) {
    console.error("Error in GET /api/pipeline/sdr-queue:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/pipeline/sdr-queue/count
 * Returns just the count for header badge
 */
export async function HEAD(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new NextResponse(null, { status: 401 });
    }

    const now = new Date().toISOString();

    const { count } = await supabase
      .from("trial_pipeline")
      .select("*", { count: "exact", head: true })
      .eq("followup_owner_role", "sdr")
      .in("activation_status", ["no_show", "queued"])
      .eq("credits_remaining", 20)
      .lte("next_followup_at", now);

    return new NextResponse(null, {
      status: 200,
      headers: { "X-Queue-Count": String(count || 0) },
    });
  } catch (error) {
    return new NextResponse(null, { status: 500 });
  }
}


