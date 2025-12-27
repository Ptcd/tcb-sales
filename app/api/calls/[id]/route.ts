import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { buildPhoneOrFilter, generatePhoneCandidates } from "@/lib/phoneUtils";
import { CallOutcome, CallOutcomeCode, LostReason, LOST_REASON_OPTIONS } from "@/lib/types";
import { updateTrialPipelineOnContact } from "@/lib/activator-helpers";

/**
 * Auto-derive lead status from call outcome
 * Used as fallback if leadStatus not explicitly provided
 */
function getLeadStatusFromOutcome(outcome: CallOutcome | string): string | null {
  switch (outcome) {
    case "interested": return "interested";
    case "callback_requested": return "follow_up";
    case "not_interested": return "not_interested";
    case "no_answer": return "contacted";
    case "busy": return "contacted";
    case "wrong_number": return "closed_lost";
    case "do_not_call": return "closed_lost";
    default: return null;
  }
}

/**
 * Auto-derive lead status from outcome code (new enhanced tracking)
 */
function getLeadStatusFromOutcomeCode(code: CallOutcomeCode | string): string | null {
  switch (code) {
    case "INTERESTED_INFO_SENT": return "interested";
    case "TRIAL_STARTED": return "trial_started";
    case "CALLBACK_SCHEDULED": return "follow_up";
    case "NOT_INTERESTED": return "not_interested";
    case "NO_ANSWER": return "contacted";
    case "BUSY": return "contacted";
    case "WRONG_NUMBER": return "closed_lost";
    default: return null;
  }
}

