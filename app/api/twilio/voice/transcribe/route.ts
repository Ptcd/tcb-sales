import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * POST /api/twilio/voice/transcribe
 * Called when a voicemail transcription is complete
 * Updates the call record with transcription (email notification is sent from recording endpoint)
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const url = new URL(request.url);
    
    const callSid = formData.get("CallSid") as string;
    const transcriptionText = formData.get("TranscriptionText") as string;
    const transcriptionStatus = formData.get("TranscriptionStatus") as string;
    const userId = url.searchParams.get("userId");
    
    console.log("Transcription callback:", {
      callSid,
      transcriptionStatus,
      transcriptionText: transcriptionText?.substring(0, 100) + "...",
      userId,
    });

    // Use service role client
    const supabase = createServiceRoleClient();

    // Update the call record with transcription
    if (transcriptionStatus === "completed" && transcriptionText) {
      // Get existing notes to append transcription
      const { data: existingCall } = await supabase
        .from("calls")
        .select("notes")
        .eq("twilio_call_sid", callSid)
        .single();

      const existingNotes = existingCall?.notes || "";
      const newNotes = existingNotes.includes("Voicemail Transcription:")
        ? existingNotes.replace(/Voicemail Transcription:.*/, `Voicemail Transcription: ${transcriptionText}`)
        : `${existingNotes}\n\nVoicemail Transcription: ${transcriptionText}`.trim();

      await supabase
        .from("calls")
        .update({
          notes: newNotes,
        })
        .eq("twilio_call_sid", callSid);

      console.log("Voicemail transcription saved for call:", callSid);
    }

    return new NextResponse("", { status: 200 });
  } catch (error) {
    console.error("Error in transcription callback:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

