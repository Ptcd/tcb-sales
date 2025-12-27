import { NextRequest, NextResponse } from "next/server";
import { Client, PlaceInputType } from "@googlemaps/google-maps-services-js";
import { createClient } from "@/lib/supabase/server";
import { BusinessResult } from "@/lib/types";
import {
  validateGoogleMapsApiKey,
  validateSearchParams,
  sanitizeSearchInput,
} from "@/lib/validators/api";
import { findExistingLeads } from "@/lib/utils/leadDeduplication";

const client = new Client({});

export async function POST(request: NextRequest) {
  try {
    // Check authentication
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

    // Get user's assigned campaign and its lead filters
    const { data: campaignMembership } = await supabase
      .from("campaign_members")
      .select("campaign_id, campaigns(id, name, lead_filters)")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    const campaignId = campaignMembership?.campaign_id || null;
    const campaignFilters = (campaignMembership?.campaigns as any)?.lead_filters || {};
    const campaignName = (campaignMembership?.campaigns as any)?.name || null;
    
    // Extract filter settings
    const filters = {
      requireWebsite: campaignFilters.require_website || false,
      requirePhone: campaignFilters.require_phone || false,
      requireEmail: campaignFilters.require_email || false,
      minRating: campaignFilters.min_rating ?? null,
      minReviews: campaignFilters.min_reviews ?? null,
    };

    const { keyword, location, resultCount } = await request.json();

    // Validate search parameters
    const searchValidation = validateSearchParams(
      keyword,
      location,
      resultCount
    );
    if (!searchValidation.isValid) {
      return NextResponse.json(
        { error: searchValidation.error },
        { status: 400 }
      );
    }

    // Sanitize inputs
    const sanitizedKeyword = sanitizeSearchInput(keyword);
    const sanitizedLocation = sanitizeSearchInput(location);

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("Google Maps API key not configured");
      return NextResponse.json(
        { error: "Google Maps API key not configured" },
        { status: 500 }
      );
    }

    // Validate API key using flexible validation
    const keyValidation = validateGoogleMapsApiKey(apiKey);
    if (!keyValidation.isValid) {
      console.error("API key validation failed:", keyValidation.error);
      return NextResponse.json({ error: keyValidation.error }, { status: 500 });
    }

    // Step 1: Text search to find places
    const searchQuery = `${sanitizedKeyword} in ${sanitizedLocation}`;
    const results: BusinessResult[] = [];
    let nextPageToken: string | undefined = undefined;
    
    // Track filtering stats
    let totalFromGoogle = 0;
    let skippedEarlyFilter = 0; // Skipped before Place Details (saves API calls)
    let skippedLateFilter = 0;  // Skipped after Place Details (website/phone/email)
    let detailsApiCallsMade = 0;

    // Google Places API returns max 20 results per request, we need to paginate
    const requestsNeeded = Math.ceil(resultCount / 20);

    for (let i = 0; i < requestsNeeded && results.length < resultCount; i++) {
      const searchParams: any = {
        query: searchQuery,
        key: apiKey,
      };

      if (nextPageToken) {
        searchParams.pagetoken = nextPageToken;
        // Need to wait 2 seconds between paginated requests (Google requirement)
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      const response = await client.textSearch({
        params: searchParams,
        timeout: 10000,
      });

      if (
        response.data.status !== "OK" &&
        response.data.status !== "ZERO_RESULTS"
      ) {
        const googleError = response.data.error_message || "Unknown error";
        console.error("Google API error details:", {
          status: response.data.status,
          message: googleError,
          query: searchQuery
        });

        // Handle specific API errors
        if (response.data.status === "REQUEST_DENIED") {
          throw new Error(
            `Google Maps API access denied: ${googleError}. Please verify that the Places API is enabled and billing is active in your Google Cloud Console.`
          );
        } else if (response.data.status === "OVER_QUERY_LIMIT") {
          throw new Error(
            "Google Maps API quota exceeded. Please try again later."
          );
        } else if (response.data.status === "INVALID_REQUEST") {
          throw new Error(
            "Invalid search request. Please check your search parameters."
          );
        }

        throw new Error(
          `Google API error: ${response.data.status} - ${
            response.data.error_message || "Unknown error"
          }`
        );
      }

      if (!response.data.results || response.data.results.length === 0) {
        break;
      }

      // Process each result
      for (const place of response.data.results) {
        if (results.length >= resultCount) break;
        totalFromGoogle++;

        // EARLY FILTER: Check rating/reviews from text search (saves Place Details API calls)
        const placeRating = place.rating || 0;
        const placeReviews = place.user_ratings_total || 0;

        // Skip if fails rating filter
        if (filters.minRating !== null && placeRating < filters.minRating) {
          skippedEarlyFilter++;
          continue;
        }

        // Skip if fails reviews filter
        if (filters.minReviews !== null && placeReviews < filters.minReviews) {
          skippedEarlyFilter++;
          continue;
        }

        // Get detailed information for each place (only if passed early filters)
        try {
          detailsApiCallsMade++;
          const detailsResponse = await client.placeDetails({
            params: {
              place_id: place.place_id!,
              key: apiKey,
              fields: [
                "name",
                "formatted_address",
                "formatted_phone_number",
                "website",
                "rating",
                "user_ratings_total",
                "geometry",
              ],
            },
            timeout: 5000,
          });

          if (detailsResponse.data.status === "REQUEST_DENIED") {
            const msg = detailsResponse.data.error_message || "Places Details API denied";
            console.error("Place Details REQUEST_DENIED:", msg);
            throw new Error(`Google API Access Denied: ${msg}`);
          }

          if (
            detailsResponse.data.status === "OK" &&
            detailsResponse.data.result
          ) {
            const details = detailsResponse.data.result;

            // LATE FILTER: Check website/phone/email requirements (need details for this)
            const hasWebsite = details.website && details.website.trim() !== "";
            const hasPhone = details.formatted_phone_number && details.formatted_phone_number.trim() !== "";

            // Skip if requires website but doesn't have one
            if (filters.requireWebsite && !hasWebsite) {
              skippedLateFilter++;
              continue;
            }

            // Skip if requires phone but doesn't have one
            if (filters.requirePhone && !hasPhone) {
              skippedLateFilter++;
              continue;
            }

            // Note: Email is rarely available from Google, so require_email filter
            // mostly blocks leads. Consider warning user about this.
            // For now, we skip the email filter at search time since Google doesn't provide emails.

            results.push({
              id: place.place_id!,
              placeId: place.place_id!,
              name: details.name || "N/A",
              address: details.formatted_address || "N/A",
              phone: details.formatted_phone_number,
              website: details.website,
              rating: details.rating,
              reviewCount: details.user_ratings_total,
              latitude: details.geometry?.location?.lat,
              longitude: details.geometry?.location?.lng,
            });
          }
        } catch (detailError) {
          console.error("Error fetching place details:", detailError);
          // Only add basic info if it passes the filters we can check
          // For basic info, we can only check rating/reviews which we already did
          if (!filters.requireWebsite && !filters.requirePhone) {
            results.push({
              id: place.place_id!,
              placeId: place.place_id!,
              name: place.name || "N/A",
              address: place.formatted_address || "N/A",
              rating: place.rating,
              latitude: place.geometry?.location?.lat,
              longitude: place.geometry?.location?.lng,
            });
          } else {
            // Skip since we can't verify website/phone requirements
            skippedLateFilter++;
          }
        }
      }

      nextPageToken = response.data.next_page_token;
      if (!nextPageToken) break;
    }

    // Log filtering stats
    const hasActiveFilters = filters.requireWebsite || filters.requirePhone || 
                             filters.minRating !== null || filters.minReviews !== null;
    if (hasActiveFilters) {
      console.log(`[Search] Campaign "${campaignName}" filters applied:`, {
        totalFromGoogle,
        skippedEarlyFilter,
        skippedLateFilter,
        detailsApiCallsMade,
        imported: results.length,
        apiCallsSaved: skippedEarlyFilter, // These didn't need Place Details calls
      });
    }

    // Check for existing leads in the organization (deduplication)
    const existingLeadsMap = await findExistingLeads(
      supabase,
      profile.organization_id,
      results
    );

    // If user is in a campaign, check which leads are already claimed in that campaign
    let campaignClaimsMap = new Map<string, string>(); // leadId -> claimedByUserId
    if (campaignId) {
      const existingLeadIds = Array.from(existingLeadsMap.values()).map(e => e.leadId);
      if (existingLeadIds.length > 0) {
        const { data: campaignClaims } = await supabase
          .from("campaign_leads")
          .select("lead_id, claimed_by")
          .eq("campaign_id", campaignId)
          .in("lead_id", existingLeadIds)
          .eq("status", "claimed");
        
        if (campaignClaims) {
          for (const claim of campaignClaims) {
            if (claim.claimed_by) {
              campaignClaimsMap.set(claim.lead_id, claim.claimed_by);
            }
          }
        }
      }
    }

    // Enrich results with ownership information
    const enrichedResults: BusinessResult[] = results.map((result) => {
      const existingLead = existingLeadsMap.get(result.placeId);
      
      if (existingLead) {
        // Check if claimed by someone else in the campaign
        const claimedBy = campaignClaimsMap.get(existingLead.leadId);
        const isClaimedByOther = !!(claimedBy && claimedBy !== user.id);
        
        return {
          ...result,
          isExistingLead: true,
          existingLeadId: existingLead.leadId,
          existingOwnerId: existingLead.assignedTo || undefined,
          existingOwnerName: existingLead.assignedToName || undefined,
          leadStatus: existingLead.leadStatus as any,
          leadSource: 'google_maps',
          // Mark if claimed by another campaign member
          isClaimedInCampaign: !!claimedBy,
          isClaimedByOther: isClaimedByOther,
        };
      }
      
      return {
        ...result,
        isExistingLead: false,
        leadSource: 'google_maps',
      };
    });

    // Save search to history and results
    let newLeadsInserted = 0;
    let existingLeadsClaimed = 0;
    let leadsAlreadyOwned = 0;
    
    try {
      // Save search history first
      const { data: historyData, error: historyError } = await supabase
        .from("search_history")
        .insert({
          user_id: user.id,
          organization_id: profile.organization_id,
          keyword: sanitizedKeyword,
          location: sanitizedLocation,
          result_count: resultCount,
          results_found: enrichedResults.length,
        })
        .select()
        .single();

      if (historyError) {
        console.error("Failed to save search history:", historyError);
      } else if (historyData && enrichedResults.length > 0) {
        // Separate leads into categories
        const newLeads = enrichedResults.filter((r) => !r.isExistingLead);
        const existingUnassigned = enrichedResults.filter(
          (r) => r.isExistingLead && !r.existingOwnerId && !r.isClaimedByOther
        );
        const existingAssignedToMe = enrichedResults.filter(
          (r) => r.isExistingLead && r.existingOwnerId === user.id
        );
        const existingAssignedToOthers = enrichedResults.filter(
          (r) => r.isExistingLead && r.existingOwnerId && r.existingOwnerId !== user.id
        );

        // 1. Insert NEW leads and assign to current user
        if (newLeads.length > 0) {
          const newResultsToInsert = newLeads.map((result) => ({
            search_history_id: historyData.id,
            place_id: result.placeId,
            name: result.name,
            address: result.address,
            phone: result.phone || null,
            email: result.email || null,
            website: result.website || null,
            rating: result.rating || null,
            review_count: result.reviewCount || null,
            latitude: result.latitude || null,
            longitude: result.longitude || null,
            organization_id: profile.organization_id,
            lead_source: result.leadSource || 'google_maps',
            created_by: user.id,
            lead_status: 'new',
            assigned_to: user.id,
          }));

          const { data: insertedLeads, error: resultsError } = await supabase
            .from("search_results")
            .insert(newResultsToInsert)
            .select("id");

          if (resultsError) {
            if (resultsError.code === '23505') {
              console.warn("Some leads already exist. Skipping duplicates.");
            } else {
              console.error("Failed to save search results:", resultsError);
            }
          } else {
            newLeadsInserted = insertedLeads?.length || 0;
            
            // Create campaign_leads records for new leads if user is in a campaign
            if (campaignId && insertedLeads && insertedLeads.length > 0) {
              const campaignLeadsToInsert = insertedLeads.map((lead) => ({
                campaign_id: campaignId,
                lead_id: lead.id,
                organization_id: profile.organization_id,
                claimed_by: user.id,
                claimed_at: new Date().toISOString(),
                status: "claimed",
              }));

              await supabase
                .from("campaign_leads")
                .upsert(campaignLeadsToInsert, { onConflict: "campaign_id,lead_id" });
            }
          }
        }

        // 2. Claim EXISTING UNASSIGNED leads for current user
        if (existingUnassigned.length > 0) {
          const unassignedLeadIds = existingUnassigned
            .map((r) => r.existingLeadId)
            .filter(Boolean) as string[];

          if (unassignedLeadIds.length > 0) {
            // Update search_results to assign to current user
            const { error: assignError } = await supabase
              .from("search_results")
              .update({ 
                assigned_to: user.id,
                updated_at: new Date().toISOString(),
              })
              .in("id", unassignedLeadIds)
              .is("assigned_to", null); // Only update if still unassigned

            if (!assignError) {
              existingLeadsClaimed = unassignedLeadIds.length;
              
              // Create campaign_leads records if user is in a campaign
              if (campaignId) {
                const campaignLeadsToInsert = unassignedLeadIds.map((leadId) => ({
                  campaign_id: campaignId,
                  lead_id: leadId,
                  organization_id: profile.organization_id,
                  claimed_by: user.id,
                  claimed_at: new Date().toISOString(),
                  status: "claimed",
                }));

                await supabase
                  .from("campaign_leads")
                  .upsert(campaignLeadsToInsert, { onConflict: "campaign_id,lead_id" });
              }
            }
          }
        }

        // 3. For leads already assigned to me, just ensure campaign_leads exist
        if (campaignId && existingAssignedToMe.length > 0) {
          leadsAlreadyOwned = existingAssignedToMe.length;
          const myLeadIds = existingAssignedToMe
            .map((r) => r.existingLeadId)
            .filter(Boolean) as string[];

          if (myLeadIds.length > 0) {
            const campaignLeadsToInsert = myLeadIds.map((leadId) => ({
              campaign_id: campaignId,
              lead_id: leadId,
              organization_id: profile.organization_id,
              claimed_by: user.id,
              claimed_at: new Date().toISOString(),
              status: "claimed",
            }));

            await supabase
              .from("campaign_leads")
              .upsert(campaignLeadsToInsert, { onConflict: "campaign_id,lead_id" });
          }
        }

        // Log summary
        console.log(`[Search] Results for user ${user.id}:`, {
          newLeadsInserted,
          existingLeadsClaimed,
          leadsAlreadyOwned,
          leadsOwnedByOthers: existingAssignedToOthers.length,
          campaignId,
        });
      }
    } catch (saveError) {
      console.error("Failed to save search data:", saveError);
      // Don't fail the request if save fails
    }

    // Get the search history ID if it was saved
    let savedSearchHistoryId = null;
    try {
      const { data: latestHistory } = await supabase
        .from("search_history")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (latestHistory) {
        savedSearchHistoryId = latestHistory.id;
      }
    } catch (e) {
      // Ignore if we can't get the history ID
    }

    return NextResponse.json({
      success: true,
      results: enrichedResults,
      count: enrichedResults.length,
      searchHistoryId: savedSearchHistoryId,
      // Lead stats
      newLeadsCount: newLeadsInserted,
      existingLeadsClaimedCount: existingLeadsClaimed,
      existingLeadsOwnedCount: leadsAlreadyOwned,
      existingLeadsOtherCount: enrichedResults.filter(r => r.isExistingLead && r.existingOwnerId && r.existingOwnerId !== user.id).length,
      // Filter stats
      filterStats: hasActiveFilters ? {
        campaignName,
        totalFromGoogle,
        skippedByFilters: skippedEarlyFilter + skippedLateFilter,
        apiCallsSaved: skippedEarlyFilter,
        filters: {
          requireWebsite: filters.requireWebsite,
          requirePhone: filters.requirePhone,
          minRating: filters.minRating,
          minReviews: filters.minReviews,
        },
      } : null,
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to search",
      },
      { status: 500 }
    );
  }
}
