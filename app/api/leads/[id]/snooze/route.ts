import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/leads/[id]/snooze
 * Snooze a follow-up by pushing next_action_at forward by X hours
 * Body: { hours?: number } (default 2)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: leadId } = await params;
    const { hours = 2 } = await request.json();

    // Validate hours (0.5-8 hours)
    const snoozeHours = Math.max(0.5, Math.min(8, hours));

    // Get current next_action_at
    const { data: lead, error: leadError } = await supabase
      .from("search_results")
      .select("id, next_action_at, assigned_to, organization_id")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Verify user owns this lead
    if (lead.assigned_to !== user.id) {
      // Check if user is admin
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role !== "admin") {
        return NextResponse.json({ error: "Not authorized to snooze this lead" }, { status: 403 });
      }
    }

    // Calculate new next_action_at
    const now = new Date();
    const newNextActionAt = new Date(now.getTime() + snoozeHours * 60 * 60 * 1000);

    // Update next_action_at
    const { data: updatedLead, error: updateError } = await supabase
      .from("search_results")
      .update({ 
        next_action_at: newNextActionAt.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", leadId)
      .select()
      .single();

    if (updateError) {
      console.error("Error snoozing lead:", updateError);
      return NextResponse.json({ error: "Failed to snooze lead" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      lead: updatedLead,
      snoozed_until: newNextActionAt.toISOString(),
      hours: snoozeHours,
    });
  } catch (error: any) {
    console.error("Error in POST /api/leads/[id]/snooze:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

