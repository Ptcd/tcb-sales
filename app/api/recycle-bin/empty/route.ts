import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * DELETE /api/recycle-bin/empty
 * Permanently deletes ALL soft-deleted items in the organization's recycle bin
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

    // Get user's organization ID
    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!userProfile?.organization_id) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // Permanently delete all soft-deleted items from each table
    // RLS will ensure we only delete from the user's organization
    
    const tables = [
      "search_history",
      "search_results",
      "sms_messages",
      "email_messages",
      "calls",
    ];

    let totalDeleted = 0;

    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .delete()
        .not("deleted_at", "is", null)
        .select("id");

      if (error) {
        console.error(`Error emptying ${table}:`, error);
      } else {
        totalDeleted += data?.length || 0;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Recycle bin emptied (${totalDeleted} items permanently deleted)`,
      deletedCount: totalDeleted,
    });
  } catch (error) {
    console.error("Error emptying recycle bin:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

