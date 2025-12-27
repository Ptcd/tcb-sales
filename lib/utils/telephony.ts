import { parsePhoneNumber, isValidPhoneNumber, formatIncompletePhoneNumber, type CountryCode } from "libphonenumber-js";

/**
 * Telephony utilities for Twilio integration
 */

export interface CallInitiationResult {
  callSid: string;
  status: string;
  from: string;
  to: string;
}

/**
 * Normalizes a phone number to E.164 format for Twilio
 */
export function normalizePhoneForTwilio(phone: string, defaultCountry: string = "US"): string {
  if (!phone) {
    throw new Error("Phone number is required");
  }

  try {
    // Remove common formatting
    const cleaned = phone.replace(/[\s\-\(\)\.]/g, "");

    // Try to parse and format
    if (isValidPhoneNumber(cleaned, defaultCountry as CountryCode)) {
      const parsed = parsePhoneNumber(cleaned, defaultCountry as CountryCode);
      return parsed.format("E.164");
    }

    // If parsing fails, try to format as incomplete number
    const formatted = formatIncompletePhoneNumber(cleaned, defaultCountry as CountryCode);
    if (formatted) {
      return formatted;
    }

    // Last resort: return cleaned version
    return cleaned;
  } catch (error) {
    console.error("Error normalizing phone number:", error);
    // Return cleaned version as fallback
    return phone.replace(/[\s\-\(\)\.]/g, "");
  }
}

/**
 * Validates a phone number
 */
export function validatePhoneNumber(phone: string, defaultCountry: string = "US"): boolean {
  if (!phone) return false;

  try {
    const cleaned = phone.replace(/[\s\-\(\)\.]/g, "");
    return isValidPhoneNumber(cleaned, defaultCountry as CountryCode);
  } catch {
    return false;
  }
}

/**
 * Initiates an outbound call via Twilio
 * This uses Twilio's "Click-to-Call" pattern where the agent's phone rings first
 */
export async function initiateOutboundCall(
  twilioClient: any,
  agentPhoneNumber: string,
  customerPhoneNumber: string,
  twilioFromNumber: string,
  callRecordUrl?: string
): Promise<CallInitiationResult> {
  if (!twilioClient) {
    throw new Error("Twilio client is required");
  }

  // Normalize phone numbers
  const normalizedAgent = normalizePhoneForTwilio(agentPhoneNumber);
  const normalizedCustomer = normalizePhoneForTwilio(customerPhoneNumber);
  const normalizedFrom = normalizePhoneForTwilio(twilioFromNumber);

  try {
    // Twilio "Click-to-Call" pattern:
    // 1. Call the agent first
    // 2. When agent answers, connect to customer
    const call = await twilioClient.calls.create({
      to: normalizedAgent, // Call agent first
      from: normalizedFrom,
      url: callRecordUrl || `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/twilio/voice/connect?customerPhone=${encodeURIComponent(normalizedCustomer)}`,
      method: "GET",
      statusCallback: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/twilio/call-status`,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      statusCallbackMethod: "POST",
    });

    return {
      callSid: call.sid,
      status: call.status,
      from: normalizedFrom,
      to: normalizedCustomer, // Store customer number for reference
    };
  } catch (error: any) {
    console.error("Error initiating Twilio call:", error);
    throw new Error(`Failed to initiate call: ${error.message || "Unknown error"}`);
  }
}

/**
 * Alternative: Direct outbound call (calls customer directly)
 * Use this if you want to call the customer directly without agent callback
 */
export async function initiateDirectCall(
  twilioClient: any,
  customerPhoneNumber: string,
  twilioFromNumber: string,
  agentPhoneNumber?: string // For tracking purposes
): Promise<CallInitiationResult> {
  if (!twilioClient) {
    throw new Error("Twilio client is required");
  }

  const normalizedCustomer = normalizePhoneForTwilio(customerPhoneNumber);
  const normalizedFrom = normalizePhoneForTwilio(twilioFromNumber);

  try {
    const call = await twilioClient.calls.create({
      to: normalizedCustomer,
      from: normalizedFrom,
      statusCallback: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/twilio/call-status`,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      statusCallbackMethod: "POST",
    });

    return {
      callSid: call.sid,
      status: call.status,
      from: normalizedFrom,
      to: normalizedCustomer,
    };
  } catch (error: any) {
    console.error("Error initiating direct Twilio call:", error);
    throw new Error(`Failed to initiate call: ${error.message || "Unknown error"}`);
  }
}

