import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is activator or admin
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("is_activator, role, organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "Organization not found" }, { status: 403 });
    }

    // Get JCC campaign
    const { data: jccCampaign } = await supabase
      .from("campaigns")
      .select("id")
      .eq("name", "Junk Car Calculator")
      .single();

    if (!jccCampaign) {
      return NextResponse.json({ error: "JCC campaign not found" }, { status: 404 });
    }

    // Build query for trials
    let query = supabase
      .from("search_results")
      .select(`
        id,
        name,
        email,
        phone,
        badge_key,
        assigned_to,
        trial_pipeline (
          id,
          trial_started_at,
          password_set_at,
          first_login_at,
          calculator_modified_at,
          embed_snippet_copied_at,
          first_lead_received_at,
          marked_lost_at,
          activation_status,
          next_action,
          scheduled_install_at,
          technical_owner_name,
          jcc_user_id,
          assigned_activator_id,
          last_contact_at,
          rescue_attempts,
          customer_timezone
        )
      `)
      .in("badge_key", [
        "trial_awaiting_activation",
        "trial_activated",
        "trial_configured",
        "trial_embed_copied",
        "trial_live_first_lead"
      ]);

    // Filter by JCC campaign
    const { data: campaignLeads } = await supabase
      .from("campaign_leads")
      .select("lead_id")
      .eq("campaign_id", jccCampaign.id);

    const leadIds = campaignLeads?.map(cl => cl.lead_id) || [];
    if (leadIds.length === 0) {
      return NextResponse.json({ activations: [] });
    }

    query = query.in("id", leadIds);

    // Filter by assignment:
    // - Admins see all trials
    // - Activators see only trials assigned to them (via assigned_activator_id)
    // - Others see only trials assigned to them (via assigned_to)
    if (profile?.role === "admin") {
      // Admins see everything - no filter
    } else if (profile?.is_activator) {
      // Activators see only their assigned activations
      // Need to filter by trial_pipeline.assigned_activator_id
      // Since we can't filter nested fields directly, we'll filter after fetching
    } else {
      // Non-activators see only their assigned leads
      query = query.eq("assigned_to", user.id);
    }

    const { data: leads, error } = await query;

    if (error) throw error;

    // Filter activators to only see their assigned activations
    let filteredLeads = leads || [];
    if (profile?.is_activator && profile?.role !== "admin") {
      filteredLeads = filteredLeads.filter((lead: any) => {
        const pipeline = Array.isArray(lead.trial_pipeline) ? lead.trial_pipeline[0] : lead.trial_pipeline;
        return pipeline?.assigned_activator_id === user.id;
      });
    }

    // Sort by trial_started_at manually since we can't order by nested field easily
    const sortedLeads = filteredLeads.sort((a: any, b: any) => {
      const aPipeline = Array.isArray(a.trial_pipeline) ? a.trial_pipeline[0] : a.trial_pipeline;
      const bPipeline = Array.isArray(b.trial_pipeline) ? b.trial_pipeline[0] : b.trial_pipeline;
      const aTime = aPipeline?.trial_started_at ? new Date(aPipeline.trial_started_at).getTime() : 0;
      const bTime = bPipeline?.trial_started_at ? new Date(bPipeline.trial_started_at).getTime() : 0;
      return aTime - bTime;
    });

    return NextResponse.json({ activations: sortedLeads });
  } catch (error: any) {
    console.error("Error fetching activations:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

