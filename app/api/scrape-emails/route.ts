import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scrapeEmailFromWebsite } from "@/lib/utils/emailScraper";

/**
 * POST /api/scrape-emails
 * Scrapes emails for search results that have websites but no emails
 */
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

    // Check if email scraping is enabled for this organization
    const { data: orgSettings } = await supabase
      .from("organization_settings")
      .select("enable_email_scraping")
      .eq("organization_id", profile.organization_id)
      .single();

    if (orgSettings && orgSettings.enable_email_scraping === false) {
      return NextResponse.json(
        { error: "Email scraping is disabled for your organization" },
        { status: 403 }
      );
    }

    const { searchHistoryId } = await request.json();

    if (!searchHistoryId) {
      return NextResponse.json(
        { error: "searchHistoryId is required" },
        { status: 400 }
      );
    }

    // Verify the search history exists (RLS will filter by organization automatically)
    const { data: searchHistory, error: historyError } = await supabase
      .from("search_history")
      .select("id")
      .eq("id", searchHistoryId)
      .single();

    if (historyError || !searchHistory) {
      return NextResponse.json(
        { error: "Search history not found or unauthorized" },
        { status: 404 }
      );
    }

    // Get all search results that have websites but no emails
    const { data: results, error: resultsError } = await supabase
      .from("search_results")
      .select("id, place_id, name, website")
      .eq("search_history_id", searchHistoryId)
      .not("website", "is", null)
      .is("email", null);

    if (resultsError) {
      console.error("Error fetching results:", resultsError);
      return NextResponse.json(
        { error: "Failed to fetch search results" },
        { status: 500 }
      );
    }

    if (!results || results.length === 0) {
      // Debug: Check if search history has results_found > 0
      const { data: historyCheck } = await supabase
        .from("search_history")
        .select("results_found, organization_id")
        .eq("id", searchHistoryId)
        .single();
      
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();
      
      // Check if results exist but RLS is blocking them
      const { count: allResultsCount } = await supabase
        .from("search_results")
        .select("*", { count: "exact", head: true })
        .eq("search_history_id", searchHistoryId);
      
      console.error(`🔍 Email Scraper Debug for search ${searchHistoryId}:`);
      console.error(`  - History results_found: ${historyCheck?.results_found || 0}`);
      console.error(`  - History org_id: ${historyCheck?.organization_id}`);
      console.error(`  - User's org_id: ${profile?.organization_id}`);
      console.error(`  - Results fetched via RLS: ${results?.length || 0}`);
      console.error(`  - Total results in DB (before RLS): ${allResultsCount || 0}`);
      
      return NextResponse.json({
        success: true,
        message: "No results need email scraping",
        scraped: 0,
        found: 0,
      });
    }

    console.log(`Starting email scraping for ${results.length} businesses...`);

    let scrapedCount = 0;
    let foundCount = 0;

    // Process results with concurrency control (5 at a time)
    const BATCH_SIZE = 5;

    for (let i = 0; i < results.length; i += BATCH_SIZE) {
      const batch = results.slice(i, i + BATCH_SIZE);

      const batchPromises = batch.map(async (result) => {
        if (!result.website) return;

        try {
          console.log(`Scraping email for: ${result.name}`);
          const email = await scrapeEmailFromWebsite(result.website, {
            timeout: 8000,
            maxPages: 3,
          });

          if (email) {
            // Update the database with the found email
            console.log(`Updating database for ${result.name} (ID: ${result.id}) with email: ${email}`);
            const { data: updateData, error: updateError } = await supabase
              .from("search_results")
              .update({ email })
              .eq("id", result.id)
              .select();

            if (updateError) {
              console.error(
                `Error updating email for ${result.name}:`,
                updateError
              );
            } else {
              foundCount++;
              console.log(`✓ Successfully updated database for ${result.name}: ${email}`, updateData);
            }
          } else {
            console.log(`✗ No email found for ${result.name}`);
          }

          scrapedCount++;
        } catch (error) {
          console.error(
            `Error scraping ${result.name}:`,
            error instanceof Error ? error.message : "Unknown error"
          );
        }
      });

      // Wait for batch to complete
      await Promise.all(batchPromises);

      // Small delay between batches to avoid overwhelming the server
      if (i + BATCH_SIZE < results.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log(
      `Email scraping complete: ${foundCount}/${scrapedCount} emails found`
    );

    return NextResponse.json({
      success: true,
      scraped: scrapedCount,
      found: foundCount,
      total: results.length,
      message: `Found ${foundCount} email(s) from ${scrapedCount} website(s)`,
    });
  } catch (error) {
    console.error("Email scraping error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to scrape emails",
      },
      { status: 500 }
    );
  }
}

