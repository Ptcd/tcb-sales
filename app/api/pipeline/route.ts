import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") || "followups";
    const isAdmin = profile.role === "admin";

    let query = supabase
      .from("search_results")
      .select(`
        id, name, phone, email, address, website,
        badge_key, do_not_contact, owner_sdr_id, next_follow_up_at,
        lead_status, last_contacted_at, created_at, updated_at,
        trial_pipeline(*)
      `)
      .eq("organization_id", profile.organization_id)
      .eq("do_not_contact", false);

    switch (view) {
      case "followups":
        query = query
          .lte("next_follow_up_at", new Date().toISOString())
          .eq("owner_sdr_id", user.id)
          .order("next_follow_up_at", { ascending: true });
        break;
      case "trials":
        query = query
          .like("badge_key", "trial_%")
          .eq("owner_sdr_id", user.id)
          .order("next_follow_up_at", { ascending: true });
        break;
      case "converted":
        const weekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString();
        query = query
          .eq("badge_key", "converted_recent")
          .eq("owner_sdr_id", user.id)
          .gte("updated_at", weekAgo)
          .order("updated_at", { ascending: false });
        break;
      case "all-trials":
        if (!isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
        query = query.like("badge_key", "trial_%").order("next_follow_up_at");
        break;
      case "stalled":
        if (!isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
        query = query.eq("badge_key", "trial_stalled").order("next_follow_up_at");
        break;
      case "by-sdr":
        if (!isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
        query = query.not("owner_sdr_id", "is", null).order("owner_sdr_id");
        break;
    }

    const { data: leads, error } = await query.limit(200);
    if (error) {
      console.error("Pipeline error:", error);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    return NextResponse.json({ success: true, leads: leads || [], view, isAdmin });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


