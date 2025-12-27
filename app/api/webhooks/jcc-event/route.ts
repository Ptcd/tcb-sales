import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getBadgeFromJccEvent, calculateFollowUpDate } from "@/lib/badges";
import { JCC_FEATURES_ENABLED } from "@/lib/config";
import { recordPerformanceEvent } from "@/lib/governance/record-event";

/**
 * POST /api/webhooks/jcc-event
 * 
 * Webhook called by the Junk Car Calculator app when lifecycle events occur.
 * This inserts the event into client_events table for the sync job to process.
 * 
 * Request body:
 * {
 *   user_id: string,           // JCC profile/user ID (required)
 *   event_type: string,        // Event type (required)
 *   payload?: object,          // Additional event data
 * }
 * 
 * Supported event_types (SDR Funnel):
 * - trial_started: { plan: "trial", trial_ends_at: "...", provisioned_by: "sdr", sdr_user_id: "...", source: "cold_call" }
 * - password_set: {} (User set password - activation gate)
 * - first_login: {} (User logged in - replaces trial_activated with activation_type: first_login)
 * - calculator_viewed: {} (User viewed calculator settings)
 * - calculator_modified: {} (User saved changes - replaces trial_activated with activation_type: settings_change)
 * - embed_snippet_copied: {} (User copied embed code - replaces snippet_installed)
 * - first_lead_received: { source_url: "https://...", lead_id: "uuid" } (First real lead came in - KEY EVENT)
 * - trial_qualified: {}
 * - credits_low: { credits_remaining: 5, plan: "starter" }
 * - trial_expiring: { trial_ends_at: "2025-01-15T00:00:00Z" }
 * - paid_subscribed: { plan: "pro", mrr: 49.99, sdr_first_touch_code: "...", sdr_last_touch_code: "..." }
 * 
 * Legacy events (still supported for backward compatibility):
 * - trial_activated: { activation_type: "first_login" | "settings_change", ... } (DEPRECATED)
 * - snippet_installed: { website_domain: "...", ... } (DEPRECATED)
 */
