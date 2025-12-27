import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import twilio from "twilio";

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioClient =
  twilioAccountSid && twilioAuthToken ? twilio(twilioAccountSid, twilioAuthToken) : null;

/**
 * GET /api/calls/by-sid
 * Lookup call record by Twilio call SID
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const twilioCallSid = searchParams.get("twilioCallSid");

    if (!twilioCallSid) {
      return NextResponse.json(
        { error: "Twilio call SID is required" },
        { status: 400 }
      );
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    // Use service role to bypass RLS, then validate org matches user's org
    const serviceSupabase = createServiceRoleClient();

    const fetchCallBySid = async (sid: string) => {
      const { data: call } = await serviceSupabase
        .from("calls")
        .select("id, lead_id, user_id, status, twilio_call_sid, organization_id")
        .eq("twilio_call_sid", sid)
        .single();
      return call;
    };

    let call = await fetchCallBySid(twilioCallSid);

    // If not found, try resolving parent CallSid via Twilio (inbound child leg)
    if (!call && twilioClient) {
      try {
        const twilioCall = await twilioClient.calls(twilioCallSid).fetch();
        const parentSid = (twilioCall as any)?.parentCallSid;
        if (parentSid) {
          call = await fetchCallBySid(parentSid);
        }
      } catch (err) {
        console.error("Twilio fetch failed in by-sid lookup:", err);
      }
    }

    if (!call || call.organization_id !== profile.organization_id) {
      return NextResponse.json({
        found: false,
      });
    }

    return NextResponse.json({
      found: true,
      call: {
        id: call.id,
        leadId: call.lead_id,
        userId: call.user_id,
        status: call.status,
        twilioCallSid: call.twilio_call_sid,
      },
    });
  } catch (error: any) {
    console.error("Error looking up call by SID:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

