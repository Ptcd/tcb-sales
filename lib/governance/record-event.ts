import { createServiceRoleClient } from "@/lib/supabase/server";

export type PerformanceEventType = 
  | 'dial_attempt'
  | 'conversation'
  | 'qpc'
  | 'install_scheduled'
  | 'install_attended'
  | 'calculator_installed'
  | 'paid_conversion';

interface RecordEventParams {
  campaignId: string;
  eventType: PerformanceEventType;
  leadId?: string;
  userId?: string;
  metadata?: Record<string, any>;
  eventTimestamp?: string;
}

/**
 * Record a performance event for governance tracking.
 * Auto-attributes to running experiment at event timestamp.
 */
export async function recordPerformanceEvent(params: RecordEventParams): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    const eventTimestamp = params.eventTimestamp || new Date().toISOString();

    // Find running experiment for this campaign
    const { data: experiment } = await supabase
      .from("experiments")
      .select("id")
      .eq("campaign_id", params.campaignId)
      .eq("status", "running")
      .not("started_at", "is", null)
      .lte("started_at", eventTimestamp)
      .or(`ended_at.is.null,ended_at.gt.${eventTimestamp}`)
      .limit(1)
      .single();

    // Insert performance event
    const { error } = await supabase
      .from("performance_events")
      .insert({
        campaign_id: params.campaignId,
        experiment_id: experiment?.id || null,
        lead_id: params.leadId || null,
        user_id: params.userId || null,
        event_type: params.eventType,
        event_timestamp: eventTimestamp,
        metadata_json: params.metadata || {},
      });

    if (error) {
      console.error(`[Governance] Failed to record ${params.eventType}:`, error);
    } else {
      console.log(`[Governance] Recorded ${params.eventType} for campaign ${params.campaignId}`);
    }
  } catch (error) {
    console.error(`[Governance] Error recording ${params.eventType}:`, error);
  }
}


