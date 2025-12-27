import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as brevo from "@getbrevo/brevo";

const brevoApiKey = process.env.BREVO_API_KEY;
const brevoClient = brevoApiKey ? new brevo.TransactionalEmailsApi() : null;
if (brevoClient && brevoApiKey) {
  brevoClient.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, brevoApiKey);
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.BREVO_FROM_EMAIL || "";
const FROM_EMAIL = process.env.DEFAULT_SENDER_EMAIL || "no-reply@autosalvageautomation.com";
const FROM_NAME = "CRM Admin Reports";

/**
 * GET /api/cron/daily-admin-summary
 * Send consolidated daily admin email with all SDRs + activator throughput
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date();
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const dayAfterTomorrow = new Date(tomorrow);
  dayAfterTomorrow.setUTCDate(dayAfterTomorrow.getUTCDate() + 1);

  // Get all organizations
  const { data: organizations } = await supabase
    .from("organizations")
    .select("id, name");

  if (!organizations || organizations.length === 0) {
    return NextResponse.json({ success: true, message: "No organizations found" });
  }

  // Process each organization
  for (const org of organizations) {
    // Get all SDRs in this org
    const { data: sdrs } = await supabase
      .from("user_profiles")
      .select("id, email, full_name")
      .eq("organization_id", org.id)
      .eq("role", "member");

    if (!sdrs || sdrs.length === 0) continue;

    // Get all activators in this org
    const { data: activators } = await supabase
      .from("user_profiles")
      .select("id, email, full_name")
      .eq("organization_id", org.id)
      .eq("is_activator", true);

    // Build SDR summary table
    const sdrSummaries = [];
    for (const sdr of sdrs) {
      // Get today's calls
      const { count: dials } = await supabase
        .from("calls")
        .select("*", { count: "exact", head: true })
        .eq("user_id", sdr.id)
        .eq("call_type", "outbound")
        .gte("initiated_at", today.toISOString());

      // Get conversations
      const { count: conversations } = await supabase
        .from("calls")
        .select("*", { count: "exact", head: true })
        .eq("user_id", sdr.id)
        .eq("call_type", "outbound")
        .in("outcome_code", ["NOT_INTERESTED", "INTERESTED_INFO_SENT", "ONBOARDING_SCHEDULED", "CALLBACK_SCHEDULED"])
        .gte("initiated_at", today.toISOString());

      // Get onboardings scheduled today
      const { count: onboardingsScheduled } = await supabase
        .from("activation_meetings")
        .select("*", { count: "exact", head: true })
        .eq("scheduled_by_sdr_user_id", sdr.id)
        .gte("scheduled_start_at", today.toISOString())
        .lt("scheduled_start_at", tomorrow.toISOString());

      // Get onboardings attended today
      const { count: onboardingsAttended } = await supabase
        .from("activation_meetings")
        .select("*", { count: "exact", head: true })
        .eq("scheduled_by_sdr_user_id", sdr.id)
        .eq("status", "completed")
        .gte("scheduled_start_at", today.toISOString())
        .lt("scheduled_start_at", tomorrow.toISOString());

      // Calculate show rate (7-day rolling)
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
      
      const { count: scheduled7d } = await supabase
        .from("activation_meetings")
        .select("*", { count: "exact", head: true })
        .eq("scheduled_by_sdr_user_id", sdr.id)
        .gte("scheduled_start_at", sevenDaysAgo.toISOString());

      const { count: attended7d } = await supabase
        .from("activation_meetings")
        .select("*", { count: "exact", head: true })
        .eq("scheduled_by_sdr_user_id", sdr.id)
        .eq("status", "completed")
        .gte("scheduled_start_at", sevenDaysAgo.toISOString());

      const showRate = scheduled7d && scheduled7d > 0 
        ? Math.round(((attended7d || 0) / scheduled7d) * 100) 
        : 0;

      // Get activations (first leads received) - 7 day rolling
      const { count: activations } = await supabase
        .from("trial_pipeline")
        .select("*", { count: "exact", head: true })
        .eq("owner_sdr_id", sdr.id)
        .not("first_lead_received_at", "is", null)
        .gte("first_lead_received_at", sevenDaysAgo.toISOString());

      // Get paid hours (from daily_sdr_summaries if available, or calculate)
      const { data: todaySummary } = await supabase
        .from("daily_sdr_summaries")
        .select("paid_hours")
        .eq("sdr_user_id", sdr.id)
        .eq("date", today.toISOString().split("T")[0])
        .single();

      sdrSummaries.push({
        name: sdr.full_name || sdr.email,
        paidHours: todaySummary?.paid_hours || 0,
        dials: dials || 0,
        conversations: conversations || 0,
        onboardingsScheduled: onboardingsScheduled || 0,
        onboardingsAttended: onboardingsAttended || 0,
        showRate,
        activations: activations || 0,
        flags: [] as string[],
      });

      // Add flags
      if (showRate < 50 && scheduled7d && scheduled7d >= 3) {
        sdrSummaries[sdrSummaries.length - 1].flags.push(`Low show rate: ${showRate}%`);
      }
    }

    // Build activator summary
    const activatorSummaries = [];
    for (const activator of activators || []) {
      // Meetings scheduled tomorrow
      const { count: scheduledTomorrow } = await supabase
        .from("activation_meetings")
        .select("*", { count: "exact", head: true })
        .eq("activator_user_id", activator.id)
        .eq("status", "scheduled")
        .gte("scheduled_start_at", tomorrow.toISOString())
        .lt("scheduled_start_at", dayAfterTomorrow.toISOString());

      // Attended today
      const { count: attendedToday } = await supabase
        .from("activation_meetings")
        .select("*", { count: "exact", head: true })
        .eq("activator_user_id", activator.id)
        .eq("status", "completed")
        .gte("scheduled_start_at", today.toISOString())
        .lt("scheduled_start_at", tomorrow.toISOString());

      // No-shows today
      const { count: noShowsToday } = await supabase
        .from("activation_meetings")
        .select("*", { count: "exact", head: true })
        .eq("activator_user_id", activator.id)
        .eq("status", "no_show")
        .gte("scheduled_start_at", today.toISOString())
        .lt("scheduled_start_at", tomorrow.toISOString());

      // Activations today (first leads received)
      const { count: activationsToday } = await supabase
        .from("trial_pipeline")
        .select("*", { count: "exact", head: true })
        .eq("assigned_activator_id", activator.id)
        .not("first_lead_received_at", "is", null)
        .gte("first_lead_received_at", today.toISOString())
        .lt("first_lead_received_at", tomorrow.toISOString());

      activatorSummaries.push({
        name: activator.full_name || activator.email,
        scheduledTomorrow: scheduledTomorrow || 0,
        attendedToday: attendedToday || 0,
        noShowsToday: noShowsToday || 0,
        activationsToday: activationsToday || 0,
      });
    }

    // Build flagged items
    const flaggedItems = [];
    
    // SDRs with low show rate
    for (const sdr of sdrSummaries) {
      if (sdr.showRate < 50 && sdr.onboardingsScheduled >= 3) {
        flaggedItems.push({
          type: "low_show_rate",
          message: `${sdr.name}: Show rate ${sdr.showRate}% (${sdr.onboardingsAttended}/${sdr.onboardingsScheduled} attended)`,
        });
      }
    }

    // Stale scheduled meetings (scheduled but not marked attended/no-show after meeting time)
    const { data: staleMeetings } = await supabase
      .from("activation_meetings")
      .select("id, scheduled_start_at, attendee_name, activator_user_id")
      .eq("status", "scheduled")
      .eq("organization_id", org.id)
      .lt("scheduled_start_at", now.toISOString())
      .lt("scheduled_start_at", new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()); // 2+ hours past

    if (staleMeetings && staleMeetings.length > 0) {
      for (const meeting of staleMeetings) {
        flaggedItems.push({
          type: "stale_meeting",
          message: `Meeting with ${meeting.attendee_name} at ${new Date(meeting.scheduled_start_at).toLocaleString()} not marked attended/no-show`,
        });
      }
    }

    // Get installs marked today with URLs
    const { data: todayInstalls } = await supabase
      .from('trial_pipeline')
      .select(`
        id,
        install_url,
        calculator_installed_at,
        first_lead_received_at,
        owner_sdr_id,
        assigned_activator_id,
        search_results!inner(name, website, organization_id)
      `)
      .eq('search_results.organization_id', org.id)
      .gte('calculator_installed_at', today.toISOString())
      .lt('calculator_installed_at', tomorrow.toISOString())
      .order('calculator_installed_at', { ascending: false });

    // Get SDR and Activator names for the installs
    const installsWithNames = await Promise.all((todayInstalls || []).map(async (install: any) => {
      const { data: sdr } = await supabase
        .from('user_profiles')
        .select('full_name, email')
        .eq('id', install.owner_sdr_id)
        .single();
      
      const { data: activator } = await supabase
        .from('user_profiles')
        .select('full_name, email')
        .eq('id', install.assigned_activator_id)
        .single();
      
      // search_results is returned as an array from the join, get first item
      const searchResults = Array.isArray(install.search_results) 
        ? install.search_results[0] 
        : install.search_results;
      
      return {
        accountName: searchResults?.name || 'Unknown',
        websiteUrl: install.install_url || searchResults?.website || '',
        installedAt: install.calculator_installed_at,
        firstLeadAt: install.first_lead_received_at,
        sdrName: sdr?.full_name || sdr?.email || 'Unknown',
        activatorName: activator?.full_name || activator?.email || 'Unknown',
      };
    }));

    // Get admin emails for this org
    const { data: admins } = await supabase
      .from("user_profiles")
      .select("email, full_name")
      .eq("organization_id", org.id)
      .in("role", ["admin"]);

    if (!admins || admins.length === 0) continue;

    // Send consolidated email
    if (brevoClient) {
      const htmlContent = generateAdminEmailHtml(
        org.name,
        sdrSummaries,
        activatorSummaries,
        flaggedItems,
        installsWithNames,
        today
      );

      for (const admin of admins) {
        if (admin.email) {
          try {
            const sendSmtpEmail = new brevo.SendSmtpEmail();
            sendSmtpEmail.subject = `Daily Admin Summary – ${org.name} – ${today.toISOString().split("T")[0]}`;
            sendSmtpEmail.htmlContent = htmlContent;
            sendSmtpEmail.sender = { name: FROM_NAME, email: FROM_EMAIL };
            sendSmtpEmail.to = [{ email: admin.email }];
            sendSmtpEmail.tags = ["admin-daily-summary"];

            await brevoClient.sendTransacEmail(sendSmtpEmail);
          } catch (err) {
            console.error(`Failed to send admin email to ${admin.email}:`, err);
          }
        }
      }
    }
  }

  return NextResponse.json({ success: true });
}

function generateAdminEmailHtml(
  orgName: string,
  sdrSummaries: any[],
  activatorSummaries: any[],
  flaggedItems: any[],
  installsWithNames: any[],
  date: Date
): string {
  const dateStr = date.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 20px; background-color: #f3f4f6; }
        .container { max-width: 900px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); color: white; padding: 24px; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
        .content { padding: 24px; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th { background: #f9fafb; padding: 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #e5e7eb; }
        td { padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
        .section-title { font-size: 16px; font-weight: 600; color: #1f2937; margin: 24px 0 12px; }
        .flagged { background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px; margin: 8px 0; }
        .flagged-title { color: #dc2626; font-weight: 600; margin-bottom: 8px; }
        .flag-item { color: #991b1b; margin: 4px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Daily Admin Summary</h1>
          <p>${orgName} • ${dateStr}</p>
        </div>
        <div class="content">
          <div class="section-title">SDR Summary</div>
          <table>
            <thead>
              <tr>
                <th>SDR</th>
                <th>Paid Hours</th>
                <th>Dials</th>
                <th>Conversations</th>
                <th>Onboardings Scheduled</th>
                <th>Attended</th>
                <th>Show Rate</th>
                <th>Activations (7d)</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              ${sdrSummaries.map(sdr => `
                <tr>
                  <td>${sdr.name}</td>
                  <td>${sdr.paidHours.toFixed(1)}</td>
                  <td>${sdr.dials}</td>
                  <td>${sdr.conversations}</td>
                  <td>${sdr.onboardingsScheduled}</td>
                  <td>${sdr.onboardingsAttended}</td>
                  <td>${sdr.showRate}%</td>
                  <td>${sdr.activations}</td>
                  <td>${sdr.flags.length > 0 ? sdr.flags.join(", ") : "—"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>

          ${activatorSummaries.length > 0 ? `
            <div class="section-title">Activator Summary</div>
            <table>
              <thead>
                <tr>
                  <th>Activator</th>
                  <th>Meetings Tomorrow</th>
                  <th>Attended Today</th>
                  <th>No-Shows Today</th>
                  <th>Activations Today</th>
                </tr>
              </thead>
              <tbody>
                ${activatorSummaries.map(act => `
                  <tr>
                    <td>${act.name}</td>
                    <td>${act.scheduledTomorrow}</td>
                    <td>${act.attendedToday}</td>
                    <td>${act.noShowsToday}</td>
                    <td>${act.activationsToday}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          ` : ""}

          ${installsWithNames.length > 0 ? `
            <div class="section-title">Installs Marked Today (Verify URLs)</div>
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Website</th>
                  <th>Installed</th>
                  <th>First Lead</th>
                  <th>SDR</th>
                  <th>Activator</th>
                </tr>
              </thead>
              <tbody>
                ${installsWithNames.map(install => `
                  <tr>
                    <td>${install.accountName}</td>
                    <td><a href="${install.websiteUrl}" target="_blank" style="color: #3b82f6;">${install.websiteUrl || '—'}</a></td>
                    <td>${new Date(install.installedAt).toLocaleTimeString()}</td>
                    <td>${install.firstLeadAt ? new Date(install.firstLeadAt).toLocaleTimeString() : '—'}</td>
                    <td>${install.sdrName}</td>
                    <td>${install.activatorName}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : ''}

          ${flaggedItems.length > 0 ? `
            <div class="section-title">Flagged Items</div>
            <div class="flagged">
              <div class="flagged-title">⚠️ Attention Required</div>
              ${flaggedItems.map(item => `
                <div class="flag-item">• ${item.message}</div>
              `).join("")}
            </div>
          ` : ""}
        </div>
      </div>
    </body>
    </html>
  `;
}

