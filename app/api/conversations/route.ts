import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

// Normalize phone to last 10 digits for matching
function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "").slice(-10);
}

export type ConversationType = "all" | "sms" | "email";

/**
 * GET /api/conversations
 * Get all conversation threads for the current user's organization
 * 
 * Query params:
 * - type: "all" | "sms" | "email" (default: "all")
 * 
 * APPROACH: For each lead, find ALL messages (by lead_id OR phone/email match)
 * This mirrors exactly how fetchMessages works, which we know is correct.
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

    // Get user's organization
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

    const serviceSupabase = createServiceRoleClient();

    // Get conversation type from query params
    const { searchParams } = new URL(request.url);
    const conversationType = (searchParams.get("type") as ConversationType) || "all";

    // Step 1: Get ALL leads in the organization that have a phone number OR email
    const { data: allLeads, error: leadsError } = await serviceSupabase
      .from("search_results")
      .select("id, name, phone, email, address, lead_source, assigned_to")
      .eq("organization_id", profile.organization_id)
      .or("phone.not.is.null,email.not.is.null");

    if (leadsError) {
      console.error("[Conversations API] Error fetching leads:", leadsError);
      return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 });
    }

    if (!allLeads || allLeads.length === 0) {
      return NextResponse.json({
        success: true,
        conversations: [],
        total: 0,
      }, {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
      });
    }

    // Step 2: Get ALL SMS messages for this organization (if needed)
    let allSmsMessages: any[] = [];
    if (conversationType === "all" || conversationType === "sms") {
      const { data: smsMessages, error: smsError } = await serviceSupabase
        .from("sms_messages")
        .select("id, lead_id, direction, message, sent_at, organization_id, is_read, phone_number")
        .eq("organization_id", profile.organization_id)
        .order("sent_at", { ascending: false });

      if (smsError) {
        console.error("[Conversations API] Error fetching SMS messages:", smsError);
      } else {
        allSmsMessages = (smsMessages || []).map(m => ({ ...m, type: "sms" }));
      }
    }

    // Step 2b: Get ALL email messages for this organization (if needed)
    let allEmailMessages: any[] = [];
    if (conversationType === "all" || conversationType === "email") {
      const { data: emailMessages, error: emailError } = await serviceSupabase
        .from("email_messages")
        .select("id, lead_id, direction, subject, html_content, sent_at, created_at, organization_id, is_read, from_email, to_email")
        .eq("organization_id", profile.organization_id)
        .order("sent_at", { ascending: false, nullsFirst: false });

      if (emailError) {
        console.error("[Conversations API] Error fetching email messages:", emailError);
      } else {
        allEmailMessages = (emailMessages || []).map(m => ({ 
          ...m, 
          type: "email",
          message: m.subject || "(No subject)", // Use subject as preview
          sent_at: m.sent_at || m.created_at,
        }));
      }
    }

    // Combine all messages
    const allMessages = [...allSmsMessages, ...allEmailMessages].sort(
      (a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
    );

    if (allMessages.length === 0) {
      return NextResponse.json({
        success: true,
        conversations: [],
        total: 0,
      }, {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
      });
    }

    // Step 3: Get owner names
    const assignedUserIds = [...new Set(allLeads.map(l => l.assigned_to).filter(Boolean))];
    const ownerMap = new Map<string, string>();
    
    if (assignedUserIds.length > 0) {
      const { data: owners } = await serviceSupabase
        .from("user_profiles")
        .select("id, full_name")
        .in("id", assignedUserIds);
      
      if (owners) {
        owners.forEach((owner) => {
          if (owner.full_name) {
            ownerMap.set(owner.id, owner.full_name);
          }
        });
      }
    }

    // Step 4: For EACH lead, find all messages that match by lead_id OR phone OR email
    // This is the same logic as fetchMessages which we know works
    const conversations = [];
    const processedLeads = new Set<string>(); // Avoid duplicate conversations

    for (const lead of allLeads) {
      // Skip if we already processed this lead
      if (processedLeads.has(lead.id)) {
        continue;
      }
      processedLeads.add(lead.id);

      const normalizedLeadPhone = normalizePhone(lead.phone);
      const leadEmail = lead.email?.toLowerCase();

      // Find ALL messages for this lead (by lead_id OR by phone number match OR by email match)
      const leadMessages = allMessages.filter((msg) => {
        // Match by lead_id
        if (msg.lead_id === lead.id) return true;
        
        // Match SMS by phone number
        if (msg.type === "sms" && normalizedLeadPhone) {
          const normalizedMsgPhone = normalizePhone(msg.phone_number);
          if (normalizedMsgPhone && normalizedMsgPhone === normalizedLeadPhone) return true;
        }
        
        // Match email by email address
        if (msg.type === "email" && leadEmail) {
          const msgFromEmail = msg.from_email?.toLowerCase();
          const msgToEmail = msg.to_email?.toLowerCase();
          if (msgFromEmail === leadEmail || msgToEmail === leadEmail) return true;
        }
        
        return false;
      });

      // Skip leads with no messages
      if (leadMessages.length === 0) continue;

      // Messages are sorted descending, so first is newest
      const latestMessage = leadMessages[0];
      const unreadCount = leadMessages.filter(m => m.direction === "inbound" && !m.is_read).length;
      
      // Count by type
      const smsCount = leadMessages.filter(m => m.type === "sms").length;
      const emailCount = leadMessages.filter(m => m.type === "email").length;

      conversations.push({
        lead_id: lead.id,
        lead_name: lead.name || "Unknown",
        lead_phone: lead.phone,
        lead_email: lead.email,
        lead_address: lead.address || null,
        lead_source: lead.lead_source || "manual",
        assigned_to: lead.assigned_to || null,
        assigned_to_name: lead.assigned_to ? ownerMap.get(lead.assigned_to) || null : null,
        message_count: leadMessages.length,
        sms_count: smsCount,
        email_count: emailCount,
        unread_count: unreadCount,
        last_message_at: latestMessage.sent_at,
        last_message: latestMessage.message,
        last_message_direction: latestMessage.direction,
        last_message_type: latestMessage.type,
      });
    }

    // Step 5: Sort by last_message_at descending
    conversations.sort(
      (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    );

    console.log("[Conversations API] Returning", conversations.length, "conversations");
    if (conversations.length > 0) {
      const testConv = conversations.find(c => c.lead_name === "test" || c.lead_phone?.includes("2627770909"));
      if (testConv) {
        console.log("[Conversations API] TEST LEAD:", {
          name: testConv.lead_name,
          phone: testConv.lead_phone,
          last_msg: testConv.last_message?.substring(0, 30),
          direction: testConv.last_message_direction,
          at: testConv.last_message_at,
          msg_count: testConv.message_count,
        });
      }
    }

    return NextResponse.json({
      success: true,
      conversations,
      total: conversations.length,
    }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    });
  } catch (error) {
    console.error("Error in conversations API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
