import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface TemplateConversionData {
  templateId: string | null;
  templateName: string;
  templateType: "email" | "sms";
  campaignId: string | null;
  campaignName: string | null;
  totalSent: number;
  uniqueLeads: number;
  trialsStarted: number;
  conversionRate: number;
}

/**
 * GET /api/reports/template-conversions
 * Get conversion metrics for email and SMS templates
 * Shows what percentage of leads who received each template started a trial
 * 
 * Query params:
 * - start_date: ISO date string (required)
 * - end_date: ISO date string (required)
 * - campaign_id: UUID (optional, filter by campaign)
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

    // Get user profile to check admin status
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const campaignId = searchParams.get("campaign_id");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "start_date and end_date are required" },
        { status: 400 }
      );
    }

    // Build date range
    const startDateTime = new Date(startDate);
    startDateTime.setHours(0, 0, 0, 0);
    const endDateTime = new Date(endDate);
    endDateTime.setHours(23, 59, 59, 999);

    const results: TemplateConversionData[] = [];

    // ============================================
    // Email Template Conversions
    // ============================================
    let emailQuery = supabase
      .from("email_messages")
      .select(`
        id,
        lead_id,
        template_id,
        email_templates:template_id (
          id,
          name,
          campaign_id,
          campaigns:campaign_id (
            id,
            name
          )
        ),
        search_results:lead_id (
          id,
          lead_status
        )
      `)
      .eq("status", "sent")
      .gte("sent_at", startDateTime.toISOString())
      .lte("sent_at", endDateTime.toISOString());

    if (campaignId && campaignId !== "all") {
      emailQuery = emailQuery.eq("campaign_id", campaignId);
    }

    const { data: emailMessages, error: emailError } = await emailQuery;

    if (emailError) {
      console.error("Error fetching email messages:", emailError);
    } else if (emailMessages) {
      // Group by template
      const emailByTemplate = new Map<string, {
        templateName: string;
        campaignId: string | null;
        campaignName: string | null;
        leads: Set<string>;
        conversions: Set<string>;
        totalSent: number;
      }>();

      for (const msg of emailMessages as any[]) {
        const templateId = msg.template_id || "no-template";
        const templateName = msg.email_templates?.name || "Custom (No Template)";
        const campaignIdVal = msg.email_templates?.campaign_id || null;
        const campaignNameVal = msg.email_templates?.campaigns?.name || null;
        const leadId = msg.lead_id;
        const leadStatus = msg.search_results?.lead_status;

        if (!emailByTemplate.has(templateId)) {
          emailByTemplate.set(templateId, {
            templateName,
            campaignId: campaignIdVal,
            campaignName: campaignNameVal,
            leads: new Set(),
            conversions: new Set(),
            totalSent: 0,
          });
        }

        const data = emailByTemplate.get(templateId)!;
        data.totalSent++;
        
        if (leadId) {
          data.leads.add(leadId);
          // Check if lead converted to trial
          if (leadStatus === "trial_started" || leadStatus === "converted" || leadStatus === "closed_won") {
            data.conversions.add(leadId);
          }
        }
      }

      // Convert to results
      for (const [templateId, data] of emailByTemplate) {
        const uniqueLeads = data.leads.size;
        const trialsStarted = data.conversions.size;
        const conversionRate = uniqueLeads > 0 ? (trialsStarted / uniqueLeads) * 100 : 0;

        results.push({
          templateId: templateId === "no-template" ? null : templateId,
          templateName: data.templateName,
          templateType: "email",
          campaignId: data.campaignId,
          campaignName: data.campaignName,
          totalSent: data.totalSent,
          uniqueLeads,
          trialsStarted,
          conversionRate: Math.round(conversionRate * 10) / 10,
        });
      }
    }

    // ============================================
    // SMS Template Conversions
    // ============================================
    let smsQuery = supabase
      .from("sms_messages")
      .select(`
        id,
        lead_id,
        template_id,
        sms_templates:template_id (
          id,
          name,
          campaign_id,
          campaigns:campaign_id (
            id,
            name
          )
        ),
        search_results:lead_id (
          id,
          lead_status
        )
      `)
      .in("status", ["sent", "delivered"])
      .gte("sent_at", startDateTime.toISOString())
      .lte("sent_at", endDateTime.toISOString());

    if (campaignId && campaignId !== "all") {
      smsQuery = smsQuery.eq("campaign_id", campaignId);
    }

    const { data: smsMessages, error: smsError } = await smsQuery;

    if (smsError) {
      console.error("Error fetching SMS messages:", smsError);
    } else if (smsMessages) {
      // Group by template
      const smsByTemplate = new Map<string, {
        templateName: string;
        campaignId: string | null;
        campaignName: string | null;
        leads: Set<string>;
        conversions: Set<string>;
        totalSent: number;
      }>();

      for (const msg of smsMessages as any[]) {
        const templateId = msg.template_id || "no-template";
        const templateName = msg.sms_templates?.name || "Custom (No Template)";
        const campaignIdVal = msg.sms_templates?.campaign_id || null;
        const campaignNameVal = msg.sms_templates?.campaigns?.name || null;
        const leadId = msg.lead_id;
        const leadStatus = msg.search_results?.lead_status;

        if (!smsByTemplate.has(templateId)) {
          smsByTemplate.set(templateId, {
            templateName,
            campaignId: campaignIdVal,
            campaignName: campaignNameVal,
            leads: new Set(),
            conversions: new Set(),
            totalSent: 0,
          });
        }

        const data = smsByTemplate.get(templateId)!;
        data.totalSent++;
        
        if (leadId) {
          data.leads.add(leadId);
          // Check if lead converted to trial
          if (leadStatus === "trial_started" || leadStatus === "converted" || leadStatus === "closed_won") {
            data.conversions.add(leadId);
          }
        }
      }

      // Convert to results
      for (const [templateId, data] of smsByTemplate) {
        const uniqueLeads = data.leads.size;
        const trialsStarted = data.conversions.size;
        const conversionRate = uniqueLeads > 0 ? (trialsStarted / uniqueLeads) * 100 : 0;

        results.push({
          templateId: templateId === "no-template" ? null : templateId,
          templateName: data.templateName,
          templateType: "sms",
          campaignId: data.campaignId,
          campaignName: data.campaignName,
          totalSent: data.totalSent,
          uniqueLeads,
          trialsStarted,
          conversionRate: Math.round(conversionRate * 10) / 10,
        });
      }
    }

    // Sort results by total sent (highest first)
    results.sort((a, b) => b.totalSent - a.totalSent);

    // Calculate summary stats
    const totalEmails = results
      .filter(r => r.templateType === "email")
      .reduce((sum, r) => sum + r.totalSent, 0);
    const totalSMS = results
      .filter(r => r.templateType === "sms")
      .reduce((sum, r) => sum + r.totalSent, 0);
    const totalConversions = results.reduce((sum, r) => sum + r.trialsStarted, 0);
    const totalUniqueLeads = new Set(results.flatMap(r => r.uniqueLeads)).size;
    const overallConversionRate = totalUniqueLeads > 0 
      ? Math.round((totalConversions / totalUniqueLeads) * 1000) / 10 
      : 0;

    return NextResponse.json({
      success: true,
      templates: results,
      summary: {
        totalEmails,
        totalSMS,
        totalMessages: totalEmails + totalSMS,
        totalConversions,
        overallConversionRate,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/reports/template-conversions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



