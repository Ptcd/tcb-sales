import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioClient = accountSid && authToken ? twilio(accountSid, authToken) : null;

/**
 * GET /api/calls/[id]/recording
 * Get recording URL for a call (with authentication)
 * 
 * Query params:
 * - stream=true: Stream the audio file directly (proxies through server with auth)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const stream = searchParams.get("stream") === "true";
    
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get call record
    const { data: call } = await supabase
      .from("calls")
      .select("id, twilio_call_sid, recording_url, organization_id")
      .eq("id", id)
      .single();

    if (!call) {
      return NextResponse.json(
        { error: "Call not found" },
        { status: 404 }
      );
    }

    // Verify user has access to this call's organization
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile || profile.organization_id !== call.organization_id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // If streaming, proxy the audio file with authentication
    if (stream && call.recording_url && twilioClient && call.twilio_call_sid && accountSid && authToken) {
      try {
        // Extract recording SID from URL
        const recordingSidMatch = call.recording_url.match(/\/Recordings\/([^\/]+)/);
        if (recordingSidMatch && recordingSidMatch[1]) {
          const recordingSid = recordingSidMatch[1];
          
          // Construct Twilio MP3 URL
          const mp3Url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}.mp3`;
          
          // Fetch the recording with Basic Auth
          const response = await fetch(mp3Url, {
            headers: {
              Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
            },
          });

          if (!response.ok) {
            throw new Error(`Twilio API returned ${response.status}`);
          }

          // Stream the audio back to the browser
          const audioBuffer = await response.arrayBuffer();
          
          return new NextResponse(audioBuffer, {
            headers: {
              'Content-Type': 'audio/mpeg',
              'Content-Length': audioBuffer.byteLength.toString(),
              'Cache-Control': 'public, max-age=3600',
            },
          });
        }
      } catch (streamError: any) {
        console.error("Error streaming recording:", streamError);
        return NextResponse.json(
          { error: "Failed to stream recording" },
          { status: 500 }
        );
      }
    }

    // If we have a recording URL, try to get authenticated URL from Twilio (JSON response)
    if (call.recording_url && twilioClient && call.twilio_call_sid) {
      try {
        // Extract recording SID from URL (format: https://api.twilio.com/2010-04-01/Accounts/.../Recordings/RE...)
        const recordingSidMatch = call.recording_url.match(/\/Recordings\/([^\/]+)/);
        if (recordingSidMatch && recordingSidMatch[1]) {
          const recordingSid = recordingSidMatch[1];
          
          // Get recording from Twilio
          const recording = await twilioClient.recordings(recordingSid).fetch();
          
          // Construct full Twilio URL (recording.uri is relative, needs full domain)
          const mp3Uri = recording.uri.replace('.json', '.mp3');
          const fullUrl = mp3Uri.startsWith('http') 
            ? mp3Uri 
            : `https://api.twilio.com${mp3Uri}`;
          
          // Return proxy URL instead of direct Twilio URL
          return NextResponse.json({
            recordingUrl: `/api/calls/${id}/recording?stream=true`,
            recordingSid: recording.sid,
            duration: recording.duration,
          });
        }
      } catch (twilioError: any) {
        console.error("Error fetching recording from Twilio:", twilioError);
        // Fall back to the stored URL
      }
    }

    // Return stored URL or null
    return NextResponse.json({
      recordingUrl: call.recording_url || null,
      recordingSid: null,
      duration: null,
    });
  } catch (error: any) {
    console.error("Error getting recording:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

