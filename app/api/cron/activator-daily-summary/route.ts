import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as brevo from "@getbrevo/brevo";

const brevoApiKey = process.env.BREVO_API_KEY;
const brevoClient = brevoApiKey ? new brevo.TransactionalEmailsApi() : null;
if (brevoClient && brevoApiKey) {
  brevoClient.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, brevoApiKey);
}

const FROM_EMAIL = process.env.DEFAULT_SENDER_EMAIL || "no-reply@autosalvageautomation.com";
const FROM_NAME = "CRM Activator Reports";

// Send at 6pm in each activator's timezone
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get all activators
  const { data: activators } = await supabase
    .from('user_profiles')
    .select('id, email, full_name, activator_timezone')
    .eq('is_activator', true);

  const now = new Date();
  
  for (const activator of activators || []) {
    // Use UTC date for consistency with other daily emails
    const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const todayStart = new Date(`${todayStr}T00:00:00Z`);
    const todayEnd = new Date(`${todayStr}T23:59:59Z`);
    
    // Get their meetings today
    const { data: meetings } = await supabase
      .from('activation_meetings')
      .select('*, trial_pipeline(search_results(name))')
      .eq('activator_user_id', activator.id)
      .gte('scheduled_start_at', todayStart.toISOString())
      .lt('scheduled_start_at', todayEnd.toISOString());
    
    const completed = meetings?.filter(m => m.status === 'completed') || [];
    const noShows = meetings?.filter(m => m.status === 'no_show') || [];
    const installed = meetings?.filter(m => m.install_verified) || [];
    
    // Get tomorrow's meetings
    const tomorrowStart = new Date(todayEnd);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    tomorrowStart.setHours(0, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setHours(23, 59, 59, 999);
    
    const { data: tomorrowMeetings } = await supabase
      .from('activation_meetings')
      .select('*, trial_pipeline(search_results(name))')
      .eq('activator_user_id', activator.id)
      .eq('status', 'scheduled')
      .gte('scheduled_start_at', tomorrowStart.toISOString())
      .lt('scheduled_start_at', tomorrowEnd.toISOString())
      .order('scheduled_start_at', { ascending: true });
    
    // Get first leads received today for their installs
    const { data: firstLeads } = await supabase
      .from('trial_pipeline')
      .select('search_results(name)')
      .eq('assigned_activator_id', activator.id)
      .gte('first_lead_received_at', todayStart.toISOString())
      .lt('first_lead_received_at', todayEnd.toISOString());
    
    // Send email
    if (brevoClient && activator.email) {
      await sendActivatorDailyEmail(activator, {
        date: todayStr,
        completed,
        noShows,
        installed,
        firstLeads: firstLeads || [],
        tomorrowMeetings: tomorrowMeetings || [],
      });
    }
  }

  return NextResponse.json({ success: true });
}

async function sendActivatorDailyEmail(
  activator: { email: string; full_name: string | null },
  data: {
    date: string;
    completed: any[];
    noShows: any[];
    installed: any[];
    firstLeads: any[];
    tomorrowMeetings: any[];
  }
) {
  if (!brevoClient) return;

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .card { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #059669 0%, #0d9488 100%); color: white; padding: 24px; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
        .header p { margin: 8px 0 0; opacity: 0.9; font-size: 14px; }
        .content { padding: 24px; }
        .stat { font-size: 32px; font-weight: bold; color: #059669; margin: 16px 0; }
        h2 { font-size: 18px; font-weight: 600; color: #374151; margin: 24px 0 12px; }
        ul { list-style: none; padding: 0; }
        li { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
        li:last-child { border-bottom: none; }
        .success { color: #059669; }
        .warning { color: #d97706; }
        .footer { text-align: center; padding: 16px; color: #9ca3af; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <div class="header">
            <h1>Your Day: ${data.date}</h1>
            <p>${activator.full_name || activator.email}</p>
          </div>
          <div class="content">
            <h2>✅ Completed: ${data.completed.length} meetings</h2>
            ${data.completed.length > 0 ? `
              <ul>
                ${data.completed.map(m => `
                  <li>
                    ${m.trial_pipeline?.search_results?.name || 'Unknown'} 
                    ${m.install_verified ? '→ INSTALLED' : '→ Completed'}
                    ${m.first_lead_received_at ? '🎉' : ''}
                  </li>
                `).join('')}
              </ul>
            ` : '<p>None</p>'}

            ${data.noShows.length > 0 ? `
              <h2>❌ No-Shows: ${data.noShows.length}</h2>
              <ul>
                ${data.noShows.map(m => `
                  <li>${m.trial_pipeline?.search_results?.name || 'Unknown'}</li>
                `).join('')}
              </ul>
            ` : ''}

            ${data.firstLeads.length > 0 ? `
              <h2>🎉 First Leads Received: ${data.firstLeads.length}</h2>
              <ul>
                ${data.firstLeads.map((lead: any) => `
                  <li>${lead.search_results?.name || 'Unknown'}</li>
                `).join('')}
              </ul>
            ` : ''}

            ${data.tomorrowMeetings.length > 0 ? `
              <h2>📅 Tomorrow: ${data.tomorrowMeetings.length} meetings scheduled</h2>
              <ul>
                ${data.tomorrowMeetings.map(m => `
                  <li>
                    ${formatTime(m.scheduled_start_at)} - ${m.trial_pipeline?.search_results?.name || 'Unknown'}
                  </li>
                `).join('')}
              </ul>
            ` : ''}
          </div>
        </div>
        <div class="footer">
          <p>View full dashboard: ${process.env.NEXT_PUBLIC_APP_URL || 'https://your-crm.vercel.app'}/dashboard/activations</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
Your Day: ${data.date}

✅ Completed: ${data.completed.length} meetings
${data.completed.map(m => `  - ${m.trial_pipeline?.search_results?.name || 'Unknown'} ${m.install_verified ? '→ INSTALLED' : ''}`).join('\n')}

${data.noShows.length > 0 ? `❌ No-Shows: ${data.noShows.length}\n${data.noShows.map(m => `  - ${m.trial_pipeline?.search_results?.name || 'Unknown'}`).join('\n')}\n` : ''}

${data.firstLeads.length > 0 ? `🎉 First Leads Received: ${data.firstLeads.length}\n${data.firstLeads.map((lead: any) => `  - ${lead.search_results?.name || 'Unknown'}`).join('\n')}\n` : ''}

${data.tomorrowMeetings.length > 0 ? `📅 Tomorrow: ${data.tomorrowMeetings.length} meetings scheduled\n${data.tomorrowMeetings.map(m => `  ${formatTime(m.scheduled_start_at)} - ${m.trial_pipeline?.search_results?.name || 'Unknown'}`).join('\n')}\n` : ''}

View full dashboard: ${process.env.NEXT_PUBLIC_APP_URL || 'https://your-crm.vercel.app'}/dashboard/activations
  `;

  const sendSmtpEmail = new brevo.SendSmtpEmail();
  sendSmtpEmail.subject = `Your Day: ${data.date}`;
  sendSmtpEmail.htmlContent = htmlContent;
  sendSmtpEmail.textContent = textContent;
  sendSmtpEmail.sender = { name: FROM_NAME, email: FROM_EMAIL };
  sendSmtpEmail.to = [{ email: activator.email }];
  sendSmtpEmail.tags = ["activator-daily-summary"];

  await brevoClient.sendTransacEmail(sendSmtpEmail);
}

