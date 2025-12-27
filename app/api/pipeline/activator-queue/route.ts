import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/pipeline/activator-queue
 * 
 * Activator Queue: "Blocked Installs" + "Install Marked Not Proven"
 * 
 * Section 1: Blocked Installs
 * - followup_owner_role = 'activator'
 * - activation_status = 'blocked'
 * - credits_remaining = 20
 * 
 * Section 2: Install Marked, Not Proven (NEW)
 * - last_meeting_outcome = 'installed_proven'
 * - credits_remaining = 20 (still not proven!)
 * - completed_at <= now - 30 minutes
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
      .select("organization_id, is_activator, role")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Only activators and admins can access
    if (!profile.is_activator && profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = new Date();
    const nowISO = now.toISOString();
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

    // Section 1: Blocked Installs
    const { data: blockedItems, error: blockedError } = await supabase
      .from("trial_pipeline")
      .select(`
        id,
        crm_lead_id,
        next_followup_at,
        block_reason,
        block_owner,
        next_step,
        followup_reason,
        last_meeting_outcome,
        activation_status,
        reschedule_count
      `)
      .eq("followup_owner_role", "activator")
      .eq("activation_status", "blocked")
      .eq("credits_remaining", 20)
      .lte("next_followup_at", nowISO)
      .order("next_followup_at", { ascending: true });

    if (blockedError) {
      console.error("Error fetching blocked items:", blockedError);
    }

    // Section 2: Install Marked Not Proven
    // Get meetings marked installed but credits still 20 after 30 min
    const { data: unprovenMeetings, error: unprovenError } = await supabase
      .from("activation_meetings")
      .select(`
        id,
        trial_pipeline_id,
        completed_at,
        completed_by_user_id,
        install_url,
        proof_method,
        attendee_name,
        trial_pipeline:trial_pipeline_id (
          id,
          crm_lead_id,
          credits_remaining,
          last_meeting_outcome
        )
      `)
      .eq("status", "completed")
      .lte("completed_at", thirtyMinutesAgo)
      .not("install_url", "is", null);

    if (unprovenError) {
      console.error("Error fetching unproven meetings:", unprovenError);
    }

    // Filter unproven to only those where credits still = 20
    const unprovenItems = (unprovenMeetings || []).filter((m: any) => {
      const pipeline = m.trial_pipeline;
      return pipeline && 
             pipeline.credits_remaining === 20 && 
             pipeline.last_meeting_outcome === 'installed_proven';
    });

    // Get all lead IDs
    const blockedLeadIds = (blockedItems || []).map(item => item.crm_lead_id).filter(Boolean);
    const unprovenLeadIds = unprovenItems.map((m: any) => m.trial_pipeline?.crm_lead_id).filter(Boolean);
    const allLeadIds = [...new Set([...blockedLeadIds, ...unprovenLeadIds])];

    // Fetch lead details
    const { data: leads } = await supabase
      .from("search_results")
      .select("id, name, website, phone, email")
      .in("id", allLeadIds)
      .eq("organization_id", profile.organization_id);

    // Get meeting details for blocked items
    const blockedPipelineIds = (blockedItems || []).map(item => item.id);
    const { data: meetings } = await supabase
      .from("activation_meetings")
      .select(`
        trial_pipeline_id,
        attendee_name,
        attendee_role,
        web_person_email,
        access_method,
        attempt_number,
        phone
      `)
      .in("trial_pipeline_id", blockedPipelineIds)
      .order("created_at", { ascending: false });

    // Create lookup maps
    const leadsMap = new Map(leads?.map(l => [l.id, l]) || []);
    const meetingsMap = new Map<string, any>();
    meetings?.forEach(m => {
      if (!meetingsMap.has(m.trial_pipeline_id)) {
        meetingsMap.set(m.trial_pipeline_id, m);
      }
    });

    // Transform blocked items
    const blockedList = (blockedItems || []).map((item) => {
      const lead = leadsMap.get(item.crm_lead_id);
      const meeting = meetingsMap.get(item.id);

      return {
        id: item.id,
        type: 'blocked' as const,
        leadId: item.crm_lead_id,
        companyName: lead?.name || "Unknown",
        websiteUrl: lead?.website || "",
        phone: lead?.phone || meeting?.phone || "",
        email: lead?.email || "",
        blockReason: item.block_reason || item.followup_reason || "Install blocked",
        blockOwner: item.block_owner || "unknown",
        nextStep: item.next_step || "unknown",
        webPersonName: meeting?.attendee_name || null,
        webPersonRole: meeting?.attendee_role || null,
        webPersonEmail: meeting?.web_person_email || null,
        accessMethod: meeting?.access_method || null,
        attemptNumber: meeting?.attempt_number || 1,
        rescheduleCount: item.reschedule_count || 0,
        nextFollowupAt: item.next_followup_at,
        lastOutcome: item.last_meeting_outcome,
      };
    });

    // Transform unproven items
    const unprovenList = unprovenItems.map((m: any) => {
      const pipeline = m.trial_pipeline;
      const lead = leadsMap.get(pipeline?.crm_lead_id);

      return {
        id: pipeline?.id,
        type: 'unproven' as const,
        meetingId: m.id,
        leadId: pipeline?.crm_lead_id,
        companyName: lead?.name || "Unknown",
        websiteUrl: lead?.website || "",
        phone: lead?.phone || "",
        email: lead?.email || "",
        installUrl: m.install_url,
        proofMethod: m.proof_method,
        completedAt: m.completed_at,
        attendeeName: m.attendee_name,
        creditsRemaining: pipeline?.credits_remaining,
        warningMessage: "Marked as installed but credits haven't decremented. Verify installation.",
      };
    });

    // Calculate counts
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let overdueCount = 0;
    let todayCount = 0;

    blockedList.forEach(item => {
      const followupDate = item.nextFollowupAt ? new Date(item.nextFollowupAt) : null;
      if (followupDate && followupDate < todayStart) overdueCount++;
      else if (followupDate && followupDate <= today) todayCount++;
    });

    return NextResponse.json({
      success: true,
      blocked: blockedList,
      unproven: unprovenList,
      counts: {
        blocked: blockedList.length,
        unproven: unprovenList.length,
        overdue: overdueCount,
        today: todayCount,
        total: blockedList.length + unprovenList.length,
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/pipeline/activator-queue:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


