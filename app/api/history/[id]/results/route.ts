import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BusinessResult } from "@/lib/types";

/**
 * GET /api/history/[id]/results
 * Fetches the search results for a specific search history ID
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

    const { id: searchId } = await params;

    // Verify the search history exists (RLS will filter by organization)
    const { data: searchHistory, error: historyError } = await supabase
      .from("search_history")
      .select("id")
      .eq("id", searchId)
      .single();

    if (historyError || !searchHistory) {
      return NextResponse.json(
        { error: "Search history not found or unauthorized" },
        { status: 404 }
      );
    }

    // Get the search results
    const { data: results, error: resultsError } = await supabase
      .from("search_results")
      .select("*")
      .eq("search_history_id", searchId)
      .order("created_at", { ascending: true });

    if (resultsError) {
      console.error("Error fetching search results:", resultsError);
      return NextResponse.json(
        { error: "Failed to fetch search results" },
        { status: 500 }
      );
    }

    // Transform results to match BusinessResult interface
    const businessResults: BusinessResult[] = (results || []).map((item) => ({
      id: item.id || item.place_id,
      placeId: item.place_id,
      name: item.name,
      address: item.address,
      phone: item.phone || undefined,
      email: item.email || undefined,
      website: item.website || undefined,
      rating: item.rating || undefined,
      reviewCount: item.review_count || undefined,
      latitude: item.latitude || undefined,
      longitude: item.longitude || undefined,
      leadStatus: item.lead_status || 'new',
      assignedTo: item.assigned_to || undefined,
      lastContactedAt: item.last_contacted_at || undefined,
      updatedAt: item.updated_at || undefined,
    }));

    return NextResponse.json({
      success: true,
      results: businessResults,
      count: businessResults.length,
    });
  } catch (error) {
    console.error("Error in results API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

