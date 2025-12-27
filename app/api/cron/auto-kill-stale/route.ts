import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/cron/auto-kill-stale
 * 
 * Auto-kill stale pipelines based on rules:
 * - blocked > 14 days → kill (stalled_install)
 * - no_show_count >= 2 → kill (repeated_no_show) 
 * - reschedule_count >= 3 → kill (excessive_reschedules)
 * 
 * Run daily via cron
 */

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createServiceRoleClient();
    const now = new Date();
    const nowISO = now.toISOString();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const results = {
      stalledInstalls: 0,
      repeatedNoShows: 0,
      excessiveReschedules: 0,
      errors: [] as string[],
    };

    // 1. Kill blocked pipelines > 14 days old
    const { data: stalledPipelines, error: stalledError } = await supabase
      .from("trial_pipeline")
      .select("id")
      .eq("activation_status", "blocked")
      .lte("next_followup_at", fourteenDaysAgo)
      .is("marked_lost_at", null);

    if (stalledError) {
      results.errors.push(`Stalled query error: ${stalledError.message}`);
    } else if (stalledPipelines && stalledPipelines.length > 0) {
      const ids = stalledPipelines.map(p => p.id);
      
      const { error: updateError } = await supabase
        .from("trial_pipeline")
        .update({
          activation_status: "killed",
          marked_lost_at: nowISO,
          activation_kill_reason: "stalled_install",
          followup_owner_role: null,
          next_followup_at: null,
        })
        .in("id", ids);

      if (updateError) {
        results.errors.push(`Stalled update error: ${updateError.message}`);
      } else {
        results.stalledInstalls = ids.length;

        // Create events for each
        await Promise.all(ids.map(id => 
          supabase.from("activation_events").insert({
            trial_pipeline_id: id,
            event_type: "auto_killed",
            metadata: { reason: "stalled_install", triggered_by: "cron" },
          })
        ));
      }
    }

    // 2. Kill pipelines with no_show_count >= 2
    // Note: This should already be handled at completion time, but this is a safety net
    const { data: noShowPipelines, error: noShowError } = await supabase
      .from("trial_pipeline")
      .select("id")
      .gte("no_show_count", 2)
      .neq("activation_status", "killed")
      .neq("activation_status", "active");

    if (noShowError) {
      results.errors.push(`No-show query error: ${noShowError.message}`);
    } else if (noShowPipelines && noShowPipelines.length > 0) {
      const ids = noShowPipelines.map(p => p.id);
      
      const { error: updateError } = await supabase
        .from("trial_pipeline")
        .update({
          activation_status: "killed",
          marked_lost_at: nowISO,
          activation_kill_reason: "repeated_no_show",
          followup_owner_role: null,
          next_followup_at: null,
        })
        .in("id", ids);

      if (updateError) {
        results.errors.push(`No-show update error: ${updateError.message}`);
      } else {
        results.repeatedNoShows = ids.length;

        await Promise.all(ids.map(id => 
          supabase.from("activation_events").insert({
            trial_pipeline_id: id,
            event_type: "auto_killed",
            metadata: { reason: "repeated_no_show", triggered_by: "cron" },
          })
        ));
      }
    }

    // 3. Kill pipelines with reschedule_count >= 3
    const { data: reschedulePipelines, error: rescheduleError } = await supabase
      .from("trial_pipeline")
      .select("id")
      .gte("reschedule_count", 3)
      .neq("activation_status", "killed")
      .neq("activation_status", "active");

    if (rescheduleError) {
      results.errors.push(`Reschedule query error: ${rescheduleError.message}`);
    } else if (reschedulePipelines && reschedulePipelines.length > 0) {
      const ids = reschedulePipelines.map(p => p.id);
      
      const { error: updateError } = await supabase
        .from("trial_pipeline")
        .update({
          activation_status: "killed",
          marked_lost_at: nowISO,
          activation_kill_reason: "excessive_reschedules",
          followup_owner_role: null,
          next_followup_at: null,
        })
        .in("id", ids);

      if (updateError) {
        results.errors.push(`Reschedule update error: ${updateError.message}`);
      } else {
        results.excessiveReschedules = ids.length;

        await Promise.all(ids.map(id => 
          supabase.from("activation_events").insert({
            trial_pipeline_id: id,
            event_type: "auto_killed",
            metadata: { reason: "excessive_reschedules", triggered_by: "cron" },
          })
        ));
      }
    }

    const totalKilled = results.stalledInstalls + results.repeatedNoShows + results.excessiveReschedules;

    console.log(`[Auto-Kill Cron] Killed ${totalKilled} pipelines:`, results);

    return NextResponse.json({
      success: true,
      timestamp: nowISO,
      killed: {
        total: totalKilled,
        stalledInstalls: results.stalledInstalls,
        repeatedNoShows: results.repeatedNoShows,
        excessiveReschedules: results.excessiveReschedules,
      },
      errors: results.errors.length > 0 ? results.errors : undefined,
    });
  } catch (error: any) {
    console.error("Error in auto-kill cron:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


