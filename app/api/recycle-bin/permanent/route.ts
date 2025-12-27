import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * DELETE /api/recycle-bin/permanent
 * Permanently deletes a soft-deleted item (cannot be undone)
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, type } = await request.json();

    if (!id || !type) {
      return NextResponse.json(
        { error: "Item ID and type are required" },
        { status: 400 }
      );
    }

    // Determine which table to delete from based on type
    let tableName: string;
    switch (type) {
      case "search_history":
        tableName = "search_history";
        break;
      case "lead":
        tableName = "search_results";
        break;
      case "sms":
        tableName = "sms_messages";
        break;
      case "email":
        tableName = "email_messages";
        break;
      case "call":
        tableName = "calls";
        break;
      default:
        return NextResponse.json(
          { error: "Invalid item type" },
          { status: 400 }
        );
    }

    // Permanently delete the item (only if it was soft-deleted)
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq("id", id)
      .not("deleted_at", "is", null); // Only delete items that were already soft-deleted

    if (error) {
      console.error(`Error permanently deleting ${type}:`, error);
      return NextResponse.json(
        { error: `Failed to permanently delete ${type}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `${type === "lead" ? "Lead" : type.charAt(0).toUpperCase() + type.slice(1)} permanently deleted`,
    });
  } catch (error) {
    console.error("Error in permanent delete API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