export async function POST(request: NextRequest) {
  // JCC feature flag guard
  if (!JCC_FEATURES_ENABLED) {
    return NextResponse.json({ error: "JCC features are disabled" }, { status: 404 });
  }

  try {
    // Verify webhook secret if set
    const authHeader = request.headers.get("authorization");
    const webhookSecret = process.env.JCC_WEBHOOK_SECRET;
    if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { user_id, event_type, payload } = body;

    // Validate required fields
    if (!user_id) {
      return NextResponse.json(
        { error: "user_id is required" },
        { status: 400 }
      );
    }

    if (!event_type) {
      return NextResponse.json(
        { error: "event_type is required" },
        { status: 400 }
      );
    }

    // Validate event_type
    const validEventTypes = [
      "trial_started",
      "password_set",          // NEW: User set password (activation gate)
      "first_login",           // NEW: User logged in (replaces trial_activated with activation_type: first_login)
      "calculator_viewed",     // NEW: User viewed settings
      "calculator_modified",   // NEW: User saved changes (replaces trial_activated with activation_type: settings_change)
      "embed_snippet_copied",  // NEW: User copied embed code (replaces snippet_installed)
      "first_lead_received",   // NEW: First real lead came in (includes source_url)
      "trial_qualified",
      "credits_low",
      "credits_first_used",    // NEW: First credit used (20→19) - proves install is live
      "trial_expiring",
      "paid_subscribed",
      // Legacy events (for backward compatibility)
      "trial_activated",       // DEPRECATED: Use first_login or calculator_modified
      "snippet_installed",     // DEPRECATED: Use embed_snippet_copied
    ];

    if (!validEventTypes.includes(event_type)) {
      return NextResponse.json(
        { 
          error: `Invalid event_type. Must be one of: ${validEventTypes.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    // Check if there's already an sdr_client_links entry for this user
    // If not, log a warning but still insert the event
    const { data: existingLink, error: linkError } = await supabase
      .from("sdr_client_links")
      .select("id, crm_lead_id, sdr_user_id")
      .eq("user_id", user_id)
      .single();

    if (linkError || !existingLink) {
      console.warn(
        `No sdr_client_links found for user_id ${user_id}. Event will be stored but won't be processed until link is created.`
      );
    }

    // Insert the event into client_events
    const { data: insertedEvent, error: insertError } = await supabase
      .from("client_events")
      .insert({
        user_id,
        event_type,
        payload: payload || {},
        processed: false,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting client_event:", insertError);
      return NextResponse.json(
        { error: "Failed to create event" },
        { status: 500 }
      );
    }

    // Optionally trigger immediate sync if we have a link
    // This provides faster feedback to the SDR
    if (existingLink) {
      try {
        // Process this single event immediately
        await processEventImmediately(supabase, insertedEvent, existingLink);
      } catch (syncError) {
        console.error("Error in immediate sync:", syncError);
        // Don't fail the request - the cron job will pick it up
      }
    }

    return NextResponse.json({
      success: true,
      message: "Event received",
      event_id: insertedEvent.id,
      has_link: !!existingLink,
      will_process: !!existingLink,
    });
  } catch (error: any) {
    console.error("Error in jcc-event webhook:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Process a single event immediately (for faster feedback)
 */
async function processEventImmediately(
  supabase: any,
  event: any,
  link: { id: string; crm_lead_id: string; sdr_user_id: string }
) {
  // Get JCC campaign ID
  const { data: jccCampaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("name", "Junk Car Calculator")
    .single();

  if (!jccCampaign) {
    console.log("JCC campaign not found, skipping immediate processing");
    return;
  }

  // Verify lead is in JCC campaign
  const { data: campaignLead } = await supabase
    .from("campaign_leads")
    .select("id")
    .eq("lead_id", link.crm_lead_id)
    .eq("campaign_id", jccCampaign.id)
    .single();

  if (!campaignLead) {
    console.log(`Lead ${link.crm_lead_id} not in JCC campaign, skipping`);
    return;
  }

  // Insert notification
  await supabase.from("lead_notifications").insert({
    lead_id: link.crm_lead_id,
    sdr_user_id: link.sdr_user_id,
    event_type: event.event_type,
    payload: event.payload || {},
  });

  // Get badge and pipeline updates
  const { leadUpdate, pipelineUpdate } = getUpdatesFromEvent(event.event_type, event.payload);
  
  // Update lead with badge and other fields
  if (leadUpdate && Object.keys(leadUpdate).length > 0) {
    await supabase
      .from("search_results")
      .update(leadUpdate)
      .eq("id", link.crm_lead_id);
  }
  
  // Upsert trial_pipeline
  if (pipelineUpdate && Object.keys(pipelineUpdate).length > 0) {
    // Remove _checkActivation flag before upsert (it's not a column)
    const { _checkActivation, ...pipelineData } = pipelineUpdate;
    
    // Check if record exists to preserve owner_sdr_id attribution
    const { data: existingPipeline } = await supabase
      .from("trial_pipeline")
      .select("id, owner_sdr_id")
      .eq("crm_lead_id", link.crm_lead_id)
      .single();

    const upsertData: Record<string, any> = {
      crm_lead_id: link.crm_lead_id,
      jcc_user_id: event.user_id,
      ...pipelineData,
    };

    // Only set owner_sdr_id on NEW records, never overwrite existing
    if (!existingPipeline) {
      upsertData.owner_sdr_id = link.sdr_user_id;
    }

    await supabase
      .from("trial_pipeline")
      .upsert(upsertData, { onConflict: 'crm_lead_id' });
    
    // Check and set activated_at if condition is now met
    // Activated = calculator_modified + first_lead_received
    if (_checkActivation) {
      const { data: pipeline } = await supabase
        .from("trial_pipeline")
        .select("calculator_modified_at, first_lead_received_at, activated_at")
        .eq("crm_lead_id", link.crm_lead_id)
        .single();
      
      if (pipeline?.calculator_modified_at && 
          pipeline?.first_lead_received_at &&
          !pipeline.activated_at) {
        // Use the later of the two timestamps as the activation time
        const activatedAt = new Date(pipeline.first_lead_received_at) > new Date(pipeline.calculator_modified_at)
          ? pipeline.first_lead_received_at
          : pipeline.calculator_modified_at;
        await supabase
          .from("trial_pipeline")
          .update({ activated_at: activatedAt })
          .eq("crm_lead_id", link.crm_lead_id);
      }
    }
  }

  // Record governance performance event for paid conversion
  if (event.event_type === "paid_subscribed") {
    try {
      const { data: lead } = await supabase
        .from("search_results")
        .select("assigned_campaign_id")
        .eq("id", link.crm_lead_id)
        .single();

      const campaignId = lead?.assigned_campaign_id;
      if (campaignId) {
        await recordPerformanceEvent({
          campaignId,
          eventType: 'paid_conversion',
          leadId: link.crm_lead_id,
          metadata: {
            jcc_user_id: event.user_id,
            plan: event.payload?.plan,
            mrr: event.payload?.mrr,
          },
        });

        // Record revenue event for budget tracking
        const mrr = parseFloat(event.payload?.mrr) || 0;
        if (mrr > 0) {
          const { error: revenueError } = await supabase
            .from("revenue_events")
            .insert({
              campaign_id: campaignId,
              lead_id: link.crm_lead_id,
              amount_usd: mrr,
              source: "paid_subscription",
              metadata_json: {
                jcc_user_id: event.user_id,
                plan: event.payload?.plan,
              },
            });
          if (revenueError) {
            console.error("Error recording revenue event:", revenueError);
          } else {
            console.log(`Recorded $${mrr} revenue for campaign ${campaignId}`);
          }
        }
      }
    } catch (error) {
      console.error("Error recording paid_conversion event:", error);
    }
  }

  // Auto-award bonuses on credits_first_used (proven install)
  if (event.event_type === "credits_first_used") {
    try {
      const { data: lead } = await supabase
        .from("search_results")
        .select("assigned_campaign_id")
        .eq("id", link.crm_lead_id)
        .single();

      const { data: campaign } = await supabase
        .from("campaigns")
        .select("id, bonus_rules")
        .eq("id", lead?.assigned_campaign_id)
        .single();

      const bonusRules = (campaign?.bonus_rules as any[]) || [];
      const provenInstallRule = bonusRules.find((r: any) => r.trigger === "proven_install");

      if (provenInstallRule) {
        const { data: pipeline } = await supabase
          .from("trial_pipeline")
          .select("id, owner_sdr_id")
          .eq("crm_lead_id", link.crm_lead_id)
          .single();

        const { data: meeting } = await supabase
          .from("activation_meetings")
          .select("activator_user_id, completed_by_user_id")
          .eq("trial_pipeline_id", pipeline?.id)
          .eq("status", "completed")
          .order("completed_at", { ascending: false })
          .limit(1)
          .single();

        // Award SDR bonus
        if (provenInstallRule.sdr_amount > 0 && pipeline?.owner_sdr_id) {
          const { error: sdrBonusError } = await supabase.from("bonus_events").insert({
            campaign_id: campaign?.id,
            team_member_id: pipeline.owner_sdr_id,
            event_type: "proven_install",
            bonus_amount_usd: provenInstallRule.sdr_amount,
            jcc_user_id: event.user_id,
          });
          
          if (sdrBonusError && sdrBonusError.code !== "23505") {
            // 23505 = duplicate (already awarded), which is fine
            console.error("Error awarding SDR bonus:", sdrBonusError);
          } else {
            console.log(`Awarded $${provenInstallRule.sdr_amount} bonus to SDR ${pipeline.owner_sdr_id}`);
          }
        }

        // Award Activator bonus
        const activatorId = meeting?.completed_by_user_id || meeting?.activator_user_id;
        if (provenInstallRule.activator_amount > 0 && activatorId) {
          const { error: activatorBonusError } = await supabase.from("bonus_events").insert({
            campaign_id: campaign?.id,
            team_member_id: activatorId,
            event_type: "proven_install",
            bonus_amount_usd: provenInstallRule.activator_amount,
            jcc_user_id: event.user_id,
          });
          
          if (activatorBonusError && activatorBonusError.code !== "23505") {
            console.error("Error awarding Activator bonus:", activatorBonusError);
          } else {
            console.log(`Awarded $${provenInstallRule.activator_amount} bonus to Activator ${activatorId}`);
          }
        }
      }
    } catch (error) {
      console.error("Error in credits_first_used bonus processing:", error);
    }
  }

  // Auto-create $5 activation credit if paid within 30 days
  if (event.event_type === "paid_subscribed") {
    const { data: pipeline } = await supabase
      .from("trial_pipeline")
      .select("id, trial_started_at, owner_sdr_id, converted_at")
      .eq("crm_lead_id", link.crm_lead_id)
      .single();

    if (pipeline?.trial_started_at && pipeline.converted_at) {
      const trialStart = new Date(pipeline.trial_started_at);
      const convertedAt = new Date(pipeline.converted_at);
      const daysToConvert = Math.floor((convertedAt.getTime() - trialStart.getTime()) / (1000 * 60 * 60 * 24));

      // Credit if converted within 30 days
      if (daysToConvert <= 30) {
        // Get activator (assigned_to on lead)
        const { data: lead } = await supabase
          .from("search_results")
          .select("assigned_to, organization_id")
          .eq("id", link.crm_lead_id)
          .single();

        // Check activator exists and is actually activator role
        const { data: activatorProfile } = await supabase
          .from("user_profiles")
          .select("is_activator")
          .eq("id", lead?.assigned_to)
          .single();

        if (lead?.assigned_to && activatorProfile?.is_activator) {
          // Check if credit already exists
          const { data: existingCredit } = await supabase
            .from("activation_credits")
            .select("id")
            .eq("lead_id", link.crm_lead_id)
            .single();

          if (!existingCredit) {
            await supabase.from("activation_credits").insert({
              organization_id: lead.organization_id,
              lead_id: link.crm_lead_id,
              trial_pipeline_id: pipeline.id,
              activator_user_id: lead.assigned_to,
              sdr_user_id: pipeline.owner_sdr_id,
              trial_started_at: pipeline.trial_started_at,
              converted_at: pipeline.converted_at,
              days_to_convert: daysToConvert,
              amount: 5.00,
            });
            console.log(`Created $5 activation credit for lead ${link.crm_lead_id} (${daysToConvert} days to convert)`);
          }
        }
      }
    }
  }

  // Mark event as processed
  await supabase
    .from("client_events")
    .update({ processed: true })
    .eq("id", event.id);
}

/**
 * Convert event_type to lead update fields (badge-aware)
 * Returns both lead update and pipeline update
 */
function getUpdatesFromEvent(
  eventType: string,
  payload: any
): { leadUpdate: Record<string, any> | null; pipelineUpdate: Record<string, any> } {
  const now = new Date().toISOString();
  const badgeKey = getBadgeFromJccEvent(eventType);
  
  const leadUpdate: Record<string, any> = {};
  const pipelineUpdate: Record<string, any> = { last_event_at: now, updated_at: now };
  
  // Set badge if mapped
  if (badgeKey) {
    leadUpdate.badge_key = badgeKey;
  }
  
  // Set follow-up for trial_started
  if (eventType === "trial_started") {
    leadUpdate.next_follow_up_at = calculateFollowUpDate(3);
  }
  
  // Keep legacy client_status for backward compatibility
  switch (eventType) {
    case "trial_started":
      leadUpdate.client_status = "trialing";
      leadUpdate.client_plan = payload?.plan || null;
      leadUpdate.client_trial_ends_at = payload?.trial_ends_at || null;
      pipelineUpdate.trial_started_at = now;
      pipelineUpdate.trial_ends_at = payload?.trial_ends_at || null;
      break;

    case "password_set":
      leadUpdate.client_status = "password_set";
      pipelineUpdate.password_set_at = now;
      break;

    case "first_login":
      leadUpdate.client_status = "trial_activated";
      leadUpdate.client_activated_at = now;
      pipelineUpdate.first_login_at = now;
      break;

    case "calculator_viewed":
      leadUpdate.client_status = "calculator_viewed";
      break;

    case "calculator_modified":
      leadUpdate.client_status = "trial_activated";
      leadUpdate.client_activated_at = now;
      pipelineUpdate.calculator_modified_at = now;
      break;

    case "embed_snippet_copied":
      leadUpdate.client_status = "snippet_copied";
      pipelineUpdate.embed_snippet_copied_at = now;
      break;

    case "first_lead_received":
      leadUpdate.client_status = "snippet_installed";
      leadUpdate.client_snippet_installed_at = now;
      const sourceUrl = payload?.source_url;
      leadUpdate.client_snippet_domain = sourceUrl ? new URL(sourceUrl).hostname : null;
      pipelineUpdate.first_lead_received_at = now;
      pipelineUpdate.install_url = sourceUrl || null;
      break;

    // Legacy events
    case "trial_activated":
      leadUpdate.client_status = "trial_activated";
      leadUpdate.client_activated_at = now;
      if (payload?.activation_type === "first_login") {
        pipelineUpdate.first_login_at = now;
      } else if (payload?.activation_type === "settings_change") {
        pipelineUpdate.calculator_modified_at = now;
      } else {
        pipelineUpdate.first_login_at = now;
      }
      break;

    case "snippet_installed":
      leadUpdate.client_status = "snippet_installed";
      leadUpdate.client_snippet_installed_at = now;
      leadUpdate.client_snippet_domain = payload?.website_domain || null;
      pipelineUpdate.embed_snippet_copied_at = now;
      break;

    case "trial_qualified":
      leadUpdate.client_status = "trial_qualified";
      break;

    case "credits_low":
      leadUpdate.client_status = "credits_low";
      leadUpdate.client_credits_left = payload?.credits_remaining ?? payload?.credits_left ?? null;
      leadUpdate.client_plan = payload?.plan || undefined;
      break;

    case "credits_first_used":
      leadUpdate.client_status = "proven_live";
      leadUpdate.client_credits_left = payload?.credits_remaining ?? 19;
      pipelineUpdate.credits_remaining = payload?.credits_remaining ?? 19;
      pipelineUpdate.activation_status = "active";
      break;

    case "trial_expiring":
      leadUpdate.client_status = "trial_expiring";
      leadUpdate.client_trial_ends_at = payload?.trial_ends_at || null;
      break;

    case "paid_subscribed":
      leadUpdate.client_status = "paid";
      leadUpdate.client_plan = payload?.plan || null;
      leadUpdate.client_credits_left = null;
      leadUpdate.client_mrr = payload?.mrr || null;
      leadUpdate.client_paid_at = now;
      pipelineUpdate.converted_at = now;
      pipelineUpdate.plan = payload?.plan || null;
      pipelineUpdate.mrr = payload?.mrr || null;
      pipelineUpdate.bonus_state = "pending";
      break;
  }
  
  // Mark for activation check on relevant events
  // Activated = calculator_modified + first_lead_received
  if (["calculator_modified", "first_lead_received"].includes(eventType)) {
    pipelineUpdate._checkActivation = true;
  }
  
  return {
    leadUpdate: Object.keys(leadUpdate).length > 0 ? leadUpdate : null,
    pipelineUpdate,
  };
}

/**
 * GET /api/webhooks/jcc-event
 * Health check and documentation
 */
export async function GET() {
  // JCC feature flag guard
  if (!JCC_FEATURES_ENABLED) {
    return NextResponse.json({ error: "JCC features are disabled" }, { status: 404 });
  }

  return NextResponse.json({
    status: "ok",
    endpoint: "jcc-event webhook",
    description: "POST lifecycle events from JCC to this endpoint",
    sdr_funnel: [
      "trial_started → password_set → first_login → calculator_modified → embed_snippet_copied → first_lead_received → paid_subscribed",
    ],
    event_types: [
      "trial_started",
      "password_set",
      "first_login",
      "calculator_viewed",
      "calculator_modified",
      "embed_snippet_copied",
      "first_lead_received",
      "trial_qualified", 
      "credits_low",
      "credits_first_used",
      "trial_expiring",
      "paid_subscribed",
    ],
    example_payloads: {
      trial_started: {
        user_id: "jcc-user-uuid",
        event_type: "trial_started",
        payload: {
          plan: "trial",
          trial_ends_at: "2025-01-15T00:00:00Z",
          provisioned_by: "sdr",
          sdr_user_id: "crm-sdr-uuid",
          source: "cold_call",
        },
      },
      first_login: {
        user_id: "jcc-user-uuid",
        event_type: "first_login",
        payload: {},
      },
      calculator_modified: {
        user_id: "jcc-user-uuid",
        event_type: "calculator_modified",
        payload: {},
      },
      embed_snippet_copied: {
        user_id: "jcc-user-uuid",
        event_type: "embed_snippet_copied",
        payload: {},
      },
      first_lead_received: {
        user_id: "jcc-user-uuid",
        event_type: "first_lead_received",
        payload: {
          source_url: "https://www.joesjunkcars.com/sell-my-car",
          lead_id: "jcc-lead-uuid",
        },
      },
      paid_subscribed: {
        user_id: "jcc-user-uuid",
        event_type: "paid_subscribed",
        payload: {
          plan: "pro",
          mrr: 49.00,
          sdr_first_touch_code: "sdr-code",
          sdr_last_touch_code: "sdr-code",
        },
      },
    },
  });
}

