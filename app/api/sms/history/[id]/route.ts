import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * DELETE /api/sms/history/[id]
 * Delete an SMS message from history
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

    // Soft delete the SMS message - RLS will ensure user can only delete from their organization
    const { error } = await supabase
      .from("sms_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error("Error deleting SMS message:", error);
      return NextResponse.json(
        { error: "Failed to delete SMS message" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "SMS message moved to recycle bin",
    });
  } catch (error) {
    console.error("Error in DELETE /api/sms/history/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

