import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/reports/agent-summary
 * Get performance summary for all agents (admin only)
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

    // Verify user is admin
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    // Get date range and campaign from query params
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const campaignId = searchParams.get("campaign_id");

    // Default to last 30 days if not specified
    const defaultStartDate = new Date();
    defaultStartDate.setDate(defaultStartDate.getDate() - 30);
    const start = startDate || defaultStartDate.toISOString().split("T")[0];
    const end = endDate || new Date().toISOString().split("T")[0];

    // Get users in the campaign if filtering by campaign
    let campaignUserIds: string[] | null = null;
    if (campaignId && campaignId !== "all") {
      const { data: campaignMembers } = await supabase
        .from("campaign_members")
        .select("user_id")
        .eq("campaign_id", campaignId);
      campaignUserIds = campaignMembers?.map(cm => cm.user_id) || null;
      
      // If campaign has no members, return empty
      if (!campaignUserIds || campaignUserIds.length === 0) {
        return NextResponse.json({
          success: true,
          agents: [],
          period: { start, end },
        });
      }
    }

    // Get all reps in the organization (filter by campaign if specified)
    let repsQuery = supabase
      .from("user_profiles")
      .select("id, full_name, email, role")
      .eq("organization_id", profile.organization_id)
      .eq("role", "member");
    
    if (campaignUserIds) {
      repsQuery = repsQuery.in("id", campaignUserIds);
    }
    
    const { data: reps } = await repsQuery;

    if (!reps || reps.length === 0) {
      return NextResponse.json({
        success: true,
        agents: [],
        period: { start, end },
      });
    }

    // Get performance metrics for each rep
    const agentSummaries = await Promise.all(
      reps.map(async (rep) => {
        // Build campaign filter for calls
        const buildCallQuery = (baseQuery: any) => {
          let query = baseQuery
            .eq("organization_id", profile.organization_id)
            .eq("user_id", rep.id);
          
          if (campaignId && campaignId !== "all") {
            query = query.eq("campaign_id", campaignId);
          }
          
          return query
            .gte("initiated_at", `${start}T00:00:00Z`)
            .lte("initiated_at", `${end}T23:59:59Z`);
        };

        // Calls made
        const { count: totalCalls } = await buildCallQuery(
          supabase.from("calls").select("*", { count: "exact", head: true })
        );

        // Answered calls
        const { count: answeredCalls } = await buildCallQuery(
          supabase.from("calls").select("*", { count: "exact", head: true })
            .in("status", ["answered", "completed"])
        );

        // Total call duration
        const { data: callData } = await buildCallQuery(
          supabase.from("calls").select("duration")
        );

        const totalDuration =
          callData?.reduce((sum: number, call: any) => sum + (call.duration || 0), 0) || 0;
        const avgDuration =
          callData && callData.length > 0
            ? totalDuration / callData.length
            : 0;

        // Build campaign filter for messages
        const buildMessageQuery = (table: string, baseQuery: any) => {
          let query = baseQuery
            .eq("organization_id", profile.organization_id)
            .eq("user_id", rep.id);
          
          if (campaignId && campaignId !== "all") {
            query = query.eq("campaign_id", campaignId);
          }
          
          return query
            .gte("created_at", `${start}T00:00:00Z`)
            .lte("created_at", `${end}T23:59:59Z`);
        };

        // SMS sent
        const { count: smsCount } = await buildMessageQuery(
          "sms_messages",
          supabase.from("sms_messages").select("*", { count: "exact", head: true })
            .eq("direction", "outbound")
        );

        // Emails sent
        const { count: emailCount } = await buildMessageQuery(
          "email_messages",
          supabase.from("email_messages").select("*", { count: "exact", head: true })
            .eq("status", "sent")
        );

        // Get lead IDs for the campaign if filtering
        let campaignLeadIds: string[] | null = null;
        if (campaignId && campaignId !== "all") {
          const { data: campaignLeads } = await supabase
            .from("campaign_leads")
            .select("lead_id")
            .eq("campaign_id", campaignId);
          campaignLeadIds = campaignLeads?.map(cl => cl.lead_id) || null;
        }

        // Build lead query with campaign filter
        const buildLeadQuery = (baseQuery: any) => {
          let query = baseQuery
            .eq("organization_id", profile.organization_id)
            .eq("assigned_to", rep.id);
          
          if (campaignLeadIds) {
            query = query.in("id", campaignLeadIds);
          }
          
          return query;
        };

        // Leads owned
        const { count: leadsOwned } = await buildLeadQuery(
          supabase.from("search_results").select("*", { count: "exact", head: true })
        );

        // Leads touched (contacted)
        const { count: leadsTouched } = await buildLeadQuery(
          supabase.from("search_results").select("*", { count: "exact", head: true })
            .in("lead_status", ["contacted", "interested", "converted"])
            .not("last_contacted_at", "is", null)
            .gte("last_contacted_at", `${start}T00:00:00Z`)
            .lte("last_contacted_at", `${end}T23:59:59Z`)
        );

        // Conversions (qualified + converted)
        const { count: conversions } = await buildLeadQuery(
          supabase.from("search_results").select("*", { count: "exact", head: true })
            .in("lead_status", ["interested", "converted"])
            .gte("updated_at", `${start}T00:00:00Z`)
            .lte("updated_at", `${end}T23:59:59Z`)
        );

        // Connection rate
        const connectionRate =
          totalCalls && totalCalls > 0
            ? ((answeredCalls || 0) / totalCalls) * 100
            : 0;

        // Conversion rate
        const conversionRate =
          leadsTouched && leadsTouched > 0
            ? ((conversions || 0) / leadsTouched) * 100
            : 0;

        return {
          agentId: rep.id,
          agentName: rep.full_name || rep.email || "Unknown",
          agentEmail: rep.email,
          metrics: {
            totalCalls: totalCalls || 0,
            answeredCalls: answeredCalls || 0,
            connectionRate: Math.round(connectionRate * 10) / 10,
            totalDuration: totalDuration,
            avgDuration: Math.round(avgDuration),
            smsSent: smsCount || 0,
            emailsSent: emailCount || 0,
            leadsOwned: leadsOwned || 0,
            leadsTouched: leadsTouched || 0,
            conversions: conversions || 0,
            conversionRate: Math.round(conversionRate * 10) / 10,
          },
        };
      })
    );

    return NextResponse.json({
      success: true,
      agents: agentSummaries,
      period: { start, end },
    });
  } catch (error) {
    console.error("Error in GET /api/reports/agent-summary:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

