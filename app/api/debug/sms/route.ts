import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/debug/sms
 * Debug endpoint to see what SMS messages exist
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

    // Get user's organization
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id || profile.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const serviceSupabase = createServiceRoleClient();

    // Get ALL messages
    const { data: allMessages, error: allError } = await serviceSupabase
      .from("sms_messages")
      .select("id, lead_id, direction, message, sent_at, organization_id, is_read, phone_number")
      .order("sent_at", { ascending: false })
      .limit(50);

    // Get messages for this org specifically
    const { data: orgMessages, error: orgError } = await serviceSupabase
      .from("sms_messages")
      .select("id, lead_id, direction, message, sent_at, organization_id, is_read, phone_number")
      .eq("organization_id", profile.organization_id)
      .order("sent_at", { ascending: false })
      .limit(50);

    // Get all leads with phones for this org
    const { data: leads } = await serviceSupabase
      .from("search_results")
      .select("id, name, phone, organization_id")
      .eq("organization_id", profile.organization_id)
      .not("phone", "is", null)
      .limit(50);

    return NextResponse.json({
      success: true,
      organizationId: profile.organization_id,
      allMessagesCount: allMessages?.length || 0,
      allMessages: allMessages?.map(m => ({
        id: m.id,
        lead_id: m.lead_id,
        organization_id: m.organization_id,
        phone_number: m.phone_number,
        direction: m.direction,
        message: m.message?.substring(0, 50),
        sent_at: m.sent_at,
      })),
      orgMessagesCount: orgMessages?.length || 0,
      orgMessages: orgMessages?.map(m => ({
        id: m.id,
        lead_id: m.lead_id,
        phone_number: m.phone_number,
        direction: m.direction,
      })),
      leadsCount: leads?.length || 0,
      leads: leads?.map(l => ({
        id: l.id,
        name: l.name,
        phone: l.phone,
      })),
    });
  } catch (error: any) {
    console.error("Debug error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

