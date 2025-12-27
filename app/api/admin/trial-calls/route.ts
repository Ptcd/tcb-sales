import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/trial-calls
 * 
 * Get calls that resulted in trials (outcome_code = 'TRIAL_STARTED')
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

    // Fetch all trial calls with pagination to handle >1000 records
    // Fetch calls first without joins to avoid foreign key join issues with pagination
    const allTrialCalls: any[] = [];
    const pageSize = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      // Build query for trial-resulted calls with pagination (without joins first)
      let query = supabase
        .from("calls")
        .select("id, initiated_at, duration, recording_url, conversion_quality_tag, user_id, lead_id, campaign_id")
        .eq("organization_id", profile.organization_id)
        .eq("outcome_code", "TRIAL_STARTED")
        .gte("initiated_at", startIso)
        .lte("initiated_at", endIso)
        .range(offset, offset + pageSize - 1)
        .order("initiated_at", { ascending: false });

      // Apply filters
      if (sdrId) {
        query = query.eq("user_id", sdrId);
      }

      if (campaignId) {
        query = query.eq("campaign_id", campaignId);
      }

      if (qualityTag) {
        query = query.eq("conversion_quality_tag", qualityTag);
      }

      const { data: calls, error: callsError } = await query;

      if (callsError) {
        console.error("Error fetching trial calls:", callsError);
        return NextResponse.json(
          { error: "Failed to fetch trial calls", details: callsError.message },
          { status: 500 }
        );
      }

      if (calls && calls.length > 0) {
        allTrialCalls.push(...calls);
        // If we got fewer than pageSize, we've reached the end
        hasMore = calls.length === pageSize;
        offset += pageSize;
      } else {
        hasMore = false;
      }
    }

    // Now fetch related data for all calls
    const leadIds = [...new Set(allTrialCalls.map(c => c.lead_id).filter(Boolean))];
    const userIds = [...new Set(allTrialCalls.map(c => c.user_id).filter(Boolean))];
    const campaignIds = [...new Set(allTrialCalls.map(c => c.campaign_id).filter(Boolean))];

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

    // Transform data for frontend with joined data
    const trialCalls = (allTrialCalls || []).map((call: any) => {
      const lead = call.lead_id ? leadsMap.get(call.lead_id) : null;
      const user = call.user_id ? usersMap.get(call.user_id) : null;
      const campaign = call.campaign_id ? campaignsMap.get(call.campaign_id) : null;

      return {
        id: call.id,
        date: call.initiated_at,
        sdrId: call.user_id,
        sdrName: user?.full_name || user?.email || "Unknown",
        leadId: call.lead_id,
        leadName: lead?.name || "Unknown Lead",
        leadPhone: lead?.phone || "",
        duration: call.duration || 0,
        hasRecording: !!call.recording_url,
        recordingUrl: call.recording_url,
        qualityTag: call.conversion_quality_tag || "unknown",
        campaignName: campaign?.name || "No Campaign",
      };
    });

    return NextResponse.json({
      success: true,
      calls: trialCalls,
      count: trialCalls.length,
    });
  } catch (error: any) {
    console.error("Error in GET /api/admin/trial-calls:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

