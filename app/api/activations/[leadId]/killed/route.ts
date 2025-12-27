import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncWorkflowToJCC, mapCRMKillReasonToJCC } from "@/lib/jcc-activation-api";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { reason, kill_reason, notes } = await request.json();
    const { leadId } = await params;

    // Get jcc_user_id before updating
    const { data: pipeline } = await supabase
      .from("trial_pipeline")
      .select("jcc_user_id")
      .eq("crm_lead_id", leadId)
      .single();

    const killedAt = new Date().toISOString();

    await supabase
      .from("trial_pipeline")
      .update({
        activation_status: 'killed',
        marked_lost_at: killedAt,
        lost_reason: notes || reason || "No reason provided",
        activation_kill_reason: kill_reason || null,
      })
      .eq("crm_lead_id", leadId);

    await supabase
      .from("search_results")
      .update({ badge_key: "recycle_not_interested" })
      .eq("id", leadId);

    // Sync to JCC (non-blocking)
    if (pipeline?.jcc_user_id) {
      syncWorkflowToJCC({
        user_id: pipeline.jcc_user_id,
        activation_status: 'killed',
        killed_at: killedAt,
        kill_reason: kill_reason ? mapCRMKillReasonToJCC(kill_reason) : 'other',
        kill_note: notes || reason || null,
      }).then(result => {
        if (result.success) {
          console.log(`[JCC Sync] Kill synced for ${pipeline.jcc_user_id}`);
        } else {
          console.error(`[JCC Sync] Failed to sync kill: ${result.error}`);
        }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
