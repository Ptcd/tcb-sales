import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * DELETE /api/voicemails/[id]
 * Deletes a voicemail/call record if it belongs to the user's organization.
 */
export async function DELETE(
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

    const { id } = await params;

    // Get user's organization
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    // Verify the call belongs to the org
    const { data: call, error: fetchError } = await supabase
      .from("calls")
      .select("id, organization_id")
      .eq("id", id)
      .single();

    if (fetchError || !call || call.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: "Voicemail not found" }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from("calls")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("Error deleting voicemail:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete voicemail" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting voicemail:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/voicemails/[id]
 * Mark voicemail as read
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

    const { id } = await params;

    // Mark as read (is_new = false)
    const { error } = await supabase
      .from("calls")
      .update({ is_new: false })
      .eq("id", id);

    if (error) {
      console.error("Error marking voicemail as read:", error);
      return NextResponse.json(
        { error: "Failed to mark as read" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Voicemail marked as read",
    });
  } catch (error) {
    console.error("Error in voicemail update API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


