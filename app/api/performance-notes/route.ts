import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWeekStart } from "@/lib/utils/performanceMetrics";

// GET - Fetch notes for a user/week
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get("userId");
  const weekStart = searchParams.get("weekStart");
  const weeksBack = parseInt(searchParams.get("weeksBack") || "0");

  if (!userId || !weekStart) {
    return NextResponse.json(
      { error: "userId and weekStart are required" },
      { status: 400 }
    );
  }

  // Get user profile to check permissions
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Verify target user is in same org
  const { data: targetProfile } = await supabase
    .from("user_profiles")
    .select("organization_id")
    .eq("id", userId)
    .single();

  if (!targetProfile || targetProfile.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const weekStartDate = new Date(weekStart);
    const weekStartIso = weekStartDate.toISOString().split("T")[0];

    // Calculate date range (current week + weeksBack)
    const endDate = new Date(weekStartDate);
    endDate.setDate(endDate.getDate() + (weeksBack * 7));
    const endDateIso = endDate.toISOString().split("T")[0];

    // Get notes within date range
    const { data: notes, error } = await supabase
      .from("performance_notes")
      .select("id, note, week_start, created_at, author_id")
      .eq("user_id", userId)
      .gte("week_start", weekStartIso)
      .lte("week_start", endDateIso)
      .order("week_start", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    // Filter notes older than 30 days (default view)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const filteredNotes = notes?.filter(note => {
      const noteDate = new Date(note.created_at);
      return noteDate >= thirtyDaysAgo;
    }) || [];

    return NextResponse.json({
      success: true,
      notes: filteredNotes,
    });
  } catch (error: any) {
    console.error("Error fetching performance notes:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch notes" },
      { status: 500 }
    );
  }
}

// POST - Create a new note
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user profile to check role (admin only)
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const { userId, note, weekStart } = body;

  if (!userId || !note || !weekStart) {
    return NextResponse.json(
      { error: "userId, note, and weekStart are required" },
      { status: 400 }
    );
  }

  // Validate note length (max 200 chars)
  if (note.length > 200) {
    return NextResponse.json(
      { error: "Note must be 200 characters or less" },
      { status: 400 }
    );
  }

  // Verify target user is in same org
  const { data: targetProfile } = await supabase
    .from("user_profiles")
    .select("organization_id")
    .eq("id", userId)
    .single();

  if (!targetProfile || targetProfile.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const weekStartDate = new Date(weekStart);
    const weekStartIso = weekStartDate.toISOString().split("T")[0];

    const { data: newNote, error } = await supabase
      .from("performance_notes")
      .insert({
        user_id: userId,
        author_id: user.id,
        note: note.trim(),
        week_start: weekStartIso,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      note: newNote,
    });
  } catch (error: any) {
    console.error("Error creating performance note:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create note" },
      { status: 500 }
    );
  }
}


