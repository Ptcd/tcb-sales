import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { inferLeadTimezone } from "@/lib/timezone-inference";

/**
 * GET /api/leads/next
 * Returns the next best lead for the current user to call
 * 
 * Smart Queue Priority:
 * 1. New leads (lead_status = 'new') assigned to this user
 * 2. Follow-ups due TODAY (next_action_at <= today 11:59 PM)
 * 3. "Info Sent" leads - where last call outcome was INTERESTED_INFO_SENT and > 3 days ago
 * 4. Contacted leads needing follow-up
 * 5. Other interested leads
 * 
 * Exclusions:
 * - lead_status IN ('not_interested', 'closed_lost', 'trial_started', 'converted')
 * - do_not_call = true
 * - next_action_at > today (future follow-ups)
 * - Leads where last call was TRIAL_STARTED (they already have a trial)
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

    // Check if dialer mode is requested
    const { searchParams } = new URL(request.url);
    const isDialerMode = searchParams.get("dialer") === "true";
    const mode = searchParams.get("mode"); // "followups" | null

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

    // Allow admins in dialer mode for testing, but normal behavior for regular queue
    if (profile.role === "admin" && !isDialerMode) {
      return NextResponse.json(
        { error: "Next lead feature is for sales reps only" },
        { status: 403 }
      );
    }

    // Get current timestamps for date comparisons
    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const endOfTodayISO = endOfToday.toISOString();

    // Calculate 3 days ago for info sent follow-ups
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threeDaysAgoISO = threeDaysAgo.toISOString();

    // Excluded statuses for all queries
    const excludedStatuses = ["not_interested", "closed_lost", "trial_started", "converted"];

    // Base query conditions
    const baseConditions = {
      organization_id: profile.organization_id,
      assigned_to: user.id,
      do_not_call: false,
    };

    // ===== Priority 1: Follow-ups Due Today =====
    // Leads with next_action_at set and due today or earlier
    // These are scheduled callbacks - show them FIRST before new leads
    const { data: dueFollowUp, error: dueFollowUpError } = await supabase
      .from("search_results")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .eq("assigned_to", user.id)
      .eq("do_not_call", false)
      .not("phone", "is", null)
      .not("lead_status", "in", `(${excludedStatuses.join(",")})`)
      .not("next_action_at", "is", null)
      .lte("next_action_at", endOfTodayISO) // Due today or earlier
      .order("next_action_at", { ascending: true }) // Oldest due first
      .limit(1)
      .single();

    if (dueFollowUpError) {
      console.log("Due follow-up query - no results or error:", dueFollowUpError.code);
    }

    if (dueFollowUp) {
      const queueStats = await getQueueStats(supabase, baseConditions, excludedStatuses, endOfTodayISO);
      const lastCallInfo = await getLastCallInfo(supabase, dueFollowUp.id);
      const campaignInfo = await getCampaignInfo(supabase, dueFollowUp.id);
      return NextResponse.json({
        success: true,
        lead: await transformLead(dueFollowUp, lastCallInfo, campaignInfo),
        priority: "follow_up_due",
        queueStats,
      });
    }

    // ===== Priority 2: New Leads =====
    // Leads that have never been contacted
    const { data: newLead, error: newLeadError } = await supabase
      .from("search_results")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .eq("assigned_to", user.id)
      .eq("lead_status", "new")
      .eq("do_not_call", false)
      .not("phone", "is", null) // Must have phone number
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (newLeadError) {
      console.log("New lead query - no results or error:", newLeadError.code);
    }

    if (newLead) {
      const queueStats = await getQueueStats(supabase, baseConditions, excludedStatuses, endOfTodayISO);
      const lastCallInfo = await getLastCallInfo(supabase, newLead.id);
      const campaignInfo = await getCampaignInfo(supabase, newLead.id);
      return NextResponse.json({
        success: true,
        lead: await transformLead(newLead, lastCallInfo, campaignInfo),
        priority: "new",
        queueStats,
      });
    }

    // ===== Priority 3: "Info Sent" Leads =====
    // Last call was INTERESTED_INFO_SENT > 3 days ago
    // This is stricter: we check the actual last call outcome, not just lead status
    const infoSentLead = await findInfoSentLeadNeedingFollowUp(
      supabase,
      profile.organization_id,
      user.id,
      threeDaysAgoISO,
      endOfTodayISO
    );

    if (infoSentLead) {
      const queueStats = await getQueueStats(supabase, baseConditions, excludedStatuses, endOfTodayISO);
      const lastCallInfo = await getLastCallInfo(supabase, infoSentLead.id);
      const campaignInfo = await getCampaignInfo(supabase, infoSentLead.id);
      return NextResponse.json({
        success: true,
        lead: await transformLead(infoSentLead, lastCallInfo, campaignInfo),
        priority: "info_sent_follow_up",
        queueStats,
      });
    }

    // ===== Priority 4: Contacted Leads Needing Follow-up =====
    // Leads with status "contacted" or "follow_up" without future next_action_at
    const { data: contactedLead, error: contactedLeadError } = await supabase
      .from("search_results")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .eq("assigned_to", user.id)
      .eq("do_not_call", false)
      .not("phone", "is", null)
      .in("lead_status", ["contacted", "follow_up"])
      .or("next_action_at.is.null,next_action_at.lte." + endOfTodayISO)
      .order("last_contacted_at", { ascending: true, nullsFirst: true })
      .limit(1)
      .single();

    if (contactedLeadError) {
      console.log("Contacted lead query - no results or error:", contactedLeadError.code);
    }

    if (contactedLead) {
      const queueStats = await getQueueStats(supabase, baseConditions, excludedStatuses, endOfTodayISO);
      const lastCallInfo = await getLastCallInfo(supabase, contactedLead.id);
      const campaignInfo = await getCampaignInfo(supabase, contactedLead.id);
      return NextResponse.json({
        success: true,
        lead: await transformLead(contactedLead, lastCallInfo, campaignInfo),
        priority: "follow_up",
        queueStats,
      });
    }

    // ===== Priority 5: Interested Leads (that aren't already trial_started) =====
    const { data: interestedLead, error: interestedLeadError } = await supabase
      .from("search_results")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .eq("assigned_to", user.id)
      .eq("lead_status", "interested")
      .eq("do_not_call", false)
      .not("phone", "is", null)
      .or("next_action_at.is.null,next_action_at.lte." + endOfTodayISO)
      .order("last_contacted_at", { ascending: true })
      .limit(1)
      .single();

    if (interestedLeadError) {
      console.log("Interested lead query - no results or error:", interestedLeadError.code);
    }

    if (interestedLead) {
      // Double-check this lead's last call wasn't TRIAL_STARTED
      const lastCallInfo = await getLastCallInfo(supabase, interestedLead.id);
      if (lastCallInfo?.outcome_code !== "TRIAL_STARTED") {
        const queueStats = await getQueueStats(supabase, baseConditions, excludedStatuses, endOfTodayISO);
        const campaignInfo = await getCampaignInfo(supabase, interestedLead.id);
        return NextResponse.json({
          success: true,
          lead: await transformLead(interestedLead, lastCallInfo, campaignInfo),
          priority: "interested",
          queueStats,
        });
      }
    }

    // No leads available
    const queueStats = await getQueueStats(supabase, baseConditions, excludedStatuses, endOfTodayISO);
    return NextResponse.json({
      success: true,
      lead: null,
      message: "No leads available. All your leads have been processed or have future follow-ups scheduled.",
      queueStats,
    });
  } catch (error) {
    console.error("Error in GET /api/leads/next:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

/**
 * Find leads where last call was INTERESTED_INFO_SENT and it was > 3 days ago
 * This is more accurate than just checking lead_status = "interested"
 */
