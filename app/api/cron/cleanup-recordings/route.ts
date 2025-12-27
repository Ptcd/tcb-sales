import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import twilio from "twilio";

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioClient = twilioAccountSid && twilioAuthToken ? twilio(twilioAccountSid, twilioAuthToken) : null;

/**
 * GET /api/cron/cleanup-recordings
 * Automatically delete call recordings older than retention period (default: 72 hours)
 * Runs daily at 3 AM UTC
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret if set
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceRoleClient();
    const now = new Date();

    // Get all organizations and their retention settings
    const { data: orgSettings, error: orgError } = await supabase
      .from("organization_call_settings")
      .select("organization_id, recording_retention_days, recording_retention_hours");

    if (orgError) {
      console.error("Error fetching organization settings:", orgError);
      return NextResponse.json(
        { error: "Failed to fetch organization settings" },
        { status: 500 }
      );
    }

    let totalDeleted = 0;
    let totalFailed = 0;
    const errors: string[] = [];

    // Process each organization
    for (const orgSetting of orgSettings || []) {
      // COST CONTROL: Use hours-based retention (default 24h instead of 3 days)
      const retentionHours = orgSetting.recording_retention_hours || 24;
      const cutoffDate = new Date(now);
      cutoffDate.setTime(cutoffDate.getTime() - (retentionHours * 60 * 60 * 1000));
      const cutoffISO = cutoffDate.toISOString();

      // Find recordings older than retention period (skip protected ones)
      const { data: oldRecordings, error: recordingsError } = await supabase
        .from("calls")
        .select("id, twilio_recording_sid, organization_id, initiated_at")
        .eq("organization_id", orgSetting.organization_id)
        .not("recording_url", "is", null)
        .not("twilio_recording_sid", "is", null)
        .lt("initiated_at", cutoffISO)
        .or(`recording_protected_until.is.null,recording_protected_until.lt.${now.toISOString()}`);

      if (recordingsError) {
        console.error(`Error fetching recordings for org ${orgSetting.organization_id}:`, recordingsError);
        errors.push(`Failed to fetch recordings for org ${orgSetting.organization_id}`);
        continue;
      }

      if (!oldRecordings || oldRecordings.length === 0) {
        continue;
      }

      console.log(`Found ${oldRecordings.length} recordings to delete for org ${orgSetting.organization_id} (older than ${retentionHours} hours)`);

      // Delete each recording
      for (const recording of oldRecordings) {
        try {
          // Delete from Twilio if we have the recording SID
          if (twilioClient && recording.twilio_recording_sid) {
            try {
              await twilioClient.recordings(recording.twilio_recording_sid).remove();
              console.log(`Deleted Twilio recording: ${recording.twilio_recording_sid}`);
            } catch (twilioError: any) {
              // Recording might already be deleted in Twilio, continue anyway
              console.warn(`Twilio deletion warning for ${recording.twilio_recording_sid}:`, twilioError.message);
            }
          }

          // Clear recording URL and SID from database
          const { error: updateError } = await supabase
            .from("calls")
            .update({
              recording_url: null,
              twilio_recording_sid: null,
            })
            .eq("id", recording.id);

          if (updateError) {
            console.error(`Error updating call ${recording.id}:`, updateError);
            totalFailed++;
            errors.push(`Failed to update call ${recording.id}`);
          } else {
            totalDeleted++;
          }
        } catch (error: any) {
          console.error(`Error processing recording ${recording.id}:`, error);
          totalFailed++;
          errors.push(`Failed to process call ${recording.id}: ${error.message}`);
        }
      }
    }

    // Also handle organizations without custom settings (use default 24 hours)
    const orgsWithSettings = new Set((orgSettings || []).map((o) => o.organization_id));
    const defaultRetentionHours = 24;
    const defaultCutoffDate = new Date(now);
    defaultCutoffDate.setTime(defaultCutoffDate.getTime() - (defaultRetentionHours * 60 * 60 * 1000));
    const defaultCutoffISO = defaultCutoffDate.toISOString();

    // Get all organizations
    const { data: allOrgs } = await supabase
      .from("organizations")
      .select("id");

    if (allOrgs) {
      for (const org of allOrgs) {
        if (orgsWithSettings.has(org.id)) {
          continue; // Already processed
        }

        // Find recordings for orgs without custom settings (skip protected ones)
        const { data: oldRecordings, error: recordingsError } = await supabase
          .from("calls")
          .select("id, twilio_recording_sid, organization_id, initiated_at")
          .eq("organization_id", org.id)
          .not("recording_url", "is", null)
          .not("twilio_recording_sid", "is", null)
          .lt("initiated_at", defaultCutoffISO)
          .or(`recording_protected_until.is.null,recording_protected_until.lt.${now.toISOString()}`);

        if (recordingsError) {
          console.error(`Error fetching recordings for org ${org.id}:`, recordingsError);
          continue;
        }

        if (!oldRecordings || oldRecordings.length === 0) {
          continue;
        }

        console.log(`Found ${oldRecordings.length} recordings to delete for org ${org.id} (default retention: ${defaultRetentionHours} hours)`);

        // Delete each recording
        for (const recording of oldRecordings) {
          try {
            // Delete from Twilio
            if (twilioClient && recording.twilio_recording_sid) {
              try {
                await twilioClient.recordings(recording.twilio_recording_sid).remove();
              } catch (twilioError: any) {
                console.warn(`Twilio deletion warning for ${recording.twilio_recording_sid}:`, twilioError.message);
              }
            }

            // Clear from database
            const { error: updateError } = await supabase
              .from("calls")
              .update({
                recording_url: null,
                twilio_recording_sid: null,
              })
              .eq("id", recording.id);

            if (updateError) {
              totalFailed++;
              errors.push(`Failed to update call ${recording.id}`);
            } else {
              totalDeleted++;
            }
          } catch (error: any) {
            totalFailed++;
            errors.push(`Failed to process call ${recording.id}: ${error.message}`);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Cleanup completed: ${totalDeleted} recordings deleted, ${totalFailed} failed`,
      deleted: totalDeleted,
      failed: totalFailed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("Error in cleanup-recordings cron:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cron/cleanup-recordings
 * Manual trigger for testing
 */
export async function POST(request: NextRequest) {
  return GET(request);
}