/**
 * PATCH /api/calls/[id]
 * Update a call record with outcome, notes, and callback date
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const supabaseService = createServiceRoleClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { 
      outcome, 
      outcomeCode,
      notes, 
      callbackDate, 
      leadStatus, 
      nextActionAt, 
      nextActionNote,
      // CTA tracking fields
      ctaAttempted,
      ctaResult,
      ctaSentViaSms,
      ctaSentViaEmail,
      // Badge system fields
      badgeKey,
      doNotContact,
      nextFollowUpAt,
      // Lost reason fields
      lostReason,
      lostReasonNotes,
    } = body;

    // Get user's organization and role
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

    // Get the call to verify ownership
    const { data: call, error: callError } = await supabase
      .from("calls")
      .select("id, user_id, organization_id, lead_id, phone_number")
      .eq("id", id)
      .single();

    if (callError || !call) {
      return NextResponse.json(
        { error: "Call not found" },
        { status: 404 }
      );
    }

    // If call doesn't have a lead_id but has a phone_number, try to find the lead (service role to bypass RLS)
    let effectiveLeadId = call.lead_id;
    console.log(`PATCH call ${id}: initial lead_id=${effectiveLeadId}, phone=${call.phone_number}`);
    
    if (!effectiveLeadId && call.phone_number) {
      const candidates = generatePhoneCandidates(call.phone_number);
      const orFilter = buildPhoneOrFilter(candidates);
      console.log(`PATCH call ${id}: Looking up lead by phone candidates:`, candidates);
      
      const { data: foundLead, error: leadErr } = await supabaseService
        .from("search_results")
        .select("id, name, phone")
        .eq("organization_id", profile.organization_id)
        .or(orFilter)
        .limit(1)
        .single();
      
      if (foundLead?.id) {
        effectiveLeadId = foundLead.id;
        console.log(`PATCH call ${id}: Found lead by phone - id=${foundLead.id}, name=${foundLead.name}`);
        // Update the call with the found lead_id
        const { error: updateLeadIdErr } = await supabaseService
          .from("calls")
          .update({ lead_id: foundLead.id })
          .eq("id", id);
        if (updateLeadIdErr) {
          console.error(`PATCH call ${id}: Failed to update call with lead_id:`, updateLeadIdErr);
        } else {
          console.log(`PATCH call ${id}: Successfully associated call with lead ${foundLead.id}`);
        }
      } else {
        console.log(`PATCH call ${id}: No lead found for phone ${call.phone_number}`, leadErr ? `Error: ${leadErr.message}` : '');
      }
    }

    // Verify ownership: user must own the call OR be an admin in the same org
    const isAdmin = profile.role === "admin";
    if (!isAdmin && call.user_id !== user.id) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    // Verify organization match
    if (call.organization_id !== profile.organization_id) {
      return NextResponse.json(
        { error: "Call not found" },
        { status: 404 }
      );
    }

    // Build update object
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (outcome) {
      updateData.outcome = outcome;
    }

    // Enhanced outcome code for detailed reporting
    if (outcomeCode) {
      updateData.outcome_code = outcomeCode;
    }

    if (notes !== undefined) {
      updateData.notes = notes || null;
    }

    if (callbackDate) {
      updateData.callback_date = new Date(callbackDate).toISOString();
      // If callback is set, mark status appropriately
      if (!updateData.status) {
        updateData.status = "completed";
      }
    } else if (callbackDate === null) {
      // Explicitly clear callback date
      updateData.callback_date = null;
    }

    // CTA tracking fields
    if (ctaAttempted !== undefined) {
      updateData.cta_attempted = ctaAttempted;
    }
    if (ctaResult) {
      updateData.cta_result = ctaResult;
    }
    if (ctaSentViaSms !== undefined) {
      updateData.cta_sent_via_sms = ctaSentViaSms;
    }
    if (ctaSentViaEmail !== undefined) {
      updateData.cta_sent_via_email = ctaSentViaEmail;
    }

    // Update the call
    const { data: updatedCall, error: updateError } = await supabase
      .from("calls")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating call:", updateError);
      return NextResponse.json(
        { error: "Failed to update call" },
        { status: 500 }
      );
    }

    // Auto-derive lead status from outcome if not explicitly provided
    // Prefer outcomeCode over outcome for more accurate status
    const effectiveLeadStatus = leadStatus 
      || (outcomeCode ? getLeadStatusFromOutcomeCode(outcomeCode) : null)
      || (outcome ? getLeadStatusFromOutcome(outcome) : null);

    // Lost reason enforcement: require lost_reason when status is closed_lost
    if (effectiveLeadStatus === 'closed_lost' && !lostReason) {
      return NextResponse.json(
        { error: "lost_reason is required when call outcome results in closed_lost status. Please select a reason." },
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
    if (effectiveLeadStatus) {
      const CLOSING_STATUSES = ['closed_won', 'closed_lost', 'not_interested'];
      if (!CLOSING_STATUSES.includes(effectiveLeadStatus) && !nextFollowUpAt && !nextActionAt) {
        return NextResponse.json(
          { error: "next_follow_up_at or nextActionAt is required when call outcome results in a non-closing status. Please set a follow-up date." },
          { status: 400 }
        );
      }
    }

    // Update lead if leadStatus, nextActionAt, nextActionNote, or badge fields provided
    if (effectiveLeadId && (
      effectiveLeadStatus || 
      nextActionAt !== undefined || 
      nextActionNote !== undefined ||
      badgeKey !== undefined ||
      doNotContact !== undefined ||
      nextFollowUpAt !== undefined
    )) {
      const leadUpdate: any = {};
      
      if (effectiveLeadStatus) {
        leadUpdate.lead_status = effectiveLeadStatus;
      }
      
      if (nextActionAt !== undefined) {
        if (!nextActionAt) {
          leadUpdate.next_action_at = null;
        } else if (typeof nextActionAt === "string" && (nextActionAt.endsWith("Z") || nextActionAt.includes("+"))) {
          // Already an ISO timestamp with timezone
          leadUpdate.next_action_at = nextActionAt;
        } else {
          leadUpdate.next_action_at = new Date(nextActionAt).toISOString();
        }
        console.log(`Setting next_action_at to: ${leadUpdate.next_action_at} for lead ${effectiveLeadId}`);
      }
      
      if (nextActionNote !== undefined) {
        leadUpdate.next_action_note = nextActionNote || null;
      }
      
      // Badge system fields
      if (badgeKey !== undefined) {
        leadUpdate.badge_key = badgeKey;
      }
      
      if (doNotContact !== undefined) {
        leadUpdate.do_not_contact = doNotContact;
      }
      
      // nextFollowUpAt (new field, replaces next_action_at for clarity)
      if (nextFollowUpAt !== undefined) {
        if (!nextFollowUpAt || doNotContact) {
          // Clear follow-up if DNC is set
          leadUpdate.next_follow_up_at = null;
        } else if (typeof nextFollowUpAt === "string" && (nextFollowUpAt.endsWith("Z") || nextFollowUpAt.includes("+"))) {
          leadUpdate.next_follow_up_at = nextFollowUpAt;
        } else {
          leadUpdate.next_follow_up_at = new Date(nextFollowUpAt).toISOString();
        }
      }

      // Lost reason fields
      if (lostReason !== undefined) {
        leadUpdate.lost_reason = lostReason || null;
      }
      if (lostReasonNotes !== undefined) {
        leadUpdate.lost_reason_notes = lostReasonNotes || null;
      }
      
      // Set owner_sdr_id if not already set (lock on first assignment)
      if (!leadUpdate.owner_sdr_id) {
        // Get current lead to check if owner is set
        const { data: currentLead } = await supabaseService
          .from("search_results")
          .select("owner_sdr_id, assigned_to")
          .eq("id", effectiveLeadId)
          .single();
        
        // Use existing owner, or assigned_to, or current user
        if (currentLead?.owner_sdr_id) {
          // Owner already locked, keep it
        } else if (currentLead?.assigned_to) {
          leadUpdate.owner_sdr_id = currentLead.assigned_to;
        } else {
          leadUpdate.owner_sdr_id = user.id;
        }
      }
      
      // Also refresh recency when we update follow-up/status
      if (updateData.updated_at && !leadUpdate.last_call_made_at) {
        leadUpdate.last_call_made_at = updateData.updated_at;
      }

      if (Object.keys(leadUpdate).length > 0) {
        const { error: leadUpdateError } = await supabaseService
          .from("search_results")
          .update(leadUpdate)
          .eq("id", effectiveLeadId);
        
        if (leadUpdateError) {
          console.error(`Error updating lead ${effectiveLeadId}:`, leadUpdateError);
        } else {
          console.log(`Successfully updated lead ${effectiveLeadId} with:`, leadUpdate);
        }
      }
    } else if (!effectiveLeadId && (effectiveLeadStatus || nextActionAt !== undefined || nextActionNote !== undefined || badgeKey !== undefined)) {
      console.warn(`Cannot update lead - no lead_id found for call ${id}`);
    }

    // Log activity if outcome, notes, or lead updates were made
    if (effectiveLeadId && (outcome || outcomeCode || notes || effectiveLeadStatus || nextActionAt !== undefined || ctaAttempted !== undefined)) {
      // Phase 1.3: Update trial_pipeline on contact attempt
      if (outcome || outcomeCode) {
        await updateTrialPipelineOnContact(effectiveLeadId);
      }

      const activityDescription = [
        (outcomeCode || outcome) && `Call outcome: ${outcomeCode || outcome}`,
        effectiveLeadStatus && `Status changed to: ${effectiveLeadStatus}`,
        ctaAttempted && ctaResult && `CTA: ${ctaResult}`,
        nextActionAt && `Next action scheduled for ${new Date(nextActionAt).toLocaleDateString()}`,
        notes && `Notes: ${notes.substring(0, 100)}`,
      ].filter(Boolean).join(" - ");

      await supabaseService.from("lead_activities").insert({
        lead_id: effectiveLeadId,
        user_id: user.id,
        organization_id: profile.organization_id,
        activity_type: effectiveLeadStatus ? "status_change" : "call_made",
        description: activityDescription || "Call updated",
        activity_data: {
          call_id: call.id,
          outcome,
          outcome_code: outcomeCode,
          notes: notes?.substring(0, 500),
          callback_date: callbackDate,
          lead_status: effectiveLeadStatus,
          next_action_at: nextActionAt,
          cta_attempted: ctaAttempted,
          cta_result: ctaResult,
          cta_sent_via_sms: ctaSentViaSms,
          cta_sent_via_email: ctaSentViaEmail,
        },
      });
    }

    return NextResponse.json({
      success: true,
      call: updatedCall,
    });
  } catch (error: any) {
    console.error("Error updating call:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
