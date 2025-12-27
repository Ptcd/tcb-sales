import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, organization_id")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const { is_activator } = await request.json();
    const { id: targetUserId } = await params;

    // Use service role client to bypass RLS for admin updates
    const serviceSupabase = createServiceRoleClient();

    if (is_activator) {
      // Only one activator per org - clear others first
      await serviceSupabase
        .from("user_profiles")
        .update({ is_activator: false })
        .eq("organization_id", profile.organization_id);
    }

    const { error } = await serviceSupabase
      .from("user_profiles")
      .update({ is_activator: is_activator })
      .eq("id", targetUserId);

    if (error) {
      console.error("Error updating activator:", error);
      // Check if column doesn't exist
      if (error.message?.includes("column") && error.message?.includes("does not exist")) {
        return NextResponse.json({ 
          error: "Database migration not run. Please run the activator migration in Supabase SQL Editor." 
        }, { status: 500 });
      }
      throw error;
    }

    // If setting someone as activator, assign all unassigned trials to them
    if (is_activator) {
      // Get JCC campaign
      const { data: jccCampaign } = await serviceSupabase
        .from("campaigns")
        .select("id")
        .eq("name", "Junk Car Calculator")
        .single();

      if (jccCampaign) {
        // Get all lead IDs in JCC campaign
        const { data: campaignLeads } = await serviceSupabase
          .from("campaign_leads")
          .select("lead_id")
          .eq("campaign_id", jccCampaign.id);

        const leadIds = campaignLeads?.map(cl => cl.lead_id) || [];

        if (leadIds.length > 0) {
          // Update all trial leads that are unassigned or not assigned to this activator
          const { data: updated, error: assignError } = await serviceSupabase
            .from("search_results")
            .update({ 
              assigned_to: targetUserId,
              updated_at: new Date().toISOString()
            })
            .in("id", leadIds)
            .in("badge_key", [
              "trial_awaiting_activation",
              "trial_activated", 
              "trial_configured",
              "trial_embed_copied",
              "trial_live_first_lead"
            ])
            .is("assigned_to", null)
            .select("id");

          if (assignError) {
            console.error("Error auto-assigning trials to activator:", assignError);
          } else {
            console.log(`Assigned ${updated?.length || 0} trials to new activator ${targetUserId}`);
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in activator endpoint:", error);
    return NextResponse.json({ 
      error: error.message || "Failed to update activator. Make sure the database migration has been run." 
    }, { status: 500 });
  }
}

