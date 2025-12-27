import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LeadNote } from "@/lib/types";

/**
 * GET /api/leads/[id]/notes
 * Gets all notes for a lead
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: leadId } = await params;

    // Get the lead
    const { data: lead, error: leadError } = await supabase
      .from("search_results")
      .select("id, search_history_id")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    // RLS will automatically filter by organization - no need to check user_id
    // Get all notes for the lead
    const { data: notes, error: notesError } = await supabase
      .from("lead_notes")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });

    if (notesError) {
      console.error("Error fetching notes:", notesError);
      return NextResponse.json(
        { error: "Failed to fetch notes" },
        { status: 500 }
      );
    }

    // Transform to frontend format
    const formattedNotes: LeadNote[] = (notes || []).map((note) => ({
      id: note.id,
      leadId: note.lead_id,
      userId: note.user_id,
      note: note.note,
      createdAt: note.created_at,
      updatedAt: note.updated_at,
    }));

    return NextResponse.json({
      success: true,
      notes: formattedNotes,
      count: formattedNotes.length,
    });
  } catch (error) {
    console.error("Error in get notes API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/leads/[id]/notes
 * Adds a new note to a lead
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: leadId } = await params;
    const { note } = await request.json();

    if (!note || note.trim().length === 0) {
      return NextResponse.json(
        { error: "Note content is required" },
        { status: 400 }
      );
    }

    // Get the lead
    const { data: lead, error: leadError } = await supabase
      .from("search_results")
      .select("id, search_history_id")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
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

    // RLS will automatically filter by organization for the lead check
    // Insert the note with organization_id
    const { data: newNote, error: insertError } = await supabase
      .from("lead_notes")
      .insert({
        lead_id: leadId,
        user_id: user.id,
        organization_id: profile.organization_id,
        note: note.trim(),
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting note:", insertError);
      return NextResponse.json(
        { error: "Failed to add note" },
        { status: 500 }
      );
    }

    // Create an activity record with organization_id
    const { error: activityError } = await supabase
      .from("lead_activities")
      .insert({
        lead_id: leadId,
        user_id: user.id,
        organization_id: profile.organization_id,
        activity_type: "note_added",
        activity_data: { note_id: newNote.id },
        description: `Added a note: ${note.substring(0, 50)}${note.length > 50 ? '...' : ''}`,
      });

    if (activityError) {
      console.error("Error creating activity:", activityError);
    }

    // Format response
    const formattedNote: LeadNote = {
      id: newNote.id,
      leadId: newNote.lead_id,
      userId: newNote.user_id,
      note: newNote.note,
      createdAt: newNote.created_at,
      updatedAt: newNote.updated_at,
    };

    return NextResponse.json({
      success: true,
      message: "Note added successfully",
      note: formattedNote,
    });
  } catch (error) {
    console.error("Error in add note API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

