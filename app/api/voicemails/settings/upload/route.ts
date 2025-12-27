import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";

/**
 * POST /api/voicemails/settings/upload
 * Uploads a voicemail greeting audio file to storage and sets the greeting URL for the phone number.
 * Expects FormData: phoneNumberId, file (binary)
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const phoneNumberId = formData.get("phoneNumberId") as string;
    const file = formData.get("file") as File | null;

    if (!phoneNumberId || !file) {
      return NextResponse.json(
        { error: "phoneNumberId and file are required" },
        { status: 400 }
      );
    }

    // Use service role for storage
    const supabase = createServiceRoleClient();

    // Upload to storage bucket "voicemail-greetings"
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    const ext = file.name.split(".").pop() || "wav";
    const lowerExt = ext.toLowerCase();
    // Accept webm for browser recordings (stored as-is, Twilio TTS fallback if format not supported)
    const supported = ["wav", "mp3", "ogg", "flac", "webm"];
    if (!supported.includes(lowerExt)) {
      return NextResponse.json(
        { error: "Unsupported audio format. Use wav, mp3, ogg, flac, or webm." },
        { status: 400 }
      );
    }
    const path = `${phoneNumberId}/${Date.now()}-${randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("voicemail-greetings")
      .upload(path, fileBuffer, {
        contentType: file.type || "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload greeting", details: uploadError.message },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from("voicemail-greetings")
      .getPublicUrl(path);

    const publicUrl = publicUrlData?.publicUrl;
    if (!publicUrl) {
      return NextResponse.json(
        { error: "Failed to get public URL" },
        { status: 500 }
      );
    }

    // Save greeting URL to phone number record
    const { error: updateError } = await supabase
      .from("twilio_phone_numbers")
      .update({ voicemail_greeting: publicUrl })
      .eq("id", phoneNumberId);

    if (updateError) {
      console.error("Update greeting URL error:", updateError);
      return NextResponse.json(
        { error: "Failed to save greeting URL", details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (error: any) {
    console.error("Error uploading greeting:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


