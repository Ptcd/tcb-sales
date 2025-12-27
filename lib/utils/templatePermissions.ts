import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Check if user can manage templates for a campaign
 * Returns true if user is:
 * - Organization admin
 * - Campaign manager (role = 'manager' in campaign_members)
 */
export async function canManageTemplates(
  supabase: SupabaseClient,
  userId: string,
  campaignId: string
): Promise<{ allowed: boolean; reason?: string }> {
  // Check if user is admin
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, organization_id")
    .eq("id", userId)
    .single();

  if (!profile) {
    return { allowed: false, reason: "User profile not found" };
  }

  // Admins can manage all templates in their org
  if (profile.role === "admin") {
    return { allowed: true };
  }

  // Check if user is a campaign manager
  const { data: membership } = await supabase
    .from("campaign_members")
    .select("role")
    .eq("campaign_id", campaignId)
    .eq("user_id", userId)
    .single();

  if (membership?.role === "manager") {
    return { allowed: true };
  }

  return { 
    allowed: false, 
    reason: "Only admins and campaign managers can manage templates" 
  };
}

/**
 * Check if user can manage a specific template
 * Fetches the template's campaign_id and checks permissions
 */
export async function canManageTemplate(
  supabase: SupabaseClient,
  userId: string,
  templateId: string,
  templateTable: "email_templates" | "sms_templates"
): Promise<{ allowed: boolean; reason?: string; campaignId?: string }> {
  // Get the template's campaign_id
  const { data: template } = await supabase
    .from(templateTable)
    .select("campaign_id")
    .eq("id", templateId)
    .single();

  if (!template) {
    return { allowed: false, reason: "Template not found" };
  }

  if (!template.campaign_id) {
    // Legacy template without campaign - only admins can manage
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (profile?.role === "admin") {
      return { allowed: true, campaignId: template.campaign_id };
    }
    return { allowed: false, reason: "Only admins can manage legacy templates" };
  }

  const result = await canManageTemplates(supabase, userId, template.campaign_id);
  return { ...result, campaignId: template.campaign_id };
}



