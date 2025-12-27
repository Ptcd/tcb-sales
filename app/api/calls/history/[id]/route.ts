import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * DELETE /api/calls/history/[id]
 * Delete a call from history
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

    // Soft delete the call - RLS will ensure user can only delete from their organization
    const { error } = await supabase
      .from("calls")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error("Error deleting call:", error);
      return NextResponse.json(
        { error: "Failed to delete call" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Call moved to recycle bin",
    });
  } catch (error) {
    console.error("Error in DELETE /api/calls/history/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

