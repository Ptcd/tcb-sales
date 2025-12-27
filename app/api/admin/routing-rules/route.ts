import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/routing-rules
 * Get routing rules for organization
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
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: rules } = await supabase
      .from("call_routing_rules")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("priority", { ascending: false });

    return NextResponse.json(rules || []);
  } catch (error: any) {
    console.error("Error getting routing rules:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/routing-rules
 * Create a new routing rule
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

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();

    const { data, error } = await supabase
      .from("call_routing_rules")
      .insert({
        organization_id: profile.organization_id,
        rule_name: body.rule_name,
        priority: body.priority || 0,
        is_active: body.is_active !== false,
        business_hours_start: body.business_hours_start || null,
        business_hours_end: body.business_hours_end || null,
        business_days: body.business_days || null,
        route_to_user_id: body.route_to_user_id || null,
        route_to_phone: body.route_to_phone || null,
        route_to_voicemail: body.route_to_voicemail || false,
        voicemail_message: body.voicemail_message || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating routing rule:", error);
      return NextResponse.json(
        { error: "Failed to create routing rule" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error creating routing rule:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/routing-rules
 * Update a routing rule
 */
export async function PUT(request: NextRequest) {
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
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: "Rule ID is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("call_routing_rules")
      .update({
        rule_name: body.rule_name,
        priority: body.priority,
        is_active: body.is_active,
        business_hours_start: body.business_hours_start || null,
        business_hours_end: body.business_hours_end || null,
        business_days: body.business_days || null,
        route_to_user_id: body.route_to_user_id || null,
        route_to_phone: body.route_to_phone || null,
        route_to_voicemail: body.route_to_voicemail || false,
        voicemail_message: body.voicemail_message || null,
      })
      .eq("id", body.id)
      .eq("organization_id", profile.organization_id)
      .select()
      .single();

    if (error) {
      console.error("Error updating routing rule:", error);
      return NextResponse.json(
        { error: "Failed to update routing rule" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error updating routing rule:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

