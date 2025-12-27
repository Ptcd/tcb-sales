/**
 * API Key Validation Utilities
 * Future-proof validation for various API keys
 */

export interface ApiKeyValidationResult {
  isValid: boolean;
  error?: string;
  keyType?: string;
}

/**
 * Validates Google Maps API key format
 * Uses flexible validation that doesn't rely on hardcoded prefixes
 */
export function validateGoogleMapsApiKey(
  apiKey: string
): ApiKeyValidationResult {
  // Basic validation
  if (!apiKey || typeof apiKey !== "string") {
    return {
      isValid: false,
      error: "API key is required and must be a string",
    };
  }

  // Length validation (Google API keys are typically 39 characters)
  if (apiKey.length < 20 || apiKey.length > 50) {
    return {
      isValid: false,
      error: "API key length appears invalid (should be 20-50 characters)",
    };
  }

  // Character validation (alphanumeric, hyphens, underscores only)
  if (!/^[A-Za-z0-9_-]+$/.test(apiKey)) {
    return {
      isValid: false,
      error: "API key contains invalid characters",
    };
  }

  // Try to detect key type without hardcoding prefixes
  const keyType = detectApiKeyType(apiKey);

  return {
    isValid: true,
    keyType,
  };
}

/**
 * Detects API key type based on patterns
 * This is more flexible than hardcoding prefixes
 */
function detectApiKeyType(apiKey: string): string {
  // Common patterns for different Google API key types
  const patterns = [
    { type: "Google Maps", pattern: /^[A-Za-z0-9_-]{39}$/ },
    { type: "Google Cloud", pattern: /^[A-Za-z0-9_-]{20,50}$/ },
    { type: "Generic API", pattern: /^[A-Za-z0-9_-]+$/ },
  ];

  for (const { type, pattern } of patterns) {
    if (pattern.test(apiKey)) {
      return type;
    }
  }

  return "Unknown API Type";
}

/**
 * Validates search parameters
 */
export function validateSearchParams(
  keyword: string,
  location: string,
  resultCount: number
): ApiKeyValidationResult {
  if (!keyword || keyword.trim().length < 2) {
    return {
      isValid: false,
      error: "Keyword must be at least 2 characters long",
    };
  }

  if (!location || location.trim().length < 2) {
    return {
      isValid: false,
      error: "Location must be at least 2 characters long",
    };
  }

  if (resultCount < 1 || resultCount > 200) {
    return {
      isValid: false,
      error: "Result count must be between 1 and 200",
    };
  }

  // Check for potentially malicious input
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /data:/i,
    /vbscript:/i,
  ];

  const combinedInput = `${keyword} ${location}`;
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(combinedInput)) {
      return {
        isValid: false,
        error: "Invalid characters detected in search parameters",
      };
    }
  }

  return { isValid: true };
}

/**
 * Sanitizes user input for safe API usage
 */
export function sanitizeSearchInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, "") // Remove potential HTML/script tags
    .substring(0, 100); // Limit length
}
