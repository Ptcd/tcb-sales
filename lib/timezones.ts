/**
 * Common IANA Timezones
 */
export const COMMON_TIMEZONES = [
  // US Timezones
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  // International - Common for remote SDRs
  { value: "Asia/Manila", label: "Philippine Time (PHT)" },
  { value: "Asia/Karachi", label: "Pakistan Time (PKT)" },
  { value: "Asia/Kolkata", label: "India Time (IST)" },
  { value: "Europe/London", label: "UK Time (GMT/BST)" },
  { value: "Asia/Dubai", label: "Dubai Time (GST)" },
];

/**
 * Full list of IANA Timezones (simplified for searchable dropdown)
 */
export const ALL_TIMEZONES = [
  ...COMMON_TIMEZONES,
  { value: "America/Anchorage", label: "Alaska Time (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii-Aleutian Time (HAT)" },
  { value: "America/Phoenix", label: "Arizona (no DST)" },
  { value: "America/Puerto_Rico", label: "Puerto Rico (AST)" },
  // Add more as needed or use Intl.supportedValuesOf('timeZone')
  ...Intl.supportedValuesOf('timeZone')
    .filter(tz => !COMMON_TIMEZONES.find(c => c.value === tz))
    .map(tz => ({ value: tz, label: tz }))
];

/**
 * Format a date in a specific timezone
 */
export function formatInTimezone(date: Date | string, timezone: string, options: Intl.DateTimeFormatOptions = {}) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    ...options,
    timeZone: timezone,
  }).format(d);
}

/**
 * Get current time in a specific timezone
 */
export function nowInTimezone(timezone: string) {
  return formatInTimezone(new Date(), timezone, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/**
 * Convert a local datetime string + timezone to a UTC Date object
 * @param dateStr - Format: "YYYY-MM-DDTHH:mm" (from datetime-local input)
 * @param timezone - IANA timezone string like "America/New_York"
 * @returns ISO string in UTC
 */
export function localToUtc(dateStr: string, timezone: string): string {
  // Parse the datetime-local string
  const [datePart, timePart] = dateStr.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  
  // Create a date string with the timezone info
  // Format: "YYYY-MM-DD HH:mm" in the target timezone
  const localDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  
  // Use Intl.DateTimeFormat to find what UTC time corresponds to this local time
  // by creating dates and checking when they format to the right local time
  
  // Start with a guess: treat the input as UTC
  let guessUTC = new Date(`${localDateStr}Z`);
  
  // See what this UTC time looks like in the target timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  // Format our guess to see what local time it represents
  const parts = formatter.formatToParts(guessUTC);
  const formatted = {
    year: parseInt(parts.find(p => p.type === 'year')?.value || '0'),
    month: parseInt(parts.find(p => p.type === 'month')?.value || '0'),
    day: parseInt(parts.find(p => p.type === 'day')?.value || '0'),
    hour: parseInt(parts.find(p => p.type === 'hour')?.value || '0'),
    minute: parseInt(parts.find(p => p.type === 'minute')?.value || '0'),
  };
  
  // Calculate the difference between what we wanted and what we got
  const wantedMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const gotMs = Date.UTC(formatted.year, formatted.month - 1, formatted.day, formatted.hour, formatted.minute, 0);
  const offsetMs = wantedMs - gotMs;
  
  // Adjust our guess by the offset
  const correctUTC = new Date(guessUTC.getTime() + offsetMs);
  
  return correctUTC.toISOString();
}

/**
 * Check if a timezone string is valid
 * @param timezone - String to check
 * @returns true if valid IANA timezone
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the date string (YYYY-MM-DD) for a UTC timestamp in a specific timezone
 * @param utcDate - Date object or ISO string in UTC
 * @param timezone - IANA timezone string
 * @returns Date string in format YYYY-MM-DD
 */
export function getDateInTimezone(utcDate: Date | string, timezone: string): string {
  const d = typeof utcDate === 'string' ? new Date(utcDate) : utcDate;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(d);
}

/**
 * Get the day of week (0=Sunday, 6=Saturday) for a UTC timestamp in a specific timezone
 * @param utcDate - Date object or ISO string in UTC
 * @param timezone - IANA timezone string
 * @returns Day of week number (0-6)
 */
export function getDayOfWeekInTimezone(utcDate: Date | string, timezone: string): number {
  const d = typeof utcDate === 'string' ? new Date(utcDate) : utcDate;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  });
  const dayName = formatter.format(d);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days.indexOf(dayName);
}

