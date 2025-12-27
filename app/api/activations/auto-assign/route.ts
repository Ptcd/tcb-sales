import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const serviceSupabase = createServiceRoleClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    // Count activators in this organization (only is_activator = true)
    const { data: activators } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("organization_id", profile.organization_id)
      .eq("is_activator", true);

    if (!activators || activators.length !== 1) {
      // Multiple activators or none - do not batch assign
      return NextResponse.json({ 
        assigned: 0, 
        reason: activators?.length === 0 ? "no_activators" : "multiple_activators" 
      });
    }

    // Exactly 1 activator - batch assign all unassigned non-terminal trials
    const singleActivatorId = activators[0].id;

    const { data: updated, error } = await serviceSupabase
      .from("trial_pipeline")
      .update({ assigned_activator_id: singleActivatorId })
      .is("assigned_activator_id", null)
      .not("activation_status", "in", "(activated,killed)")
      .select("id");

    if (error) {
      console.error("Auto-assign error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const count = updated?.length || 0;
    console.log(`[Auto-Assign] Assigned ${count} trials to ${singleActivatorId}`);

    return NextResponse.json({ 
      assigned: count, 
      activator_id: singleActivatorId 
    });
  } catch (error: any) {
    console.error("Auto-assign error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

