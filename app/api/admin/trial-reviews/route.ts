import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/trial-reviews
 * Fetch SDR trial reviews for admin
 * 
 * Query params:
 * - date: specific date (YYYY-MM-DD), defaults to today
 * - decision: filter by decision ('keep', 'drop', 'retry', 'pending')
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

    // Check admin role
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, organization_id")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden - Admin only" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];
    const decisionFilter = searchParams.get("decision");

    // Get all SDRs in admin's organization
    const { data: orgMembers } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("organization_id", profile.organization_id);

    const orgMemberIds = (orgMembers || []).map((m) => m.id);

    if (orgMemberIds.length === 0) {
      return NextResponse.json({
        success: true,
        reviews: [],
        date,
      });
    }

    // Fetch trial reviews for this date, filtered by org members
    let query = supabase
      .from("sdr_trial_reviews")
      .select("*")
      .eq("date", date)
      .in("sdr_user_id", orgMemberIds)
      .order("created_at", { ascending: false });

    // Apply decision filter
    if (decisionFilter === "pending") {
      query = query.is("decision", null);
    } else if (decisionFilter && ["keep", "drop", "retry"].includes(decisionFilter)) {
      query = query.eq("decision", decisionFilter);
    }

    const { data: reviews, error } = await query;

    if (error) {
      console.error("Error fetching trial reviews:", error);
      return NextResponse.json(
        { error: "Failed to fetch reviews", details: error.message },
        { status: 500 }
      );
    }

    // Enrich with SDR profile info
    if (reviews && reviews.length > 0) {
      const sdrIds = [...new Set(reviews.map((r) => r.sdr_user_id))];
      const reviewerIds = reviews
        .filter((r) => r.reviewed_by_user_id)
        .map((r) => r.reviewed_by_user_id);
      const allUserIds = [...new Set([...sdrIds, ...reviewerIds])];

      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("id, full_name, email")
        .in("id", allUserIds);

      const profileMap = new Map(
        (profiles || []).map((p) => [p.id, { name: p.full_name, email: p.email }])
      );

      const enrichedReviews = reviews.map((r) => ({
        ...r,
        sdr_name: profileMap.get(r.sdr_user_id)?.name,
        sdr_email: profileMap.get(r.sdr_user_id)?.email,
        reviewer_name: r.reviewed_by_user_id 
          ? profileMap.get(r.reviewed_by_user_id)?.name 
          : null,
      }));

      return NextResponse.json({
        success: true,
        reviews: enrichedReviews,
        date,
        pending_count: enrichedReviews.filter((r) => !r.decision).length,
      });
    }

    return NextResponse.json({
      success: true,
      reviews: reviews || [],
      date,
      pending_count: 0,
    });
  } catch (error: any) {
    console.error("Error in trial reviews GET:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


