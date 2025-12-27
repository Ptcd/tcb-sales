import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/reports/sdr-funnel
 * 
 * Get SDR funnel metrics for all SDRs in the organization.
 * Shows: Trials Started → Activated → Snippet Installed → Paid
 * 
 * Query params:
 * - start_date: YYYY-MM-DD (defaults to 30 days ago)
 * - end_date: YYYY-MM-DD (defaults to today)
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

    // Get user profile and verify admin
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (profile.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    
    // Default to last 30 days
    const defaultStartDate = new Date();
    defaultStartDate.setDate(defaultStartDate.getDate() - 30);
    
    const startDate = searchParams.get("start_date") || defaultStartDate.toISOString().split("T")[0];
    const endDate = searchParams.get("end_date") || new Date().toISOString().split("T")[0];

    // Get the JCC campaign ID
    const { data: jccCampaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id")
      .eq("name", "Junk Car Calculator")
      .single();

    if (campaignError || !jccCampaign) {
      return NextResponse.json({
        success: true,
        sdrs: [],
        totals: {
          trials_started: 0,
          trials_activated: 0,
          snippets_installed: 0,
          paid_conversions: 0,
          total_mrr: 0,
        },
        message: "Junk Car Calculator campaign not found",
      });
    }

    // Get all SDRs in the organization
    const { data: sdrs, error: sdrsError } = await supabase
      .from("user_profiles")
      .select("id, full_name, email")
      .eq("organization_id", profile.organization_id);

    if (sdrsError || !sdrs || sdrs.length === 0) {
      return NextResponse.json({
        success: true,
        sdrs: [],
        totals: {
          trials_started: 0,
          trials_activated: 0,
          snippets_installed: 0,
          paid_conversions: 0,
          total_mrr: 0,
        },
      });
    }

    // Get leads in the JCC campaign
    const { data: jccLeads, error: jccLeadsError } = await supabase
      .from("campaign_leads")
      .select("lead_id")
      .eq("campaign_id", jccCampaign.id);

    if (jccLeadsError || !jccLeads || jccLeads.length === 0) {
      return NextResponse.json({
        success: true,
        sdrs: sdrs.map(sdr => ({
          sdr_user_id: sdr.id,
          sdr_name: sdr.full_name || "",
          sdr_email: sdr.email || "",
          trials_started: 0,
          trials_activated: 0,
          snippets_installed: 0,
          paid_conversions: 0,
          total_mrr: 0,
          activation_rate: 0,
          snippet_rate: 0,
          conversion_rate: 0,
        })),
        totals: {
          trials_started: 0,
          trials_activated: 0,
          snippets_installed: 0,
          paid_conversions: 0,
          total_mrr: 0,
        },
      });
    }

    const jccLeadIds = jccLeads.map(l => l.lead_id);
    const startIso = `${startDate}T00:00:00.000Z`;
    const endIso = `${endDate}T23:59:59.999Z`;

    // For each SDR, count funnel events
    const sdrFunnelData = await Promise.all(
      sdrs.map(async (sdr) => {
        // Count each event type from lead_notifications
        const [trialsStarted, trialsActivated, snippetsInstalled, paidConversions] = await Promise.all([
          supabase
            .from("lead_notifications")
            .select("*", { count: "exact", head: true })
            .eq("sdr_user_id", sdr.id)
            .eq("event_type", "trial_started")
            .in("lead_id", jccLeadIds)
            .gte("created_at", startIso)
            .lte("created_at", endIso),
          supabase
            .from("lead_notifications")
            .select("*", { count: "exact", head: true })
            .eq("sdr_user_id", sdr.id)
            .in("event_type", ["first_login", "calculator_modified", "trial_activated"]) // New events + legacy
            .in("lead_id", jccLeadIds)
            .gte("created_at", startIso)
            .lte("created_at", endIso),
          supabase
            .from("lead_notifications")
            .select("*", { count: "exact", head: true })
            .eq("sdr_user_id", sdr.id)
            .in("event_type", ["first_lead_received", "snippet_installed"]) // New event + legacy
            .in("lead_id", jccLeadIds)
            .gte("created_at", startIso)
            .lte("created_at", endIso),
          supabase
            .from("lead_notifications")
            .select("*", { count: "exact", head: true })
            .eq("sdr_user_id", sdr.id)
            .eq("event_type", "paid_subscribed")
            .in("lead_id", jccLeadIds)
            .gte("created_at", startIso)
            .lte("created_at", endIso),
        ]);

        // Get MRR from paid leads assigned to this SDR
        const { data: paidLeads } = await supabase
          .from("search_results")
          .select("client_mrr")
          .eq("assigned_to", sdr.id)
          .eq("client_status", "paid")
          .in("id", jccLeadIds)
          .not("client_mrr", "is", null);

        const totalMrr = paidLeads?.reduce((sum, lead) => sum + (lead.client_mrr || 0), 0) || 0;

        const started = trialsStarted.count || 0;
        const activated = trialsActivated.count || 0;
        const snippets = snippetsInstalled.count || 0;
        const paid = paidConversions.count || 0;

        return {
          sdr_user_id: sdr.id,
          sdr_name: sdr.full_name || "",
          sdr_email: sdr.email || "",
          trials_started: started,
          trials_activated: activated,
          snippets_installed: snippets,
          paid_conversions: paid,
          total_mrr: Math.round(totalMrr * 100) / 100,
          activation_rate: started > 0 ? Math.round((activated / started) * 1000) / 10 : 0,
          snippet_rate: activated > 0 ? Math.round((snippets / activated) * 1000) / 10 : 0,
          conversion_rate: started > 0 ? Math.round((paid / started) * 1000) / 10 : 0,
        };
      })
    );

    // Filter out SDRs with no activity and sort by trials started
    const activeSdrs = sdrFunnelData
      .filter(sdr => sdr.trials_started > 0 || sdr.trials_activated > 0 || sdr.paid_conversions > 0)
      .sort((a, b) => b.trials_started - a.trials_started);

    // Calculate totals
    const totals = {
      trials_started: activeSdrs.reduce((sum, s) => sum + s.trials_started, 0),
      trials_activated: activeSdrs.reduce((sum, s) => sum + s.trials_activated, 0),
      snippets_installed: activeSdrs.reduce((sum, s) => sum + s.snippets_installed, 0),
      paid_conversions: activeSdrs.reduce((sum, s) => sum + s.paid_conversions, 0),
      total_mrr: Math.round(activeSdrs.reduce((sum, s) => sum + s.total_mrr, 0) * 100) / 100,
    };

    return NextResponse.json({
      success: true,
      sdrs: activeSdrs,
      totals,
      period: { start_date: startDate, end_date: endDate },
    });
  } catch (error: any) {
    console.error("Error in sdr-funnel report:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


