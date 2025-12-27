import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * POST /api/twilio/status
 * Webhook to receive SMS delivery status updates from Twilio
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    // Extract Twilio status callback parameters
    const messageSid = formData.get("MessageSid") as string;
    const messageStatus = formData.get("MessageStatus") as string;
    const errorCode = formData.get("ErrorCode") as string | null;
    const errorMessage = formData.get("ErrorMessage") as string | null;
    
    console.log("Twilio SMS Status Callback:", {
      messageSid,
      messageStatus,
      errorCode,
      errorMessage,
    });

    if (!messageSid || !messageStatus) {
      console.error("Missing required parameters");
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    // Use service role client to bypass RLS (webhooks don't have user auth)
    const supabase = createServiceRoleClient();

    // Map Twilio status to our allowed database values
    let dbStatus: string;
    if (messageStatus === "queued") {
      dbStatus = "queued";
    } else if (messageStatus === "accepted" || messageStatus === "sending" || messageStatus === "sent") {
      dbStatus = "sent";
    } else if (messageStatus === "delivered") {
      dbStatus = "delivered";
    } else if (messageStatus === "failed" || messageStatus === "undelivered") {
      dbStatus = "failed";
    } else {
      dbStatus = "sent"; // Default fallback
      console.warn(`Unknown Twilio status: ${messageStatus}, defaulting to 'sent'`);
    }

    // Update the SMS message status
    const { data, error } = await supabase
      .from("sms_messages")
      .update({
        status: dbStatus,
        error_code: errorCode,
        error_message: errorMessage,
      })
      .eq("twilio_sid", messageSid);

    if (error) {
      console.error("Error updating SMS status:", error);
      return NextResponse.json(
        { error: "Failed to update status" },
        { status: 500 }
      );
    }

    console.log("SMS status updated successfully:", messageSid, "->", messageStatus);

    // Return TwiML response (Twilio expects XML or empty 200 OK)
    return new NextResponse("", { status: 200 });
  } catch (error) {
    console.error("Error in Twilio SMS status webhook:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

