import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/leads/create
 * Manually create a new lead (not from Google Maps)
 */
export async function POST(request: NextRequest) {
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
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    const { name, phone, email, address, website, notes } = await request.json();

    // Validate required fields
    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    if (!phone || phone.trim().length === 0) {
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 }
      );
    }

    // Check if lead with same phone already exists in organization
    const { data: existingLead } = await supabase
      .from("search_results")
      .select("id, name")
      .eq("organization_id", profile.organization_id)
      .eq("phone", phone.trim())
      .single();

    if (existingLead) {
      return NextResponse.json(
        { 
          error: `Lead with phone ${phone} already exists: ${existingLead.name}`,
          existingLeadId: existingLead.id 
        },
        { status: 409 }
      );
    }

    // Create the lead with a unique manual place_id
    const manualPlaceId = `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const { data: newLead, error: insertError } = await supabase
      .from("search_results")
      .insert({
        place_id: manualPlaceId, // Generate unique ID for manual leads
        name: name.trim(),
        phone: phone.trim(),
        email: email?.trim() || null,
        address: address?.trim() || null,
        website: website?.trim() || null,
        lead_status: "new",
        lead_source: "manual",
        organization_id: profile.organization_id,
        // search_history_id is now nullable for manual leads
        search_history_id: null,
        // Auto-assign to creator so they can see their own leads
        assigned_to: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating lead:", insertError);
      return NextResponse.json(
        { error: "Failed to create lead" },
        { status: 500 }
      );
    }

    // If notes provided, add them
    if (notes && notes.trim().length > 0) {
      await supabase.from("lead_notes").insert({
        lead_id: newLead.id,
        user_id: user.id,
        organization_id: profile.organization_id,
        note: notes.trim(),
      });
    }

    // Create activity record
    await supabase.from("lead_activities").insert({
      lead_id: newLead.id,
      user_id: user.id,
      organization_id: profile.organization_id,
      activity_type: "lead_created",
      description: `Manually created lead: ${name}`,
      activity_data: {
        phone,
        email,
        address,
        source: "manual",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Lead created successfully",
      lead: newLead,
    });
  } catch (error) {
    console.error("Error in create lead API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

