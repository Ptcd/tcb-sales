import { createServiceRoleClient } from "@/lib/supabase/server";

export type UserProfileRecord = {
  id: string;
  full_name: string | null;
  role: "admin" | "member";
  organization_id: string;
  email: string | null;
  phone_number: string | null;
  sdr_code: string | null;
  assigned_twilio_number?: string | null; // Virtual field, populated from twilio_phone_numbers
};

/**
 * Fetches the user's profile or creates one (and an organization) if missing.
 * Uses the Supabase service role client to bypass RLS for bootstrap operations.
 */
export async function ensureUserProfile(
  userId: string,
  userEmail: string | null
): Promise<UserProfileRecord> {
  const serviceSupabase = createServiceRoleClient();

  // Try to fetch existing profile
  const {
    data: existingProfile,
    error: fetchError,
  } = await serviceSupabase
    .from("user_profiles")
    .select("id, full_name, role, organization_id, email, phone_number, sdr_code")
    .eq("id", userId)
    .single();

  if (existingProfile) {
    // Look up assigned phone number from twilio_phone_numbers table
    const { data: assignedPhone } = await serviceSupabase
      .from("twilio_phone_numbers")
      .select("phone_number")
      .eq("assigned_user_id", userId)
      .limit(1)
      .single();
    
    return {
      ...existingProfile,
      assigned_twilio_number: assignedPhone?.phone_number || null,
    };
  }

  if (fetchError && fetchError.code !== "PGRST116") {
    throw fetchError;
  }

  let organizationId: string | null = null;
  let role: "admin" | "member" = "admin";

  // Try to join the first existing organization (legacy users)
  const { data: firstProfile } = await serviceSupabase
    .from("user_profiles")
    .select("organization_id, role")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (firstProfile?.organization_id) {
    organizationId = firstProfile.organization_id;

    const { count: adminCount } = await serviceSupabase
      .from("user_profiles")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("role", "admin");

    if (adminCount && adminCount > 0) {
      role = "member";
    }
  }

  // If no organization exists, create one and default settings
  if (!organizationId) {
    const { data: newOrg, error: orgError } = await serviceSupabase
      .from("organizations")
      .insert({
        name: userEmail?.split("@")[0] || "My Organization",
      })
      .select("id")
      .single();

    if (orgError || !newOrg) {
      throw orgError || new Error("Failed to create organization");
    }

    organizationId = newOrg.id;
    role = "admin";

    await serviceSupabase.from("organization_settings").insert({
      organization_id: organizationId,
      enable_email_scraping: true,
      enable_email_outreach: true,
      default_lead_assignment_mode: "manual",
      max_leads_per_search: 200,
    });
  }

  const { data: newProfile, error: createError } = await serviceSupabase
    .from("user_profiles")
    .insert({
      id: userId,
      organization_id: organizationId,
      role,
      email: userEmail,
    })
    .select("id, full_name, role, organization_id, email, phone_number, sdr_code")
    .single();

  if (createError || !newProfile) {
    throw createError || new Error("Failed to create profile");
  }

  // New users won't have assigned phone numbers yet
  return {
    ...newProfile,
    assigned_twilio_number: null,
  };
}

