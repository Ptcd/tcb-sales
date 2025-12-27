import tzlookup from "tz-lookup";
// @ts-ignore - no types available
import ptz from "phone-number-to-timezone";

/**
 * Infer timezone from latitude/longitude using tz-lookup
 * HIGH CONFIDENCE - coordinates are precise
 */
export function inferTimezoneFromCoords(lat: number, lng: number): string | null {
  try {
    return tzlookup(lat, lng);
  } catch (e) {
    console.error("tz-lookup error:", e);
    return null;
  }
}

/**
 * Map UTC offset + DST flag to IANA timezone
 */
function offsetToIana(offset: number, hasDst: boolean): string | null {
  // offset is negative for US timezones (e.g., -5 for ET, -6 for CT)
  const map: Record<string, string> = {
    "-5_true": "America/New_York",    // Eastern
    "-6_true": "America/Chicago",     // Central  
    "-7_true": "America/Denver",      // Mountain
    "-8_true": "America/Los_Angeles", // Pacific
    "-7_false": "America/Phoenix",    // Arizona (no DST)
    "-9_true": "America/Anchorage",   // Alaska
    "-10_false": "Pacific/Honolulu",  // Hawaii (no DST)
  };
  return map[`${offset}_${hasDst}`] || null;
}

/**
 * Infer timezone from US phone number using phone-number-to-timezone
 * MEDIUM CONFIDENCE - area codes can be ported
 */
export function inferTimezoneFromPhone(phone: string): string | null {
  if (!phone) return null;
  
  try {
    // Extract digits only
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) return null;
    
    const info = ptz.getLocalInfo(digits);
    if (!info || info.offset === undefined) return null;
    
    // Convert offset + dst to IANA timezone
    return offsetToIana(info.offset, info.dst === true);
  } catch (e) {
    console.error("phone-number-to-timezone error:", e);
    return null;
  }
}

/**
 * Infer lead timezone with fallback chain:
 * 1. lat/lng (HIGH confidence - from Google Maps)
 * 2. phone area code (MEDIUM confidence - may be ported)
 * 3. null (requires manual selection)
 * 
 * Returns timezone and source for confidence display
 */
export function inferLeadTimezone(
  latitude?: number | null,
  longitude?: number | null,
  phone?: string | null
): { timezone: string | null; source: "coords" | "phone" | null } {
  // Try coordinates first (HIGH confidence)
  if (latitude != null && longitude != null) {
    const tz = inferTimezoneFromCoords(latitude, longitude);
    if (tz) {
      return { timezone: tz, source: "coords" };
    }
  }
  
  // Fallback to phone area code (MEDIUM confidence)
  if (phone) {
    const tz = inferTimezoneFromPhone(phone);
    if (tz) {
      return { timezone: tz, source: "phone" };
    }
  }
  
  // Could not infer - requires manual selection
  return { timezone: null, source: null };
}

/**
 * Get short timezone label for display (e.g., "ET", "CT", "PT")
 */
export function getTimezoneLabel(timezone: string): string {
  const labels: Record<string, string> = {
    "America/New_York": "ET",
    "America/Chicago": "CT",
    "America/Denver": "MT",
    "America/Los_Angeles": "PT",
    "America/Phoenix": "AZ",
    "America/Anchorage": "AK",
    "Pacific/Honolulu": "HI",
  };
  return labels[timezone] || timezone.split("/").pop() || timezone;
}