async function findInfoSentLeadNeedingFollowUp(
  supabase: any,
  organizationId: string,
  userId: string,
  threeDaysAgoISO: string,
  endOfTodayISO: string
) {
  try {
    // Step 1: Get lead IDs where the most recent call was INTERESTED_INFO_SENT
    // and that call was made more than 3 days ago
    const { data: callsWithInfoSent } = await supabase
      .from("calls")
      .select("lead_id, initiated_at, outcome_code")
      .eq("user_id", userId)
      .eq("outcome_code", "INTERESTED_INFO_SENT")
      .lte("initiated_at", threeDaysAgoISO)
      .order("initiated_at", { ascending: false });

    if (!callsWithInfoSent || callsWithInfoSent.length === 0) {
      return null;
    }

    // Get unique lead IDs (taking the most recent INTERESTED_INFO_SENT call per lead)
    const leadIdMap = new Map<string, string>();
    for (const call of callsWithInfoSent) {
      if (!leadIdMap.has(call.lead_id)) {
        leadIdMap.set(call.lead_id, call.initiated_at);
      }
    }
    const candidateLeadIds = Array.from(leadIdMap.keys());

    if (candidateLeadIds.length === 0) {
      return null;
    }

    // Step 2: For each candidate, verify this was actually their LAST call
    // (they haven't had a more recent call with a different outcome)
    const validLeadIds: string[] = [];
    
    for (const leadId of candidateLeadIds) {
      const { data: lastCall } = await supabase
        .from("calls")
        .select("outcome_code, initiated_at")
        .eq("lead_id", leadId)
        .order("initiated_at", { ascending: false })
        .limit(1)
        .single();

      // Only include if the actual last call was INTERESTED_INFO_SENT
      // and it was more than 3 days ago
      if (
        lastCall &&
        lastCall.outcome_code === "INTERESTED_INFO_SENT" &&
        new Date(lastCall.initiated_at) <= new Date(threeDaysAgoISO)
      ) {
        validLeadIds.push(leadId);
      }
    }

    if (validLeadIds.length === 0) {
      return null;
    }

    // Step 3: Get the lead details for valid leads
    const { data: lead } = await supabase
      .from("search_results")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("assigned_to", userId)
      .eq("do_not_call", false)
      .not("phone", "is", null)
      .in("id", validLeadIds)
      .or("next_action_at.is.null,next_action_at.lte." + endOfTodayISO) // No future follow-up
      .not("lead_status", "in", "(not_interested,closed_lost,trial_started,converted)")
      .order("last_contacted_at", { ascending: true }) // Oldest first
      .limit(1)
      .single();

    return lead || null;
  } catch (error) {
    console.error("Error finding info sent leads:", error);
    return null;
  }
}

