import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/admin/trial-reviews/[id]
 * Update a trial review decision and notes
 * 
 * Body:
 * - decision: 'keep' | 'drop' | 'retry' | null
 * - admin_notes: string
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

    // Check admin role
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, organization_id")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden - Admin only" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { decision, admin_notes } = body;

    // Validate decision value
    if (decision !== undefined && decision !== null) {
      if (!["keep", "drop", "retry"].includes(decision)) {
        return NextResponse.json(
          { error: "Invalid decision. Must be 'keep', 'drop', or 'retry'" },
          { status: 400 }
        );
      }
    }

    // Get the review to verify it belongs to an SDR in the admin's org
    const { data: review, error: reviewError } = await supabase
      .from("sdr_trial_reviews")
      .select("id, sdr_user_id")
      .eq("id", id)
      .single();

    if (reviewError || !review) {
      return NextResponse.json(
        { error: "Review not found" },
        { status: 404 }
      );
    }

    // Verify SDR is in admin's organization
    const { data: sdrProfile } = await supabase
      .from("user_profiles")
      .select("organization_id")
      .eq("id", review.sdr_user_id)
      .single();

    if (!sdrProfile || sdrProfile.organization_id !== profile.organization_id) {
      return NextResponse.json(
        { error: "SDR not found in your organization" },
        { status: 404 }
      );
    }

    // Build update object
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (decision !== undefined) {
      updateData.decision = decision;
      updateData.reviewed_by_user_id = user.id;
      updateData.reviewed_at = new Date().toISOString();
    }

    if (admin_notes !== undefined) {
      updateData.admin_notes = admin_notes;
    }

    // Update the review
    const { data: updatedReview, error: updateError } = await supabase
      .from("sdr_trial_reviews")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating trial review:", updateError);
      return NextResponse.json(
        { error: "Failed to update review", details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      review: updatedReview,
    });
  } catch (error: any) {
    console.error("Error in trial reviews PATCH:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/trial-reviews/[id]
 * Get a single trial review by ID
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

    // Check admin role
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, organization_id")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden - Admin only" }, { status: 403 });
    }

    const { id } = await params;

    // Get the review
    const { data: review, error } = await supabase
      .from("sdr_trial_reviews")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !review) {
      return NextResponse.json(
        { error: "Review not found" },
        { status: 404 }
      );
    }

    // Verify SDR is in admin's organization
    const { data: sdrProfile } = await supabase
      .from("user_profiles")
      .select("id, full_name, email, organization_id")
      .eq("id", review.sdr_user_id)
      .single();

    if (!sdrProfile || sdrProfile.organization_id !== profile.organization_id) {
      return NextResponse.json(
        { error: "Review not found" },
        { status: 404 }
      );
    }

    // Enrich with profile info
    const enrichedReview = {
      ...review,
      sdr_name: sdrProfile.full_name,
      sdr_email: sdrProfile.email,
    };

    return NextResponse.json({
      success: true,
      review: enrichedReview,
    });
  } catch (error: any) {
    console.error("Error in trial reviews GET by ID:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


