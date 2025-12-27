import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/reports/summaries
 * Fetch daily or weekly summaries for the current user (or all SDRs for admins)
 * 
 * Query params:
 * - type: "daily" | "weekly"
 * - limit: number of records (default 30)
 * - start_date: filter summaries from this date (YYYY-MM-DD)
 * - end_date: filter summaries until this date (YYYY-MM-DD)
 * - sdr_id: filter by specific SDR (admin only)
 * - campaign_id: filter by campaign (optional, for future use)
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

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "daily";
    const limit = parseInt(searchParams.get("limit") || "30", 10);
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const sdrId = searchParams.get("sdr_id");
    const campaignId = searchParams.get("campaign_id");

    // Get user profile to check role and organization
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    const isAdmin = profile?.role === "admin";

    // For admins, get all SDR user IDs in their organization
    // This explicit filter ensures we only see org members, bypassing potential RLS issues
    let orgSdrIds: string[] = [];
    if (isAdmin) {
      const { data: orgMembers } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("organization_id", profile.organization_id);
      
      orgSdrIds = (orgMembers || []).map((m) => m.id);
      
      if (orgSdrIds.length === 0) {
        return NextResponse.json({
          success: true,
          summaries: [],
        });
      }
    }

    if (type === "daily") {
      // Fetch daily summaries
      let query = supabase
        .from("daily_sdr_summaries")
        .select("*")
        .order("date", { ascending: false })
        .limit(limit);

      // Filter by organization members (admin) or just own summaries (non-admin)
      if (!isAdmin) {
        query = query.eq("sdr_user_id", user.id);
      } else if (sdrId) {
        // Admin filtering by specific SDR - verify they're in the org
        if (!orgSdrIds.includes(sdrId)) {
          return NextResponse.json(
            { error: "SDR not found in your organization" },
            { status: 404 }
          );
        }
        query = query.eq("sdr_user_id", sdrId);
      } else {
        // Admin viewing all org members
        query = query.in("sdr_user_id", orgSdrIds);
      }

      // Campaign filter (for future use)
      if (campaignId) {
        query = query.eq("campaign_id", campaignId);
      }

      // Date range filtering
      if (startDate) {
        query = query.gte("date", startDate);
      }
      if (endDate) {
        query = query.lte("date", endDate);
      }

      const { data: summaries, error } = await query;

      if (error) {
        console.error("Error fetching daily summaries:", error);
        return NextResponse.json(
          { error: "Failed to fetch summaries", details: error.message },
          { status: 500 }
        );
      }

      // Fetch SDR names for display
      if (summaries && summaries.length > 0) {
        const sdrIds = [...new Set(summaries.map((s) => s.sdr_user_id))];
        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("id, full_name, email")
          .in("id", sdrIds);

        const profileMap = new Map(
          (profiles || []).map((p) => [p.id, { name: p.full_name, email: p.email }])
        );

        const enrichedSummaries = summaries.map((s) => ({
          ...s,
          sdr_name: profileMap.get(s.sdr_user_id)?.name,
          sdr_email: profileMap.get(s.sdr_user_id)?.email,
        }));

        return NextResponse.json({
          success: true,
          summaries: enrichedSummaries,
        });
      }

      return NextResponse.json({
        success: true,
        summaries: summaries || [],
      });
    } else if (type === "weekly") {
      // Fetch weekly summaries
      let query = supabase
        .from("weekly_sdr_summaries")
        .select("*")
        .order("week_start", { ascending: false })
        .limit(limit);

      // Filter by organization members (admin) or just own summaries (non-admin)
      if (!isAdmin) {
        query = query.eq("sdr_user_id", user.id);
      } else if (sdrId) {
        // Admin filtering by specific SDR - verify they're in the org
        if (!orgSdrIds.includes(sdrId)) {
          return NextResponse.json(
            { error: "SDR not found in your organization" },
            { status: 404 }
          );
        }
        query = query.eq("sdr_user_id", sdrId);
      } else {
        // Admin viewing all org members
        query = query.in("sdr_user_id", orgSdrIds);
      }

      // Campaign filter (for future use)
      if (campaignId) {
        query = query.eq("campaign_id", campaignId);
      }

      // Date range filtering (use week_start for weekly summaries)
      if (startDate) {
        query = query.gte("week_start", startDate);
      }
      if (endDate) {
        query = query.lte("week_end", endDate);
      }

      const { data: summaries, error } = await query;

      if (error) {
        console.error("Error fetching weekly summaries:", error);
        return NextResponse.json(
          { error: "Failed to fetch summaries", details: error.message },
          { status: 500 }
        );
      }

      // Fetch SDR names for display
      if (summaries && summaries.length > 0) {
        const sdrIds = [...new Set(summaries.map((s) => s.sdr_user_id))];
        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("id, full_name, email")
          .in("id", sdrIds);

        const profileMap = new Map(
          (profiles || []).map((p) => [p.id, { name: p.full_name, email: p.email }])
        );

        const enrichedSummaries = summaries.map((s) => ({
          ...s,
          sdr_name: profileMap.get(s.sdr_user_id)?.name,
          sdr_email: profileMap.get(s.sdr_user_id)?.email,
        }));

        return NextResponse.json({
          success: true,
          summaries: enrichedSummaries,
        });
      }

      return NextResponse.json({
        success: true,
        summaries: summaries || [],
      });
    } else {
      return NextResponse.json(
        { error: "Invalid type. Use 'daily' or 'weekly'" },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("Error in summaries GET:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
