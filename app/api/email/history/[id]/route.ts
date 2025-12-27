import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/email/history/[id]
 * Update an email (e.g., mark as read)
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
    const body = await request.json();
    
    const updateData: any = {};
    
    if (body.is_read !== undefined) {
      updateData.is_read = body.is_read;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { error } = await supabase
      .from("email_messages")
      .update(updateData)
      .eq("id", id);

    if (error) {
      console.error("Error updating email:", error);
      return NextResponse.json(
        { error: "Failed to update email" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Email updated",
    });
  } catch (error) {
    console.error("Error in PATCH /api/email/history/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/email/history/[id]
 * Delete an email from history
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

    // Soft delete the email - RLS will ensure user can only delete from their organization
    const { error } = await supabase
      .from("email_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error("Error deleting email:", error);
      return NextResponse.json(
        { error: "Failed to delete email" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Email moved to recycle bin",
    });
  } catch (error) {
    console.error("Error in DELETE /api/email/history/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

