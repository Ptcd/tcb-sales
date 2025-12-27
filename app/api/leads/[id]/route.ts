import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { LostReason, LOST_REASON_OPTIONS } from "@/lib/types";

/**
 * GET /api/leads/[id]
 * Get a single lead by ID
 */
export async function GET(
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

    const { id } = await params;

    // Get user's organization
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

    // Use service role to bypass RLS
    const serviceSupabase = createServiceRoleClient();
    
    // Check if id is a UUID or a Place ID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    
    let lead;
    
    if (isUUID) {
      // Standard lookup by database ID
      const { data, error: leadError } = await serviceSupabase
        .from("search_results")
        .select("*")
        .eq("id", id)
        .eq("organization_id", profile.organization_id)
        .single();
      
      if (leadError) {
        return NextResponse.json(
          { error: "Lead not found" },
          { status: 404 }
        );
      }
      
      lead = data;
    } else {
      // id is a Place ID - find existing lead
      const { data: existingLead, error: leadError } = await serviceSupabase
        .from("search_results")
        .select("*")
        .eq("place_id", id)
        .eq("organization_id", profile.organization_id)
        .single();
      
      if (leadError || !existingLead) {
        // Lead doesn't exist yet - return 404
        // User should call/text from search which auto-creates the lead
        return NextResponse.json(
          { error: "Lead not found. Please call or text this lead from the search results to create it first." },
          { status: 404 }
        );
      }
      
      lead = existingLead;
    }
    
    if (!lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      lead: {
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        address: lead.address,
        email: lead.email,
        website: lead.website,
        lead_status: lead.lead_status,
        lead_source: lead.lead_source || "manual",
      },
    });
  } catch (error: any) {
    console.error("Error fetching lead:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/leads/[id]
 * Update a lead with status, next action, and notes
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

    const { id } = await params;
    const body = await request.json();
    const { leadStatus, nextActionAt, nextActionNote, nextFollowUpAt, lostReason, lostReasonNotes, note, email, phone, name, address, website, leadTimezone, timezoneSource } = body;

    // Lost reason enforcement: require lost_reason when status is closed_lost
    if (leadStatus === 'closed_lost' && !lostReason) {
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

    // Follow-up enforcement: require next_follow_up_at or nextActionAt for non-closing statuses
    if (leadStatus) {
      const CLOSING_STATUSES = ['closed_won', 'closed_lost', 'not_interested'];
      if (!CLOSING_STATUSES.includes(leadStatus) && !nextFollowUpAt && !nextActionAt) {
        return NextResponse.json(
          { error: "next_follow_up_at or nextActionAt is required when changing status to a non-closing value. Please set a follow-up date or close the lead." },
          { status: 400 }
        );
      }
    }

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

    // Check if id is a UUID or a Place ID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    
    // Get the lead to verify ownership - lookup by id or place_id
    let lead;
    if (isUUID) {
      const { data, error: leadError } = await supabase
        .from("search_results")
        .select("id, organization_id, assigned_to, lead_status")
        .eq("id", id)
        .eq("organization_id", profile.organization_id)
        .single();
      
      if (leadError || !data) {
        return NextResponse.json(
          { error: "Lead not found" },
          { status: 404 }
        );
      }
      lead = data;
    } else {
      // id is a Place ID
      const { data, error: leadError } = await supabase
        .from("search_results")
        .select("id, organization_id, assigned_to, lead_status")
        .eq("place_id", id)
        .eq("organization_id", profile.organization_id)
        .single();
      
      if (leadError || !data) {
        return NextResponse.json(
          { error: "Lead not found" },
          { status: 404 }
        );
      }
      lead = data;
    }

    // Build update object
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (leadStatus) {
      updateData.lead_status = leadStatus;
    }

    if (nextActionAt !== undefined) {
      updateData.next_action_at = nextActionAt ? new Date(nextActionAt).toISOString() : null;
    }

    if (nextActionNote !== undefined) {
      updateData.next_action_note = nextActionNote || null;
    }

    // nextFollowUpAt (preferred over nextActionAt for clarity)
    if (nextFollowUpAt !== undefined) {
      if (!nextFollowUpAt) {
        updateData.next_follow_up_at = null;
      } else if (typeof nextFollowUpAt === "string" && (nextFollowUpAt.endsWith("Z") || nextFollowUpAt.includes("+"))) {
        updateData.next_follow_up_at = nextFollowUpAt;
      } else {
        updateData.next_follow_up_at = new Date(nextFollowUpAt).toISOString();
      }
    } else if (nextActionAt !== undefined && nextActionAt) {
      // Fallback: use nextActionAt if nextFollowUpAt not provided
      updateData.next_follow_up_at = typeof nextActionAt === "string" 
        ? (nextActionAt.endsWith("Z") || nextActionAt.includes("+") 
          ? nextActionAt 
          : new Date(nextActionAt).toISOString())
        : new Date(nextActionAt).toISOString();
    }

    // Lost reason fields
    if (lostReason !== undefined) {
      updateData.lost_reason = lostReason || null;
    }
    if (lostReasonNotes !== undefined) {
      updateData.lost_reason_notes = lostReasonNotes || null;
    }

    // Timezone fields
    if (leadTimezone !== undefined) {
      updateData.lead_timezone = leadTimezone || null;
    }
    if (timezoneSource !== undefined) {
      updateData.timezone_source = timezoneSource || null;
    }

    // Contact info updates
    if (email !== undefined) {
      updateData.email = email || null;
    }

    if (phone !== undefined) {
      updateData.phone = phone || null;
    }

    if (name !== undefined) {
      updateData.name = name || null;
    }

    if (address !== undefined) {
      updateData.address = address || null;
    }

    if (website !== undefined) {
      updateData.website = website || null;
    }

    // Update the lead using the database UUID (lead.id), not the URL param which might be a Place ID
    const { data: updatedLead, error: updateError } = await supabase
      .from("search_results")
      .update(updateData)
      .eq("id", lead.id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating lead:", updateError);
      return NextResponse.json(
        { error: "Failed to update lead" },
        { status: 500 }
      );
    }

    // Log activity for status change
    if (leadStatus && leadStatus !== lead.lead_status) {
      await supabase.from("lead_activities").insert({
        lead_id: lead.id,
        user_id: user.id,
        organization_id: profile.organization_id,
        activity_type: "status_change",
        description: `Status changed from ${lead.lead_status || 'none'} to ${leadStatus}`,
        activity_data: {
          old_status: lead.lead_status,
          new_status: leadStatus,
          next_action_at: nextActionAt,
        },
      });
    }

    // Add note if provided
    if (note) {
      await supabase.from("lead_notes").insert({
        lead_id: lead.id,
        user_id: user.id,
        note: note,
      });

      await supabase.from("lead_activities").insert({
        lead_id: lead.id,
        user_id: user.id,
        organization_id: profile.organization_id,
        activity_type: "note_added",
        description: `Note added: ${note.substring(0, 100)}`,
        activity_data: {
          note: note.substring(0, 500),
        },
      });
    }

    return NextResponse.json({
      success: true,
      lead: updatedLead,
    });
  } catch (error: any) {
    console.error("Error updating lead:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
