import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BusinessResult } from "@/lib/types";

/**
 * GET /api/history/[id]
 * Fetches search history metadata and results for a specific search history ID
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

    // Get search history metadata (RLS will filter by organization)
    const { data: searchHistory, error: historyError } = await supabase
      .from("search_history")
      .select("*")
      .eq("id", searchId)
      .single();

    if (historyError || !searchHistory) {
      console.error("Error fetching search history:", historyError);
      return NextResponse.json(
        { error: "Search history not found or unauthorized" },
        { status: 404 }
      );
    }

    // Get the total count of results first
    const { count: totalCount } = await supabase
      .from("search_results")
      .select("*", { count: "exact", head: true })
      .eq("search_history_id", searchId);

    // Get ALL search results (RLS will filter by organization)
    // DataTable handles client-side pagination, so we load all results
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

    // Debug: Log if we expect results but got none
    if (searchHistory.results_found > 0 && (!results || results.length === 0)) {
      // Get user's organization for debugging
      const { data: userProfile } = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();
      
      // Check what organization_ids exist in search_results for this search
      const { data: allResults, error: checkError } = await supabase
        .from("search_results")
        .select("id, organization_id")
        .eq("search_history_id", searchId)
        .limit(5);
      
      console.error(`🔍 Search ${searchId} Debug:`);
      console.error(`  - Expected: ${searchHistory.results_found} results`);
      console.error(`  - Fetched: ${results?.length || 0} results`);
      console.error(`  - Search history org_id: ${searchHistory.organization_id}`);
      console.error(`  - User's org_id: ${userProfile?.organization_id}`);
      console.error(`  - Sample search_results org_ids:`, allResults?.map(r => ({ id: r.id, org_id: r.organization_id })));
      
      if (checkError) {
        console.error(`  - Error checking all results:`, checkError);
      }
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
      // Include deduplication metadata
      isExistingLead: item.is_existing_lead || false,
      existingLeadId: item.existing_lead_id || undefined,
      existingOwnerId: item.existing_owner_id || undefined,
      existingOwnerName: item.existing_owner_name || undefined,
      leadSource: item.lead_source || 'google_maps',
    }));

    // Build search metadata
    // Use actual stored results count, not the historical results_found (which may be outdated)
    const actualResultsCount = businessResults.length;
    const searchMetadata = {
      keyword: searchHistory.keyword,
      location: searchHistory.location,
      resultCount: searchHistory.result_count,
      resultsFound: actualResultsCount, // Use actual count from stored results
      searchDate: searchHistory.created_at,
    };

    return NextResponse.json({
      success: true,
      results: businessResults,
      searchMetadata,
      count: businessResults.length,
      totalCount: totalCount || businessResults.length,
    });
  } catch (error) {
    console.error("Error in history detail API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/history/[id]
 * Deletes a search history entry and its associated results
 */
export async function DELETE(
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
      console.error("Error fetching search history for deletion:", historyError);
      return NextResponse.json(
        { error: "Search history not found or unauthorized" },
        { status: 404 }
      );
    }

    // Soft delete the search history (set deleted_at timestamp)
    const now = new Date().toISOString();
    const { error: deleteError } = await supabase
      .from("search_history")
      .update({ deleted_at: now })
      .eq("id", searchId);

    if (deleteError) {
      console.error("Error deleting search history:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete search history" },
        { status: 500 }
      );
    }

    // Also soft delete associated search results
    await supabase
      .from("search_results")
      .update({ deleted_at: now })
      .eq("search_history_id", searchId);

    return NextResponse.json({
      success: true,
      message: "Search history moved to recycle bin",
    });
  } catch (error) {
    console.error("Error in DELETE history API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
