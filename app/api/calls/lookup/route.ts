import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/calls/lookup
 * Lookup lead information by phone number
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
    const phoneNumber = searchParams.get("phoneNumber");

    if (!phoneNumber) {
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 }
      );
    }

    // Clean phone number (remove non-digits)
    const cleanPhone = phoneNumber.replace(/\D/g, "");

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

    // Search for lead by phone number
    const { data: leads } = await supabase
      .from("search_results")
      .select(`
        id,
        name,
        address,
        phone,
        email,
        website,
        lead_status,
        assigned_to,
        last_contacted_at,
        last_call_made_at,
        organization_id
      `)
      .eq("organization_id", profile.organization_id)
      .or(`phone.eq.${phoneNumber},phone.ilike.%${cleanPhone}%`)
      .limit(1)
      .single();

    if (!leads) {
      return NextResponse.json({
        found: false,
        phoneNumber: phoneNumber,
      });
    }

    // Get assigned user name if assigned
    let assignedRepName = null;
    if (leads.assigned_to) {
      const { data: assignedUser } = await supabase
        .from("user_profiles")
        .select("email, full_name")
        .eq("id", leads.assigned_to)
        .single();
      
      assignedRepName = assignedUser?.full_name || assignedUser?.email || null;
    }

    // Get last call information
    const { data: lastCall } = await supabase
      .from("calls")
      .select("id, status, outcome, initiated_at, updated_at, ended_at, duration, notes")
      .eq("lead_id", leads.id)
      .order("updated_at", { ascending: false })
      .order("initiated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get campaign info if lead is in a campaign
    const { data: campaignLead } = await supabase
      .from("campaign_leads")
      .select(`
        campaign_id,
        campaigns (
          id,
          name
        )
      `)
      .eq("lead_id", leads.id)
      .limit(1)
      .single();

    // Handle campaigns as array (Supabase returns nested relations as arrays)
    const campaign = campaignLead?.campaigns 
      ? (Array.isArray(campaignLead.campaigns) 
          ? campaignLead.campaigns[0] 
          : campaignLead.campaigns)
      : null;

    // Use the most recent timestamp from either the lead's last_call_made_at or the actual last call
    let lastContactedAt = leads.last_call_made_at || leads.last_contacted_at;
    if (lastCall) {
      const callTimestamp = lastCall.ended_at || lastCall.updated_at || lastCall.initiated_at;
      if (callTimestamp) {
        const leadTimestamp = lastContactedAt ? new Date(lastContactedAt).getTime() : 0;
        const callTime = new Date(callTimestamp).getTime();
        // Use whichever is more recent
        if (callTime > leadTimestamp) {
          lastContactedAt = callTimestamp;
        }
      }
    }

    return NextResponse.json({
      found: true,
      lead: {
        id: leads.id,
        name: leads.name,
        address: leads.address,
        phone: leads.phone,
        email: leads.email,
        website: leads.website,
        leadStatus: leads.lead_status,
        assignedTo: leads.assigned_to,
        assignedRepName: assignedRepName,
        lastContactedAt: lastContactedAt,
        campaign: campaign ? {
          id: campaign.id,
          name: campaign.name,
        } : null,
        lastCall: lastCall ? {
          id: lastCall.id,
          status: lastCall.status,
          outcome: lastCall.outcome,
          initiatedAt: lastCall.ended_at || lastCall.updated_at || lastCall.initiated_at,
          duration: lastCall.duration,
          notes: lastCall.notes,
        } : null,
      },
    });
  } catch (error: any) {
    console.error("Error looking up phone number:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

