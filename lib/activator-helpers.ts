import { createServiceRoleClient } from "./supabase/server";

/**
 * Update trial_pipeline record when a contact attempt is logged
 * - Sets last_contact_at = now()
 * - Increments rescue_attempts by 1
 * - If status is 'queued', sets it to 'in_progress'
 */
export async function updateTrialPipelineOnContact(leadId: string) {
  const supabase = createServiceRoleClient();

  // Get current status to check for auto-transition
  const { data: pipeline } = await supabase
    .from("trial_pipeline")
    .select("activation_status, rescue_attempts")
    .eq("crm_lead_id", leadId)
    .single();

  if (!pipeline) return;

  const updateData: any = {
    last_contact_at: new Date().toISOString(),
    rescue_attempts: (pipeline.rescue_attempts || 0) + 1,
  };

  if (pipeline.activation_status === "queued") {
    updateData.activation_status = "in_progress";
  }

  await supabase
    .from("trial_pipeline")
    .update(updateData)
    .eq("crm_lead_id", leadId);
}


