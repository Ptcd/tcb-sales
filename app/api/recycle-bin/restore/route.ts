import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/recycle-bin/restore
 * Restores a soft-deleted item by setting deleted_at to NULL
 */
export async function POST(request: NextRequest) {
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

    // Determine which table to update based on type
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

    // Restore the item by setting deleted_at to null
    const { error } = await supabase
      .from(tableName)
      .update({ deleted_at: null })
      .eq("id", id)
      .not("deleted_at", "is", null); // Ensure item was actually deleted

    if (error) {
      console.error(`Error restoring ${type}:`, error);
      return NextResponse.json(
        { error: `Failed to restore ${type}` },
        { status: 500 }
      );
    }

    // If restoring search history, also restore associated search results
    if (type === "search_history") {
      await supabase
        .from("search_results")
        .update({ deleted_at: null })
        .eq("search_history_id", id);
    }

    return NextResponse.json({
      success: true,
      message: `${type === "lead" ? "Lead" : type.charAt(0).toUpperCase() + type.slice(1)} restored successfully`,
    });
  } catch (error) {
    console.error("Error in restore API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

