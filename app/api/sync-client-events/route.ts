import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/sync-client-events
 * Sync job to consume client_events from Control Tower and update CRM leads
 * 
 * This endpoint:
 * 1. Fetches unprocessed client_events
 * 2. Joins with sdr_client_links to find the CRM lead and SDR
 * 3. Creates lead_notifications for the SDR
 * 4. Updates the lead's client_status based on event_type
 * 5. Marks events as processed
 * 
 * Only processes events for leads in the "Junk Car Calculator" campaign
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret if set (for Vercel Cron)
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    // Get the Junk Car Calculator campaign ID
    const { data: jccCampaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id")
      .eq("name", "Junk Car Calculator")
      .single();

    if (campaignError || !jccCampaign) {
      console.log("Junk Car Calculator campaign not found, skipping sync");
      return NextResponse.json({
        success: true,
        message: "Junk Car Calculator campaign not found",
        processed: 0,
        skipped: 0,
      });
    }

    const jccCampaignId = jccCampaign.id;

    // Fetch unprocessed events
    const { data: events, error: eventsError } = await supabase
      .from("client_events")
      .select("*")
      .eq("processed", false)
      .order("created_at", { ascending: true })
      .limit(100); // Process in batches

    if (eventsError) {
      console.error("Error fetching client_events:", eventsError);
      return NextResponse.json(
        { error: "Failed to fetch events" },
        { status: 500 }
      );
    }

    if (!events || events.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No unprocessed events",
        processed: 0,
        skipped: 0,
      });
    }

    let processed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const event of events) {
      try {
        // Find the sdr_client_link for this user_id
        const { data: link, error: linkError } = await supabase
          .from("sdr_client_links")
          .select("crm_lead_id, sdr_user_id")
          .eq("user_id", event.user_id)
          .single();

        if (linkError || !link) {
          console.log(`No sdr_client_link found for user_id ${event.user_id}, skipping event ${event.id}`);
          skipped++;
          // Mark as processed anyway to avoid re-processing orphan events
          await supabase
            .from("client_events")
            .update({ processed: true })
            .eq("id", event.id);
          continue;
        }

        // Verify the lead is in the JCC campaign
        const { data: campaignLead, error: campaignLeadError } = await supabase
          .from("campaign_leads")
          .select("id")
          .eq("lead_id", link.crm_lead_id)
          .eq("campaign_id", jccCampaignId)
          .single();

        if (campaignLeadError || !campaignLead) {
          console.log(`Lead ${link.crm_lead_id} not in JCC campaign, skipping event ${event.id}`);
          skipped++;
          await supabase
            .from("client_events")
            .update({ processed: true })
            .eq("id", event.id);
          continue;
        }

        // Insert lead_notification
        const { error: notificationError } = await supabase
          .from("lead_notifications")
          .insert({
            lead_id: link.crm_lead_id,
            sdr_user_id: link.sdr_user_id,
            event_type: event.event_type,
            payload: event.payload || {},
          });

        if (notificationError) {
          console.error(`Error inserting notification for event ${event.id}:`, notificationError);
          errors.push(`Notification insert failed for event ${event.id}`);
        }

        // Update the lead's client_status based on event_type
        const updateData = getLeadUpdateFromEvent(event.event_type, event.payload);
        
        if (updateData) {
          const { error: updateError } = await supabase
            .from("search_results")
            .update(updateData)
            .eq("id", link.crm_lead_id);

          if (updateError) {
            console.error(`Error updating lead ${link.crm_lead_id}:`, updateError);
            errors.push(`Lead update failed for ${link.crm_lead_id}`);
          }
        }

        // Mark event as processed
        await supabase
          .from("client_events")
          .update({ processed: true })
          .eq("id", event.id);

        processed++;
      } catch (error: any) {
        console.error(`Error processing event ${event.id}:`, error);
        errors.push(`Event ${event.id}: ${error.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${processed} events, skipped ${skipped}`,
      processed,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("Error in sync-client-events:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Convert event_type to lead update fields
 */
function getLeadUpdateFromEvent(
  eventType: string,
  payload: any
): Record<string, any> | null {
  const now = new Date().toISOString();
  
  switch (eventType) {
    case "trial_started":
      return {
        client_status: "trialing",
        client_plan: payload?.plan || null,
        client_trial_ends_at: payload?.trial_ends_at || null,
      };

    case "password_set":
      // User set password - activation gate passed
      return {
        client_status: "password_set",
      };

    case "first_login":
      // User logged in for the first time
      return {
        client_status: "trial_activated",
        client_activated_at: now,
      };

    case "calculator_viewed":
      // User viewed calculator settings - engagement signal
      return {
        client_status: "calculator_viewed",
      };

    case "calculator_modified":
      // User saved changes to calculator - high engagement
      return {
        client_status: "trial_activated",
        client_activated_at: now,
      };

    case "embed_snippet_copied":
      // User copied embed code - they're ready to install
      return {
        client_status: "snippet_copied",
      };

    case "first_lead_received":
      // First real lead came in - this is the key conversion event!
      // Store source_url in payload, lead_id is the JCC lead ID (not CRM lead ID)
      return {
        client_status: "snippet_installed",
        client_snippet_installed_at: now,
        client_snippet_domain: payload?.source_url ? new URL(payload.source_url).hostname : null,
      };

    // Legacy event handling (backward compatibility)
    case "trial_activated":
      // Map old trial_activated to new events based on activation_type
      return {
        client_status: "trial_activated",
        client_activated_at: now,
      };

    case "snippet_installed":
      // Legacy: map to embed_snippet_copied behavior
      return {
        client_status: "snippet_installed",
        client_snippet_installed_at: now,
        client_snippet_domain: payload?.website_domain || null,
      };

    case "trial_qualified":
      return {
        client_status: "trial_qualified",
      };

    case "credits_low":
      return {
        client_status: "credits_low",
        client_credits_left: payload?.credits_remaining ?? payload?.credits_left ?? null,
        client_plan: payload?.plan || undefined, // Keep existing if not provided
      };

    case "trial_expiring":
      return {
        client_status: "trial_expiring",
        client_trial_ends_at: payload?.trial_ends_at || null,
      };

    case "paid_subscribed":
      return {
        client_status: "paid",
        client_plan: payload?.plan || null,
        client_credits_left: null, // Clear credits on paid subscription
        client_mrr: payload?.mrr || null,
        client_paid_at: now,
      };

    default:
      console.log(`Unknown event_type: ${eventType}`);
      return null;
  }
}

/**
 * POST /api/sync-client-events
 * Manual trigger for the sync job (useful for testing)
 */
export async function POST(request: NextRequest) {
  // Reuse GET handler for manual triggers
  return GET(request);
}