/**
 * Get the last call info for a lead
 */
async function getLastCallInfo(supabase: any, leadId: string) {
  try {
    const { data: lastCall } = await supabase
      .from("calls")
      .select("outcome, outcome_code, initiated_at, duration, notes")
      .eq("lead_id", leadId)
      .order("initiated_at", { ascending: false })
      .limit(1)
      .single();

    return lastCall || null;
  } catch (error) {
    return null;
  }
}

/**
 * Get campaign info for a lead via campaign_leads table
 */
async function getCampaignInfo(supabase: any, leadId: string) {
  try {
    const { data: campaignLead } = await supabase
      .from("campaign_leads")
      .select("campaign_id, campaigns(id, name)")
      .eq("lead_id", leadId)
      .eq("status", "claimed")
      .limit(1)
      .single();

    if (campaignLead?.campaigns) {
      return {
        id: (campaignLead.campaigns as any).id,
        name: (campaignLead.campaigns as any).name,
      };
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Transform lead data for frontend
async function transformLead(lead: any, lastCallInfo?: any, campaignInfo?: any) {
  // Auto-infer timezone if missing
  if (!lead.lead_timezone && (lead.latitude || lead.phone)) {
    const { timezone, source } = inferLeadTimezone(lead.latitude, lead.longitude, lead.phone);
    if (timezone) {
      // Update database
      const serviceSupabase = createServiceRoleClient();
      await serviceSupabase
        .from("search_results")
        .update({ lead_timezone: timezone, timezone_source: source })
        .eq("id", lead.id);
      lead.lead_timezone = timezone;
      lead.timezone_source = source;
    }
  }
  
  return {
    ...lead,
    campaign_id: campaignInfo?.id || lead.campaign_id,
    campaign_name: campaignInfo?.name || lead.campaign_name,
    // Include last call info for display
    last_call_outcome: lastCallInfo?.outcome_code || lastCallInfo?.outcome,
    last_call_date: lastCallInfo?.initiated_at,
    call_count: lead.call_count,
  };
}

// Get queue statistics
async function getQueueStats(
  supabase: any,
  baseConditions: any,
  excludedStatuses: string[],
  endOfTodayISO: string
) {
  try {
    // Count new leads
    const { count: newCount } = await supabase
      .from("search_results")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", baseConditions.organization_id)
      .eq("assigned_to", baseConditions.assigned_to)
      .eq("lead_status", "new")
      .eq("do_not_call", false)
      .not("phone", "is", null);

    // Count follow-ups due
    const { count: followUpCount } = await supabase
      .from("search_results")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", baseConditions.organization_id)
      .eq("assigned_to", baseConditions.assigned_to)
      .eq("do_not_call", false)
      .not("phone", "is", null)
      .not("lead_status", "in", `(${excludedStatuses.join(",")})`)
      .not("lead_status", "eq", "new")
      .or("next_action_at.is.null,next_action_at.lte." + endOfTodayISO);

    return {
      total: (newCount || 0) + (followUpCount || 0),
      new: newCount || 0,
      followUp: followUpCount || 0,
    };
  } catch (error) {
    console.error("Error getting queue stats:", error);
    return { total: 0, new: 0, followUp: 0 };
  }
}
