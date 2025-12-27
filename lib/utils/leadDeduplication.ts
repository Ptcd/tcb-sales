import { parsePhoneNumber, isValidPhoneNumber } from "libphonenumber-js";

/**
 * Normalizes a phone number for comparison
 * Removes formatting and normalizes to E.164 format
 */
export function normalizePhoneNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  
  try {
    // Remove common formatting characters
    const cleaned = phone.replace(/[\s\-\(\)\.]/g, "");
    
    // Try to parse as phone number
    if (isValidPhoneNumber(cleaned, "US")) {
      const parsed = parsePhoneNumber(cleaned, "US");
      return parsed.format("E.164");
    }
    
    // If parsing fails, return cleaned version
    return cleaned;
  } catch (error) {
    // If all else fails, return cleaned version
    return phone.replace(/[\s\-\(\)\.]/g, "");
  }
}

/**
 * Checks if two phone numbers match (normalized comparison)
 */
export function phoneNumbersMatch(phone1: string | null | undefined, phone2: string | null | undefined): boolean {
  if (!phone1 || !phone2) return false;
  
  const normalized1 = normalizePhoneNumber(phone1);
  const normalized2 = normalizePhoneNumber(phone2);
  
  if (!normalized1 || !normalized2) return false;
  
  return normalized1 === normalized2;
}

/**
 * Interface for existing lead match
 */
export interface ExistingLeadMatch {
  leadId: string;
  assignedTo: string | null;
  assignedToName: string | null;
  leadStatus: string;
  organizationId: string;
}

/**
 * Finds existing leads in the organization by phone number or place_id
 */
export async function findExistingLeads(
  supabase: any,
  organizationId: string,
  results: Array<{ placeId: string; phone?: string | null }>
): Promise<Map<string, ExistingLeadMatch>> {
  const matches = new Map<string, ExistingLeadMatch>();
  
  if (!results || results.length === 0) return matches;
  
  // Collect all place_ids and phone numbers
  const placeIds = results.map(r => r.placeId).filter(Boolean);
  const phoneNumbers = results
    .map(r => r.phone)
    .filter(Boolean)
    .map(p => normalizePhoneNumber(p))
    .filter(Boolean) as string[];
  
  // Query 1: Find by place_id
  if (placeIds.length > 0) {
    const { data: placeMatches } = await supabase
      .from("search_results")
      .select(`
        id,
        place_id,
        assigned_to,
        lead_status,
        organization_id
      `)
      .eq("organization_id", organizationId)
      .in("place_id", placeIds);
    
    if (placeMatches && placeMatches.length > 0) {
      // Get user names for assigned leads
      const assignedUserIds = placeMatches
        .map((m: { assigned_to: string | null }) => m.assigned_to)
        .filter(Boolean) as string[];
      
      let userNamesMap = new Map<string, string>();
      if (assignedUserIds.length > 0) {
        const { data: userProfiles } = await supabase
          .from("user_profiles")
          .select("id, full_name")
          .in("id", assignedUserIds);
        
        if (userProfiles) {
          for (const profile of userProfiles) {
            if (profile.full_name) {
              userNamesMap.set(profile.id, profile.full_name);
            }
          }
        }
      }
      
      for (const match of placeMatches) {
        matches.set(match.place_id, {
          leadId: match.id,
          assignedTo: match.assigned_to,
          assignedToName: match.assigned_to ? (userNamesMap.get(match.assigned_to) || null) : null,
          leadStatus: match.lead_status || "new",
          organizationId: match.organization_id,
        });
      }
    }
  }
  
  // Query 2: Find by phone number (normalized)
  // For phone matching, we need to do a more complex comparison
  // Get all leads in the organization with phone numbers
  const { data: phoneLeads } = await supabase
    .from("search_results")
    .select(`
      id,
      place_id,
      phone,
      assigned_to,
      lead_status,
      organization_id
    `)
    .eq("organization_id", organizationId)
    .not("phone", "is", null);
  
  if (phoneLeads && phoneLeads.length > 0) {
    // Get user names for assigned leads
    const assignedUserIds = phoneLeads
      .map((l: { assigned_to: string | null }) => l.assigned_to)
      .filter(Boolean) as string[];
    
    let userNamesMap = new Map<string, string>();
    if (assignedUserIds.length > 0) {
      const { data: userProfiles } = await supabase
        .from("user_profiles")
        .select("id, full_name")
        .in("id", assignedUserIds);
      
      if (userProfiles) {
        for (const profile of userProfiles) {
          if (profile.full_name) {
            userNamesMap.set(profile.id, profile.full_name);
          }
        }
      }
    }
    
    // Create a map of normalized phone -> lead info
    const phoneToLeadMap = new Map<string, typeof phoneLeads[0]>();
    for (const lead of phoneLeads) {
      const normalized = normalizePhoneNumber(lead.phone);
      if (normalized) {
        phoneToLeadMap.set(normalized, lead);
      }
    }
    
    // Check each search result against existing leads
    for (const result of results) {
      // Skip if already matched by place_id
      if (matches.has(result.placeId)) continue;
      
      if (!result.phone) continue;
      
      const normalizedResultPhone = normalizePhoneNumber(result.phone);
      if (!normalizedResultPhone) continue;
      
      const existingLead = phoneToLeadMap.get(normalizedResultPhone);
      if (existingLead) {
        matches.set(result.placeId, {
          leadId: existingLead.id,
          assignedTo: existingLead.assigned_to,
          assignedToName: existingLead.assigned_to ? (userNamesMap.get(existingLead.assigned_to) || null) : null,
          leadStatus: existingLead.lead_status || "new",
          organizationId: existingLead.organization_id,
        });
      }
    }
  }
  
  return matches;
}

