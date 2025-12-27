import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/kpis
 * Get KPI metrics for admin dashboard
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

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate") || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const endDate = searchParams.get("endDate") || new Date().toISOString().split("T")[0];
    const groupBy = searchParams.get("groupBy") || "day"; // day, week, month
    const campaignId = searchParams.get("campaign_id");

    // Get users in the campaign if filtering by campaign
    let campaignUserIds: string[] | null = null;
    if (campaignId && campaignId !== "all") {
      const { data: campaignMembers } = await supabase
        .from("campaign_members")
        .select("user_id")
        .eq("campaign_id", campaignId);
      campaignUserIds = campaignMembers?.map(cm => cm.user_id) || null;
    }

    // Get call KPIs (filter by campaign users if specified)
    let callKPIsQuery = supabase
      .from("organization_call_kpis")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .gte("call_date", startDate)
      .lte("call_date", endDate);
    
    // Note: organization_call_kpis is aggregated, so we'll need to filter calls directly
    // For now, we'll get all KPIs and filter the user performance
    const { data: callKPIs, error: callError } = await callKPIsQuery
      .order("call_date", { ascending: true });

    if (callError) {
      console.error("Error fetching call KPIs:", callError);
    }

    // Get SMS KPIs
    const { data: smsKPIs, error: smsError } = await supabase
      .from("organization_sms_kpis")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .gte("sms_date", startDate)
      .lte("sms_date", endDate)
      .order("sms_date", { ascending: true });

    if (smsError) {
      console.error("Error fetching SMS KPIs:", smsError);
    }

    // Get user performance (top performers) - filter by campaign if specified
    let userPerformanceQuery = supabase
      .from("user_call_performance")
      .select(`
        *,
        user_profiles:user_id (
          id,
          full_name,
          email
        )
      `)
      .eq("organization_id", profile.organization_id)
      .gte("call_date", startDate)
      .lte("call_date", endDate);
    
    if (campaignUserIds) {
      userPerformanceQuery = userPerformanceQuery.in("user_id", campaignUserIds);
    }
    
    const { data: userPerformance, error: userError } = await userPerformanceQuery
      .order("total_calls", { ascending: false })
      .limit(20);

    if (userError) {
      console.error("Error fetching user performance:", userError);
    }

    // If filtering by campaign, recalculate totals from user performance
    // Otherwise use aggregated KPIs
    let totalCalls = 0;
    let totalAnswered = 0;
    let totalSMS = 0;
    let totalCallbacks = 0;
    let avgDuration = 0;

    if (campaignUserIds && campaignUserIds.length > 0) {
      // Calculate from user performance data
      totalCalls = userPerformance?.reduce((sum, perf) => sum + (perf.total_calls || 0), 0) || 0;
      totalAnswered = userPerformance?.reduce((sum, perf) => sum + (perf.answered_calls || 0), 0) || 0;
      totalSMS = smsKPIs?.reduce((sum, kpi) => sum + (kpi.total_sms || 0), 0) || 0;
      totalCallbacks = userPerformance?.reduce((sum, perf) => sum + (perf.callbacks_scheduled || 0), 0) || 0;
      
      // Calculate average duration from user performance
      const totalDuration = userPerformance?.reduce((sum, perf) => {
        const duration = perf.avg_duration_seconds || 0;
        const calls = perf.total_calls || 0;
        return sum + (duration * calls);
      }, 0) || 0;
      avgDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;
    } else {
      // Use aggregated KPIs
      totalCalls = callKPIs?.reduce((sum, kpi) => sum + (kpi.total_calls || 0), 0) || 0;
      totalAnswered = callKPIs?.reduce((sum, kpi) => sum + (kpi.answered_calls || 0), 0) || 0;
      totalSMS = smsKPIs?.reduce((sum, kpi) => sum + (kpi.total_sms || 0), 0) || 0;
      totalCallbacks = callKPIs?.reduce((sum, kpi) => sum + (kpi.callbacks_scheduled || 0), 0) || 0;
      avgDuration = callKPIs && callKPIs.length > 0
        ? callKPIs.reduce((sum, kpi) => sum + (kpi.avg_duration_seconds || 0), 0) / callKPIs.length
        : 0;
    }

    // Get today's metrics for comparison
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    
    let todayCallKPI: any = null;
    let yesterdayCallKPI: any = null;
    
    if (campaignUserIds && campaignUserIds.length > 0) {
      // Calculate from user performance for today/yesterday
      const todayUserPerf = userPerformance?.filter((perf) => perf.call_date === today) || [];
      const yesterdayUserPerf = userPerformance?.filter((perf) => perf.call_date === yesterday) || [];
      
      todayCallKPI = {
        total_calls: todayUserPerf.reduce((sum, perf) => sum + (perf.total_calls || 0), 0),
        answered_calls: todayUserPerf.reduce((sum, perf) => sum + (perf.answered_calls || 0), 0),
        callbacks_scheduled: todayUserPerf.reduce((sum, perf) => sum + (perf.callbacks_scheduled || 0), 0),
      };
      
      yesterdayCallKPI = {
        total_calls: yesterdayUserPerf.reduce((sum, perf) => sum + (perf.total_calls || 0), 0),
        answered_calls: yesterdayUserPerf.reduce((sum, perf) => sum + (perf.answered_calls || 0), 0),
        callbacks_scheduled: yesterdayUserPerf.reduce((sum, perf) => sum + (perf.callbacks_scheduled || 0), 0),
      };
    } else {
      todayCallKPI = callKPIs?.find((kpi) => kpi.call_date === today);
      yesterdayCallKPI = callKPIs?.find((kpi) => kpi.call_date === yesterday);
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalCalls,
        totalAnswered,
        totalSMS,
        totalCallbacks,
        avgDurationSeconds: Math.round(avgDuration),
        connectRate: totalCalls > 0 ? (totalAnswered / totalCalls) * 100 : 0,
      },
      today: {
        calls: todayCallKPI?.total_calls || 0,
        answered: todayCallKPI?.answered_calls || 0,
        callbacks: todayCallKPI?.callbacks_scheduled || 0,
      },
      yesterday: {
        calls: yesterdayCallKPI?.total_calls || 0,
        answered: yesterdayCallKPI?.answered_calls || 0,
        callbacks: yesterdayCallKPI?.callbacks_scheduled || 0,
      },
      dailyCallKPIs: callKPIs || [],
      dailySMSKPIs: smsKPIs || [],
      topPerformers: userPerformance || [],
      dateRange: {
        startDate,
        endDate,
      },
    });
  } catch (error: any) {
    console.error("Error fetching KPIs:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

