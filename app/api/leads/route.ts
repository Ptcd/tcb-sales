import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/leads
 * Fetches all leads for the organization (both from searches and manual)
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

    // Get user's profile and role
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    const isAdmin = profile.role === "admin";

    // Get URL parameters for filtering/sorting
    const { searchParams } = new URL(request.url);
    const source = searchParams.get("source"); // 'manual', 'google_maps', or 'all'
    const status = searchParams.get("status"); // lead status filter
    const assignedTo = searchParams.get("assigned_to"); // Filter by assigned user (admin only)
    const assigned = searchParams.get("assigned"); // 'me' for current user's assigned leads
    const dueToday = searchParams.get("due_today") === "true";
    const dueWithinDays = parseInt(searchParams.get("due_within_days") || "0"); // upcoming window in days
    const tzOffsetMinutes = parseInt(searchParams.get("tzOffset") || "0"); // minutes offset from UTC
    const myTrials = searchParams.get("my_trials") === "true";
    // Default to a very high limit to fetch all leads (client-side pagination handles display)
    const limit = parseInt(searchParams.get("limit") || "10000");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Build query - explicitly filter by organization for security
    let query = supabase
      .from("search_results")
      .select("*", { count: "exact" })
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Role-based filtering: Sub-users ONLY see their assigned leads
    if (!isAdmin) {
      // Sub-users ONLY see their own assigned leads
      query = query.eq("assigned_to", user.id);
    } else if (assigned === "me") {
      // Admin filtering by "me" - show their assigned leads
      query = query.eq("assigned_to", user.id);
    } else if (assignedTo) {
      // Admin can filter by specific user
      if (assignedTo === "unassigned") {
        query = query.is("assigned_to", null);
      } else {
        query = query.eq("assigned_to", assignedTo);
      }
    }

    // Apply filters
    if (source && source !== "all") {
      query = query.eq("lead_source", source);
    }

    if (status) {
      query = query.eq("lead_status", status);
    }

    // My Trials filtering (JCC campaign trials owned by user)
    if (myTrials) {
      // Step 1: Get JCC campaign ID
      const { data: jccCampaign } = await supabase
        .from("campaigns")
        .select("id")
        .eq("name", "Junk Car Calculator")
        .single();

      if (!jccCampaign) {
        return NextResponse.json({ 
          success: true,
          leads: [], 
          myTrialsCount: 0,
          count: 0,
          dueTodayCount: 0,
          upcomingCount: 0,
          limit,
          offset,
        });
      }

      // Step 2: Get lead IDs in JCC campaign owned by this user
      // Use owner_sdr_id from search_results, not claimed_by from campaign_leads
      const { data: campaignLeadIds } = await supabase
        .from("campaign_leads")
        .select("lead_id")
        .eq("campaign_id", jccCampaign.id);

      const leadIds = (campaignLeadIds || []).map(cl => cl.lead_id);
      
      if (leadIds.length === 0) {
        return NextResponse.json({ 
          success: true,
          leads: [], 
          myTrialsCount: 0,
          count: 0,
          dueTodayCount: 0,
          upcomingCount: 0,
          limit,
          offset,
        });
      }

      // Step 3: Filter to trial badges + converted within 7 days
      const TRIAL_BADGES = [
        'trial_awaiting_activation', 'trial_activated', 'trial_configured',
        'trial_embed_copied', 'trial_live_first_lead', 'trial_stalled'
      ];
      
      query = query
        .in("id", leadIds)
        .eq("owner_sdr_id", user.id)
        .in("badge_key", [...TRIAL_BADGES, 'converted_recent']);
    }

    // Follow-up filtering (due today or upcoming)
    let dueTodayCount = 0;
    let upcomingCount = 0;
    const todayStart = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), 0, 0, 0)
    );
    const todayEnd = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), 23, 59, 59)
    );
    if (!Number.isNaN(tzOffsetMinutes) && tzOffsetMinutes !== 0) {
      todayStart.setMinutes(todayStart.getMinutes() + tzOffsetMinutes);
      todayEnd.setMinutes(todayEnd.getMinutes() + tzOffsetMinutes);
    }

    // For "upcoming", we compare against absolute time instants - no timezone adjustment needed
    const upcomingWindowDays = !Number.isNaN(dueWithinDays) && dueWithinDays > 0 ? dueWithinDays : 2;
    const upcomingStart = new Date();
    const upcomingEnd = new Date(upcomingStart.getTime() + upcomingWindowDays * 24 * 60 * 60 * 1000);

    if (dueToday) {
      query = query
        .not("next_action_at", "is", null)
        .gte("next_action_at", todayStart.toISOString())
        .lte("next_action_at", todayEnd.toISOString())
        .order("next_action_at", { ascending: true });
    } else if (!Number.isNaN(dueWithinDays) && dueWithinDays > 0) {
      query = query
        .not("next_action_at", "is", null)
        .gte("next_action_at", upcomingStart.toISOString())
        .lte("next_action_at", upcomingEnd.toISOString())
        .order("next_action_at", { ascending: true });
    }

    // Always compute counts so the UI can display badges
    // Apply same role-based filtering to counts as to the main query
    let dueTodayQuery = supabase
      .from("search_results")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", profile.organization_id)
      .not("next_action_at", "is", null)
      .gte("next_action_at", todayStart.toISOString())
      .lte("next_action_at", todayEnd.toISOString());
    
    let upcomingQuery = supabase
      .from("search_results")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", profile.organization_id)
      .not("next_action_at", "is", null)
      .gte("next_action_at", upcomingStart.toISOString())
      .lte("next_action_at", upcomingEnd.toISOString());

    // Non-admin users only see counts for their assigned leads
    if (!isAdmin) {
      dueTodayQuery = dueTodayQuery.eq("assigned_to", user.id);
      upcomingQuery = upcomingQuery.eq("assigned_to", user.id);
    }

    const { count: dueCount } = await dueTodayQuery;
    dueTodayCount = dueCount || 0;

    const { count: upCount } = await upcomingQuery;
    upcomingCount = upCount || 0;

    const { data: leads, error, count } = await query;

    if (error) {
      console.error("Error fetching leads:", error);
      return NextResponse.json(
        { error: "Failed to fetch leads" },
        { status: 500 }
      );
    }

    // For my_trials view, fetch trial_pipeline data and apply filters
    let leadsWithTrialData = leads || [];
    if (myTrials && leads && leads.length > 0) {
      const CONVERTED_WINDOW_DAYS = 7;
      const convertedCutoff = new Date();
      convertedCutoff.setDate(convertedCutoff.getDate() - CONVERTED_WINDOW_DAYS);

      const leadIds = leads.map(l => l.id);
      const { data: trialData } = await supabase
        .from("trial_pipeline")
        .select("*")
        .in("crm_lead_id", leadIds);

      const trialMap = new Map(trialData?.map(t => [t.crm_lead_id, t]) || []);
      
      leadsWithTrialData = leads
        .map(lead => ({
          ...lead,
          trial_pipeline: trialMap.get(lead.id) || null,
        }))
        // Filter out converted_recent older than 7 days
        .filter(lead => {
          if (lead.badge_key === 'converted_recent') {
            const tp = lead.trial_pipeline;
            if (!tp?.converted_at) return false;
            return new Date(tp.converted_at) > convertedCutoff;
          }
          return true;
        })
        // Sort: stalled first, then awaiting, then others by age, converted last
        .sort((a, b) => {
          const priority = (badge: string) => {
            if (badge === 'trial_stalled') return 1;
            if (badge === 'trial_awaiting_activation') return 2;
            if (badge === 'converted_recent') return 99;
            return 3;
          };
          const pDiff = priority(a.badge_key) - priority(b.badge_key);
          if (pDiff !== 0) return pDiff;
          // Within same priority, older trials first
          const aStart = a.trial_pipeline?.trial_started_at || '9999';
          const bStart = b.trial_pipeline?.trial_started_at || '9999';
          return aStart.localeCompare(bStart);
        });
    }

    return NextResponse.json({
      success: true,
      leads: myTrials ? leadsWithTrialData : (leads || []),
      count: count || 0,
      dueTodayCount,
      upcomingCount,
      myTrialsCount: myTrials ? leadsWithTrialData.length : undefined,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error in GET /api/leads:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

