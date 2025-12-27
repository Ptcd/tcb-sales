/**
 * Generate phone number variants to improve matching across formats.
 * Examples covered:
 *  - Raw input
 *  - Digits-only
 *  - Digits-only without leading 1
 *  - E.164 with +1
 */
export function generatePhoneCandidates(input: string | null | undefined): string[] {
  if (!input) return [];
  const raw = input.trim();
  const digits = raw.replace(/\D/g, "");

  const candidates = new Set<string>();
  if (raw) candidates.add(raw);
  if (digits) candidates.add(digits);
  if (digits.length === 11 && digits.startsWith("1")) {
    candidates.add(digits.slice(1));
  }
  if (digits.length === 10) {
    candidates.add(`+1${digits}`);
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    candidates.add(`+${digits}`);
  }

  return Array.from(candidates);
}

/**
 * Build a Supabase OR filter string for phone matching across variants.
 * Produces filters like: phone.eq.123,phone.ilike.%123%
 */
export function buildPhoneOrFilter(candidates: string[]): string {
  const parts: string[] = [];
  candidates.forEach((c) => {
    parts.push(`phone.eq.${c}`);
    parts.push(`phone.ilike.%${c}%`);
  });
  return parts.join(",");
}

