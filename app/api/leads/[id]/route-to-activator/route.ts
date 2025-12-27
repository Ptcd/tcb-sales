import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

/**
 * POST /api/leads/[id]/route-to-activator
 * Checks if lead has a trial_pipeline record and routes it to an activator
 * Returns { routed: boolean, hasTrialPipeline: boolean, activatorId?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    
    // Try to create service role client, fall back to regular client
    let serviceSupabase;
    try {
      serviceSupabase = createServiceRoleClient();
    } catch (e) {
      console.warn("Service role client not available, using regular client");
      serviceSupabase = supabase;
    }
    
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: leadId } = await params;

    // Get user's organization
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    // Check if lead has trial_pipeline record (use maybeSingle to avoid error on no results)
    const { data: trialPipeline, error: pipelineError } = await serviceSupabase
      .from("trial_pipeline")
      .select("id, crm_lead_id, assigned_activator_id")
      .eq("crm_lead_id", leadId)
      .maybeSingle();

    if (pipelineError) {
      console.error("Error checking trial_pipeline:", pipelineError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!trialPipeline) {
      // No trial pipeline - not a trial lead
      return NextResponse.json({
        routed: false,
        hasTrialPipeline: false,
      });
    }

    // Lead has trial - route to activator
    // Find an activator in the same organization
    const { data: activators } = await serviceSupabase
      .from("user_profiles")
      .select("id")
      .eq("organization_id", profile.organization_id)
      .eq("is_activator", true)
      .limit(1);

    if (!activators || activators.length === 0) {
      // No activator found - still update status but can't assign
      await serviceSupabase
        .from("search_results")
        .update({ lead_status: "trial_started" })
        .eq("id", leadId);

      return NextResponse.json({
        routed: true,
        hasTrialPipeline: true,
        activatorId: null,
        warning: "No activator found in organization",
      });
    }

    const activatorId = activators[0].id;

    // Update lead_status to exclude from SDR queue
    await serviceSupabase
      .from("search_results")
      .update({ lead_status: "trial_started" })
      .eq("id", leadId);

    // Assign to activator if not already assigned
    if (!trialPipeline.assigned_activator_id) {
      await serviceSupabase
        .from("trial_pipeline")
        .update({ assigned_activator_id: activatorId })
        .eq("id", trialPipeline.id);
    }

    return NextResponse.json({
      routed: true,
      hasTrialPipeline: true,
      activatorId: trialPipeline.assigned_activator_id || activatorId,
    });
  } catch (error: any) {
    console.error("Error in POST /api/leads/[id]/route-to-activator:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

