import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/install-calls
 * 
 * Get calls that led to scheduled install appointments
 * Admin only
 * 
 * Query params:
 * - start_date: YYYY-MM-DD
 * - end_date: YYYY-MM-DD
 * - sdr_id: optional SDR filter
 * - campaign_id: optional campaign filter
 * - quality_tag: optional quality tag filter
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify admin role
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (profile.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    
    // Default to last 30 days
    const defaultStartDate = new Date();
    defaultStartDate.setDate(defaultStartDate.getDate() - 30);
    
    const startDate = searchParams.get("start_date") || defaultStartDate.toISOString().split("T")[0];
    const endDate = searchParams.get("end_date") || new Date().toISOString().split("T")[0];
    const sdrId = searchParams.get("sdr_id");
    const campaignId = searchParams.get("campaign_id");
    const qualityTag = searchParams.get("quality_tag");

    const startIso = `${startDate}T00:00:00.000Z`;
    const endIso = `${endDate}T23:59:59.999Z`;

    // Step 1: Get activation_meetings created in date range
    let meetingsQuery = supabase
      .from("activation_meetings")
      .select("id, created_at, scheduled_start_at, status, scheduled_by_sdr_user_id, trial_pipeline_id")
      .eq("organization_id", profile.organization_id)
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: false });

    if (sdrId) {
      meetingsQuery = meetingsQuery.eq("scheduled_by_sdr_user_id", sdrId);
    }

    const { data: meetings, error: meetingsError } = await meetingsQuery;

    if (meetingsError) {
      console.error("Error fetching activation meetings:", meetingsError);
      return NextResponse.json(
        { error: "Failed to fetch activation meetings", details: meetingsError.message },
        { status: 500 }
      );
    }

    if (!meetings || meetings.length === 0) {
      return NextResponse.json({
        success: true,
        calls: [],
        count: 0,
      });
    }

    // Step 2: Get trial_pipeline records to find lead_ids
    const pipelineIds = [...new Set(meetings.map(m => m.trial_pipeline_id).filter(Boolean))];
    const { data: pipelines } = pipelineIds.length > 0 ? await supabase
      .from("trial_pipeline")
      .select("id, crm_lead_id, owner_sdr_id")
      .in("id", pipelineIds) : { data: [] };

    const pipelineMap = new Map((pipelines || []).map(p => [p.id, p]));

    // Step 3: For each meeting, find the last call to that lead by the SDR before meeting.created_at
    const installCalls: any[] = [];

    for (const meeting of meetings) {
      const pipeline = meeting.trial_pipeline_id ? pipelineMap.get(meeting.trial_pipeline_id) : null;
      if (!pipeline || !pipeline.crm_lead_id || !meeting.scheduled_by_sdr_user_id) {
        continue;
      }

      // Find the last call to this lead by this SDR before the meeting was created
      let callQuery = supabase
        .from("calls")
        .select("id, initiated_at, duration, recording_url, conversion_quality_tag, user_id, lead_id, campaign_id")
        .eq("organization_id", profile.organization_id)
        .eq("lead_id", pipeline.crm_lead_id)
        .eq("user_id", meeting.scheduled_by_sdr_user_id)
        .lt("initiated_at", meeting.created_at)
        .gt("duration", 10)  // Only actual conversations, not failed dial attempts
        .order("initiated_at", { ascending: false })
        .limit(1);

      if (campaignId) {
        callQuery = callQuery.eq("campaign_id", campaignId);
      }

      if (qualityTag) {
        callQuery = callQuery.eq("conversion_quality_tag", qualityTag);
      }

      const { data: calls, error: callError } = await callQuery;

      if (callError) {
        console.error(`Error fetching call for meeting ${meeting.id}:`, callError);
        continue;
      }

      if (calls && calls.length > 0) {
        const call = calls[0];
        installCalls.push({
          call,
          meeting,
          pipeline,
        });
      }
    }

    // Step 4: Fetch related data for all calls
    const leadIds = [...new Set(installCalls.map(ic => ic.pipeline.crm_lead_id).filter(Boolean))];
    const userIds = [...new Set(installCalls.map(ic => ic.call.user_id).filter(Boolean))];
    const campaignIds = [...new Set(installCalls.map(ic => ic.call.campaign_id).filter(Boolean))];

    // Fetch leads
    const { data: leads } = leadIds.length > 0 ? await supabase
      .from("search_results")
      .select("id, name, phone")
      .in("id", leadIds) : { data: [] };

    // Fetch user profiles
    const { data: users } = userIds.length > 0 ? await supabase
      .from("user_profiles")
      .select("id, full_name, email")
      .in("id", userIds) : { data: [] };

    // Fetch campaigns
    const { data: campaigns } = campaignIds.length > 0 ? await supabase
      .from("campaigns")
      .select("id, name")
      .in("id", campaignIds) : { data: [] };

    // Create lookup maps
    const leadsMap = new Map((leads || []).map(l => [l.id, l]));
    const usersMap = new Map((users || []).map(u => [u.id, u]));
    const campaignsMap = new Map((campaigns || []).map(c => [c.id, c]));

    // Transform data for frontend
    const formattedCalls = installCalls.map(({ call, meeting, pipeline }) => {
      const lead = pipeline.crm_lead_id ? leadsMap.get(pipeline.crm_lead_id) : null;
      const user = call.user_id ? usersMap.get(call.user_id) : null;
      const campaign = call.campaign_id ? campaignsMap.get(call.campaign_id) : null;

      return {
        id: call.id,
        date: call.initiated_at,
        sdrId: call.user_id,
        sdrName: user?.full_name || user?.email || "Unknown",
        leadId: pipeline.crm_lead_id,
        leadName: lead?.name || "Unknown Lead",
        leadPhone: lead?.phone || "",
        duration: call.duration || 0,
        hasRecording: !!call.recording_url,
        recordingUrl: call.recording_url,
        qualityTag: call.conversion_quality_tag || "unknown",
        campaignName: campaign?.name || "No Campaign",
        meetingId: meeting.id,
        meetingDate: meeting.scheduled_start_at,
        meetingStatus: meeting.status,
      };
    });

    return NextResponse.json({
      success: true,
      calls: formattedCalls,
      count: formattedCalls.length,
    });
  } catch (error: any) {
    console.error("Error in GET /api/admin/install-calls:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

