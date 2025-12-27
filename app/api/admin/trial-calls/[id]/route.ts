import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/admin/trial-calls/[id]
 * 
 * Update the conversion_quality_tag for a trial-resulted call
 * Admin only
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

    // Verify admin role
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

    const { id } = await params;
    const body = await request.json();
    const { qualityTag } = body;

    // Validate quality tag
    const validTags = ["strong", "average", "email_grab", "forced", "unknown"];
    if (qualityTag && !validTags.includes(qualityTag)) {
      return NextResponse.json(
        { error: `Invalid quality tag. Must be one of: ${validTags.join(", ")}` },
        { status: 400 }
      );
    }

    // Verify call exists and belongs to organization
    const { data: call, error: callError } = await supabase
      .from("calls")
      .select("id, organization_id, outcome_code")
      .eq("id", id)
      .single();

    if (callError || !call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    if (call.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify it's a trial-resulted call
    if (call.outcome_code !== "TRIAL_STARTED") {
      return NextResponse.json(
        { error: "This call did not result in a trial" },
        { status: 400 }
      );
    }

    // Update quality tag
    const { data: updatedCall, error: updateError } = await supabase
      .from("calls")
      .update({ conversion_quality_tag: qualityTag || "unknown" })
      .eq("id", id)
      .select("id, conversion_quality_tag")
      .single();

    if (updateError) {
      console.error("Error updating quality tag:", updateError);
      return NextResponse.json(
        { error: "Failed to update quality tag" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      call: updatedCall,
    });
  } catch (error: any) {
    console.error("Error in PATCH /api/admin/trial-calls/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


