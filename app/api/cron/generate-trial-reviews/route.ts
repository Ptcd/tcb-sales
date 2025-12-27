import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/cron/generate-trial-reviews
 * Generate trial review records for SDRs who had activity today
 * Runs daily at 5pm America/Chicago (22:00 or 23:00 UTC depending on DST)
 * 
 * Logic:
 * 1. Find SDRs who made calls OR had trial_started events today
 * 2. Pull metrics from daily_sdr_summaries (or compute if missing)
 * 3. Upsert into sdr_trial_reviews (preserving existing decisions)
 * 4. Create admin notifications for pending reviews
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
    
    // Get today's date in America/Chicago timezone
    // We use this to determine what "today" means for the business
    const chicagoDate = new Date().toLocaleDateString("en-CA", { 
      timeZone: "America/Chicago" 
    }); // Returns YYYY-MM-DD format
    
    console.log(`[Trial Reviews] Running for date: ${chicagoDate}`);

    // Get start and end of day in UTC for queries
    const startOfDay = new Date(chicagoDate + "T00:00:00-06:00"); // CST
    const endOfDay = new Date(chicagoDate + "T23:59:59-06:00");

    // Find candidate SDRs: those who made calls OR had trial events today
    // First, get SDRs who made calls today
    const { data: callActivity, error: callError } = await supabase
      .from("calls")
      .select("user_id")
      .gte("initiated_at", startOfDay.toISOString())
      .lte("initiated_at", endOfDay.toISOString())
      .not("user_id", "is", null);

    if (callError) {
      console.error("[Trial Reviews] Error fetching call activity:", callError);
    }

    // Get SDRs who had trial_started events today
    const { data: trialActivity, error: trialError } = await supabase
      .from("lead_notifications")
      .select("sdr_user_id")
      .eq("event_type", "trial_started")
      .gte("created_at", startOfDay.toISOString())
      .lte("created_at", endOfDay.toISOString());

    if (trialError) {
      console.error("[Trial Reviews] Error fetching trial activity:", trialError);
    }

    // Combine unique SDR IDs
    const sdrIdsFromCalls = (callActivity || []).map(c => c.user_id);
    const sdrIdsFromTrials = (trialActivity || []).map(t => t.sdr_user_id);
    const uniqueSdrIds = [...new Set([...sdrIdsFromCalls, ...sdrIdsFromTrials])].filter(Boolean);

    if (uniqueSdrIds.length === 0) {
      console.log("[Trial Reviews] No SDR activity found for today");
      return NextResponse.json({
        success: true,
        message: "No SDR activity found for today",
        reviews_created: 0,
        notifications_sent: 0,
      });
    }

    console.log(`[Trial Reviews] Found ${uniqueSdrIds.length} SDRs with activity`);

    // Get SDR profiles for the candidates
    const { data: sdrProfiles } = await supabase
      .from("user_profiles")
      .select("id, email, full_name, organization_id, role")
      .in("id", uniqueSdrIds);

    // Filter to only member role (actual SDRs, not admins)
    const sdrs = (sdrProfiles || []).filter(p => p.role === "member");
    
    if (sdrs.length === 0) {
      console.log("[Trial Reviews] No SDR members found in activity list");
      return NextResponse.json({
        success: true,
        message: "No SDR members found",
        reviews_created: 0,
        notifications_sent: 0,
      });
    }

    let reviewsCreated = 0;
    let reviewsUpdated = 0;
    const errors: string[] = [];
    const orgsPendingReviews = new Map<string, number>();

    for (const sdr of sdrs) {
      try {
        // First, check if we have daily_sdr_summaries data for this SDR + date
        const { data: existingSummary } = await supabase
          .from("daily_sdr_summaries")
          .select("*")
          .eq("sdr_user_id", sdr.id)
          .eq("date", chicagoDate)
          .single();

        // Compute metrics - prefer summary data, fall back to direct queries
        let metrics = {
          calls: 0,
          conversations: 0,
          cta_attempts: 0,
          trials_started: 0,
        };

        if (existingSummary) {
          metrics = {
            calls: existingSummary.total_dials || 0,
            conversations: existingSummary.conversations || 0,
            cta_attempts: existingSummary.cta_attempts || 0,
            trials_started: existingSummary.trials_started || 0,
          };
        } else {
          // Direct query for metrics if no summary exists yet
          // Count calls
          const { count: callCount } = await supabase
            .from("calls")
            .select("*", { count: "exact", head: true })
            .eq("user_id", sdr.id)
            .gte("initiated_at", startOfDay.toISOString())
            .lte("initiated_at", endOfDay.toISOString());

          // Count conversations (calls >= 30 seconds)
          const { count: convoCount } = await supabase
            .from("calls")
            .select("*", { count: "exact", head: true })
            .eq("user_id", sdr.id)
            .gte("initiated_at", startOfDay.toISOString())
            .lte("initiated_at", endOfDay.toISOString())
            .gte("duration", 30);

          // Count CTA attempts
          const { count: ctaCount } = await supabase
            .from("calls")
            .select("*", { count: "exact", head: true })
            .eq("user_id", sdr.id)
            .eq("cta_attempted", true)
            .gte("initiated_at", startOfDay.toISOString())
            .lte("initiated_at", endOfDay.toISOString());

          // Count trials started
          const { count: trialCount } = await supabase
            .from("lead_notifications")
            .select("*", { count: "exact", head: true })
            .eq("sdr_user_id", sdr.id)
            .eq("event_type", "trial_started")
            .gte("created_at", startOfDay.toISOString())
            .lte("created_at", endOfDay.toISOString());

          metrics = {
            calls: callCount || 0,
            conversations: convoCount || 0,
            cta_attempts: ctaCount || 0,
            trials_started: trialCount || 0,
          };
        }

        // Skip if no meaningful activity
        if (metrics.calls === 0 && metrics.trials_started === 0) {
          console.log(`[Trial Reviews] Skipping ${sdr.email} - no activity`);
          continue;
        }

        // Check if review already exists for this SDR + date
        const { data: existingReview } = await supabase
          .from("sdr_trial_reviews")
          .select("id, decision")
          .eq("sdr_user_id", sdr.id)
          .eq("date", chicagoDate)
          .single();

        if (existingReview) {
          // Update metrics but preserve decision/notes
          const { error: updateError } = await supabase
            .from("sdr_trial_reviews")
            .update({
              calls: metrics.calls,
              conversations: metrics.conversations,
              cta_attempts: metrics.cta_attempts,
              trials_started: metrics.trials_started,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingReview.id);

          if (updateError) {
            console.error(`[Trial Reviews] Error updating review for ${sdr.email}:`, updateError);
            errors.push(`Update failed for ${sdr.email}`);
          } else {
            reviewsUpdated++;
            // Track pending reviews per org
            if (!existingReview.decision && sdr.organization_id) {
              orgsPendingReviews.set(
                sdr.organization_id,
                (orgsPendingReviews.get(sdr.organization_id) || 0) + 1
              );
            }
          }
        } else {
          // Insert new review
          const { error: insertError } = await supabase
            .from("sdr_trial_reviews")
            .insert({
              sdr_user_id: sdr.id,
              date: chicagoDate,
              calls: metrics.calls,
              conversations: metrics.conversations,
              cta_attempts: metrics.cta_attempts,
              trials_started: metrics.trials_started,
              decision: null,
              admin_notes: null,
              reviewed_by_user_id: null,
              reviewed_at: null,
            });

          if (insertError) {
            console.error(`[Trial Reviews] Error inserting review for ${sdr.email}:`, insertError);
            errors.push(`Insert failed for ${sdr.email}`);
          } else {
            reviewsCreated++;
            // Track pending reviews per org
            if (sdr.organization_id) {
              orgsPendingReviews.set(
                sdr.organization_id,
                (orgsPendingReviews.get(sdr.organization_id) || 0) + 1
              );
            }
          }
        }
      } catch (sdrError: any) {
        console.error(`[Trial Reviews] Error processing ${sdr.email}:`, sdrError);
        errors.push(`Processing failed for ${sdr.email}: ${sdrError.message}`);
      }
    }

    // Create admin notifications for orgs with pending reviews
    let notificationsSent = 0;
    for (const [orgId, pendingCount] of orgsPendingReviews.entries()) {
      if (pendingCount > 0) {
        try {
          // Get all admins in this org
          const { data: admins } = await supabase
            .from("user_profiles")
            .select("id")
            .eq("organization_id", orgId)
            .eq("role", "admin");

          for (const admin of admins || []) {
            // Check if notification already exists for today
            const { data: existingNotif } = await supabase
              .from("admin_notifications")
              .select("id")
              .eq("user_id", admin.id)
              .eq("type", "trial_review_pending")
              .gte("created_at", startOfDay.toISOString())
              .single();

            if (!existingNotif) {
              const { error: notifError } = await supabase
                .from("admin_notifications")
                .insert({
                  user_id: admin.id,
                  type: "trial_review_pending",
                  title: "SDR Trial Reviews Pending",
                  message: `You have ${pendingCount} SDR trial ${pendingCount === 1 ? "day" : "days"} to review`,
                  link: `/dashboard/admin/performance?tab=sdr-trial-review&date=${chicagoDate}`,
                  read: false,
                });

              if (!notifError) {
                notificationsSent++;
              }
            }
          }
        } catch (notifErr: any) {
          console.error(`[Trial Reviews] Error creating notifications for org ${orgId}:`, notifErr);
        }
      }
    }

    console.log(`[Trial Reviews] Complete: ${reviewsCreated} created, ${reviewsUpdated} updated, ${notificationsSent} notifications`);

    return NextResponse.json({
      success: true,
      message: `Generated ${reviewsCreated} new reviews, updated ${reviewsUpdated} existing`,
      date: chicagoDate,
      reviews_created: reviewsCreated,
      reviews_updated: reviewsUpdated,
      notifications_sent: notificationsSent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("[Trial Reviews] Fatal error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cron/generate-trial-reviews
 * Manual trigger for testing
 */
export async function POST(request: NextRequest) {
  return GET(request);
}


