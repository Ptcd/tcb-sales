import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/sdr-performance
 * 
 * Get SDR performance metrics: dials, conversations, trials, activated, paid
 * Only shows SDRs (role = 'member') who have made calls in the date range
 * 
 * Query params:
 * - start_date: YYYY-MM-DD (defaults to 30 days ago)
 * - end_date: YYYY-MM-DD (defaults to today)
 * - campaign_id: optional campaign filter
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

    // Verify admin role
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (profile.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    
    // Default to last 30 days
    const defaultStartDate = new Date();
    defaultStartDate.setDate(defaultStartDate.getDate() - 30);
    
    const startDate = searchParams.get("start_date") || defaultStartDate.toISOString().split("T")[0];
    const endDate = searchParams.get("end_date") || new Date().toISOString().split("T")[0];
    const campaignId = searchParams.get("campaign_id");

    // Central Time offset: +6 hours from midnight to get UTC
    const startIso = `${startDate}T06:00:00.000Z`;
    const endDateObj = new Date(`${endDate}T06:00:00.000Z`);
    endDateObj.setDate(endDateObj.getDate() + 1);
    const endIso = endDateObj.toISOString().replace(/T.*/, "T05:59:59.999Z");

    // Get all SDRs (members only) in the organization
    const { data: sdrs, error: sdrsError } = await supabase
      .from("user_profiles")
      .select("id, full_name, email")
      .eq("organization_id", profile.organization_id)
      .eq("role", "member");

    if (sdrsError || !sdrs || sdrs.length === 0) {
      return NextResponse.json({
        success: true,
        summary: {
          totalDials: 0,
          totalConversations: 0,
          totalTrials: 0,
          totalActivated: 0,
          totalPaid: 0,
          totalMRR: 0,
        },
        sdrs: [],
      });
    }

    const sdrIds = sdrs.map(s => s.id);

    // Fetch all calls with pagination to handle >1000 records
    const allCalls: any[] = [];
    const pageSize = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      // Build call query base with pagination
      let callQuery = supabase
        .from("calls")
        .select("id, user_id, outcome_code, duration, lead_id, campaign_id")
        .eq("organization_id", profile.organization_id)
        .in("user_id", sdrIds)
        .gte("initiated_at", startIso)
        .lte("initiated_at", endIso)
        .range(offset, offset + pageSize - 1)
        .order("initiated_at", { ascending: true });

      if (campaignId) {
        callQuery = callQuery.eq("campaign_id", campaignId);
      }

      const { data: calls, error: callsError } = await callQuery;

      if (callsError) {
        console.error("Error fetching calls:", callsError);
        return NextResponse.json(
          { error: "Failed to fetch calls" },
          { status: 500 }
        );
      }

      if (calls && calls.length > 0) {
        allCalls.push(...calls);
        // If we got fewer than pageSize, we've reached the end
        hasMore = calls.length === pageSize;
        offset += pageSize;
      } else {
        hasMore = false;
      }
    }

    // Get trial pipeline data for activated/paid counts with pagination
    const trialPipelines: any[] = [];
    let trialOffset = 0;
    let hasMoreTrials = true;

    while (hasMoreTrials) {
      const { data: trials, error: trialError } = await supabase
        .from("trial_pipeline")
        .select("crm_lead_id, owner_sdr_id, calculator_modified_at, first_lead_received_at, trial_started_at, converted_at, mrr, credits_remaining")
        .in("owner_sdr_id", sdrIds)
        .gte("trial_started_at", startIso)
        .lte("trial_started_at", endIso)
        .range(trialOffset, trialOffset + pageSize - 1)
        .order("trial_started_at", { ascending: true });

      if (trialError) {
        console.error("Error fetching trial pipeline:", trialError);
        hasMoreTrials = false;
      } else if (trials && trials.length > 0) {
        trialPipelines.push(...trials);
        hasMoreTrials = trials.length === pageSize;
        trialOffset += pageSize;
      } else {
        hasMoreTrials = false;
      }
    }

    // Process data per SDR
    const sdrData = await Promise.all(
      sdrs.map(async (sdr) => {
        const sdrCalls = (allCalls || []).filter(c => c.user_id === sdr.id);
        
        // Count dials (all calls)
        const dials = sdrCalls.length;
        
        // Count conversations (calls with conversation outcomes)
        const conversations = sdrCalls.filter(c => 
          ["NOT_INTERESTED", "INTERESTED_INFO_SENT", "TRIAL_STARTED", "CALLBACK_SCHEDULED"].includes(c.outcome_code || "")
        ).length;
        
        // Count trials (calls with TRIAL_STARTED outcome)
        const trials = sdrCalls.filter(c => c.outcome_code === "TRIAL_STARTED").length;
        
        // Count activated (proven install = credits decremented from 20)
        const activated = (trialPipelines || []).filter(tp => 
          tp.owner_sdr_id === sdr.id && 
          tp.credits_remaining !== null && 
          tp.credits_remaining < 20
        ).length;
        
        // Count paid (trial_pipeline with converted_at)
        const paid = (trialPipelines || []).filter(tp => 
          tp.owner_sdr_id === sdr.id && tp.converted_at
        ).length;
        
        // Sum MRR for paid trials
        const mrr = (trialPipelines || [])
          .filter(tp => tp.owner_sdr_id === sdr.id && tp.converted_at && tp.mrr)
          .reduce((sum, tp) => sum + (Number(tp.mrr) || 0), 0);

        // Activation rate (only if >= 5 trials)
        const activationRate = trials >= 5 ? Math.round((activated / trials) * 100) : null;

        // Activated within 24h of trial start (proven install with credits < 20)
        const activatedWithin24h = (trialPipelines || []).filter(tp => {
          if (tp.owner_sdr_id !== sdr.id) return false;
          if (tp.credits_remaining === null || tp.credits_remaining >= 20) return false;
          if (!tp.trial_started_at) return false;
          // For now, count all proven installs - we don't have exact activation timestamp
          // In future, could use credits_first_used_at if tracked
          return true;
        }).length;

        return {
          id: sdr.id,
          name: sdr.full_name || sdr.email || "Unknown",
          email: sdr.email || "",
          dials,
          conversations,
          trials,
          activated,
          paid,
          mrr: Math.round(mrr * 100) / 100,
          activationRate,
          activatedWithin24h,
          hasEnoughTrials: trials >= 5,
        };
      })
    );

    // Filter out SDRs with no activity (no calls)
    const activeSdrs = sdrData.filter(sdr => sdr.dials > 0);

    // Calculate totals
    const totalTrialsForRate = activeSdrs.reduce((sum, s) => sum + s.trials, 0);
    const totalActivatedForRate = activeSdrs.reduce((sum, s) => sum + s.activated, 0);
    const activationRate = totalTrialsForRate >= 5 
      ? Math.round((totalActivatedForRate / totalTrialsForRate) * 100) 
      : null;
    const totalActivatedWithin24h = activeSdrs.reduce((sum, s) => sum + (s.activatedWithin24h || 0), 0);

    const summary = {
      totalDials: activeSdrs.reduce((sum, s) => sum + s.dials, 0),
      totalConversations: activeSdrs.reduce((sum, s) => sum + s.conversations, 0),
      totalTrials: activeSdrs.reduce((sum, s) => sum + s.trials, 0),
      totalActivated: activeSdrs.reduce((sum, s) => sum + s.activated, 0),
      totalPaid: activeSdrs.reduce((sum, s) => sum + s.paid, 0),
      totalMRR: Math.round(activeSdrs.reduce((sum, s) => sum + s.mrr, 0) * 100) / 100,
      activationRate,
      activationRatio: `${totalActivatedForRate}/${totalTrialsForRate}`,
      activatedWithin24h: totalActivatedWithin24h,
      activatedWithin24hRate: totalTrialsForRate >= 5 
        ? Math.round((totalActivatedWithin24h / totalTrialsForRate) * 100) 
        : null,
    };

    return NextResponse.json({
      success: true,
      summary,
      sdrs: activeSdrs.sort((a, b) => b.dials - a.dials), // Sort by dials descending
      period: { start_date: startDate, end_date: endDate },
    });
  } catch (error: any) {
    console.error("Error in sdr-performance:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

