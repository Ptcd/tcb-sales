import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/users
 * Get users in organization for routing
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

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id, role, is_activator")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && !profile.is_activator)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: users } = await supabase
      .from("user_profiles")
      .select("id, full_name, email, role, is_activator")
      .eq("organization_id", profile.organization_id)
      .order("full_name");

    return NextResponse.json({ users: users || [] });
  } catch (error: any) {
    console.error("Error getting users:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

