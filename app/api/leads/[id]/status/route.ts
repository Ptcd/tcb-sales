import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LeadStatus, LostReason, LOST_REASON_OPTIONS } from "@/lib/types";

/**
 * PATCH /api/leads/[id]/status
 * Updates the status of a lead
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: leadId } = await params;
    const { status, nextFollowUpAt, lostReason, lostReasonNotes } = await request.json();

    // Validate status
    const validStatuses: LeadStatus[] = [
      'new', 
      'contacted', 
      'interested', 
      'trial_started',
      'follow_up',
      'closed_won', 
      'closed_lost',
      'not_interested', 
      'converted'
    ];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: "Invalid status value" },
        { status: 400 }
      );
    }

    // Lost reason enforcement: require lost_reason when status is closed_lost
    if (status === 'closed_lost' && !lostReason) {
      return NextResponse.json(
        { error: "lost_reason is required when marking a lead as closed_lost. Please select a reason." },
        { status: 400 }
      );
    }

    // Validate lost_reason value if provided
    if (lostReason && !LOST_REASON_OPTIONS.find(opt => opt.value === lostReason)) {
      return NextResponse.json(
        { error: "Invalid lost_reason value" },
        { status: 400 }
      );
    }

    // Follow-up enforcement: require next_follow_up_at for non-closing statuses
    const CLOSING_STATUSES: LeadStatus[] = ['closed_won', 'closed_lost', 'not_interested'];
    if (!CLOSING_STATUSES.includes(status) && !nextFollowUpAt) {
      return NextResponse.json(
        { error: "next_follow_up_at is required when changing status to a non-closing value. Please set a follow-up date or close the lead." },
        { status: 400 }
      );
    }

    // Get the lead
    const { data: lead, error: leadError } = await supabase
      .from("search_results")
      .select("id, search_history_id, lead_status")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    // Get user's organization for activity creation
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    // RLS will automatically filter by organization - no need to check user_id
    // Build update object
    const updateData: any = {
      lead_status: status,
      last_contacted_at: status === 'contacted' ? new Date().toISOString() : undefined
    };

    // Set next_follow_up_at if provided
    if (nextFollowUpAt) {
      updateData.next_follow_up_at = typeof nextFollowUpAt === "string" 
        ? (nextFollowUpAt.endsWith("Z") || nextFollowUpAt.includes("+") 
          ? nextFollowUpAt 
          : new Date(nextFollowUpAt).toISOString())
        : new Date(nextFollowUpAt).toISOString();
    }

    // Set lost_reason fields if provided
    if (lostReason) {
      updateData.lost_reason = lostReason;
    }
    if (lostReasonNotes !== undefined) {
      updateData.lost_reason_notes = lostReasonNotes || null;
    }

    // Update the lead status
    const { error: updateError } = await supabase
      .from("search_results")
      .update(updateData)
      .eq("id", leadId);

    if (updateError) {
      console.error("Error updating lead status:", updateError);
      return NextResponse.json(
        { error: "Failed to update lead status" },
        { status: 500 }
      );
    }

    // Create an activity record with organization_id
    const { error: activityError } = await supabase
      .from("lead_activities")
      .insert({
        lead_id: leadId,
        user_id: user.id,
        organization_id: profile.organization_id,
        activity_type: "status_change",
        activity_data: { previous_status: lead.lead_status || 'new', new_status: status },
        description: `Status changed to ${status}`,
      });

    if (activityError) {
      console.error("Error creating activity:", activityError);
    }

    return NextResponse.json({
      success: true,
      message: "Lead status updated successfully",
      status,
    });
  } catch (error) {
    console.error("Error in lead status API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

