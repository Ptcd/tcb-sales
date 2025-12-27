"use client";

import { useState } from "react";
import SearchForm from "@/components/SearchForm";
import DataTable from "@/components/DataTable";
import AddLeadModal from "@/components/AddLeadModal";
import TodaySummaryCard from "@/components/TodaySummaryCard";
import FollowUpsDueCard from "@/components/FollowUpsDueCard";
import { BusinessResult } from "@/lib/types";
import toast, { Toaster } from "react-hot-toast";
import { PageLoading, LoadingSpinner } from "@/components/LoadingSpinner";
import { ErrorMessage } from "@/components/ErrorBoundary";
import { SkeletonTable } from "@/components/Skeleton";
import { UserPlus, CheckCircle, XCircle, Users, ArrowRight } from "lucide-react";
import Link from "next/link";

interface SearchStats {
  totalFromGoogle: number;
  newLeadsCount: number;
  existingLeadsClaimedCount: number;
  existingLeadsOwnedCount: number;
  existingLeadsOtherCount: number;
}

export default function DashboardPage() {
  const [results, setResults] = useState<BusinessResult[]>([]);
  const [availableResults, setAvailableResults] = useState<BusinessResult[]>([]);
  const [searchStats, setSearchStats] = useState<SearchStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchHistoryId, setSearchHistoryId] = useState<string | null>(null);
  const [isScrapingEmails, setIsScrapingEmails] = useState(false);
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (
    keyword: string,
    location: string,
    resultCount: number,
    enableEmailScraping?: boolean
  ) => {
    setIsLoading(true);
    setError(null);
    setResults([]);
    setAvailableResults([]);
    setSearchStats(null);
    setSearchHistoryId(null);
    setHasSearched(true);

    const toastId = toast.loading("Searching Google Maps...");

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ keyword, location, resultCount }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Search failed");
      }

      // Store all results
      setResults(data.results);
      setSearchHistoryId(data.searchHistoryId || null);

      // Filter out leads claimed by others - only show available leads
      const available = (data.results as BusinessResult[]).filter(
        (r) => !r.isClaimedByOther
      );
      setAvailableResults(available);

      // Store stats
      setSearchStats({
        totalFromGoogle: data.count || data.results.length,
        newLeadsCount: data.newLeadsCount || 0,
        existingLeadsClaimedCount: data.existingLeadsClaimedCount || 0,
        existingLeadsOwnedCount: data.existingLeadsOwnedCount || 0,
        existingLeadsOtherCount: data.existingLeadsOtherCount || 0,
      });

      // Show appropriate toast
      const claimedByOthers = data.existingLeadsOtherCount || 0;
      const addedToYourCRM = (data.newLeadsCount || 0) + (data.existingLeadsClaimedCount || 0);
      
      if (available.length === 0 && claimedByOthers > 0) {
        toast.error(`All ${claimedByOthers} results are already claimed by teammates`, { id: toastId });
      } else if (claimedByOthers > 0) {
        toast.success(`Added ${addedToYourCRM} leads to your CRM! (${claimedByOthers} already claimed by others)`, { id: toastId });
      } else {
        toast.success(`Added ${addedToYourCRM} leads to your CRM!`, { id: toastId });
      }

      // Auto-trigger email scraping if enabled
      if (enableEmailScraping && data.searchHistoryId && available.length > 0) {
        setTimeout(() => {
          handleScrapeEmails();
        }, 1000);
      }
    } catch (error) {
      console.error("Search error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to search";
      setError(errorMessage);
      toast.error(errorMessage, { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  const handleScrapeEmails = async () => {
    if (!searchHistoryId) {
      toast.error("No search history found");
      return;
    }

    setIsScrapingEmails(true);
    const toastId = toast.loading("Scraping emails from websites...");

    try {
      const response = await fetch("/api/scrape-emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ searchHistoryId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Email scraping failed");
      }

      // Update results with scraped emails
      const resultsResponse = await fetch(
        `/api/history/${searchHistoryId}/results`
      );

      if (resultsResponse.ok) {
        const resultsData = await resultsResponse.json();
        const updatedResults = resultsData.results || [];
        setResults(updatedResults);
        // Re-filter available results
        setAvailableResults(updatedResults.filter((r: BusinessResult) => !r.isClaimedByOther));
      }

      toast.success(data.message || `Found ${data.found} email(s)!`, {
        id: toastId,
        duration: 5000,
      });
    } catch (error) {
      console.error("Email scraping error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to scrape emails";
      toast.error(errorMessage, { id: toastId });
    } finally {
      setIsScrapingEmails(false);
    }
  };

  // Calculate derived stats
  const leadsAddedToCRM = (searchStats?.newLeadsCount || 0) + (searchStats?.existingLeadsClaimedCount || 0);
  const leadsAlreadyYours = searchStats?.existingLeadsOwnedCount || 0;
  const leadsClaimedByOthers = searchStats?.existingLeadsOtherCount || 0;

  return (
    <>
      <Toaster position="top-right" />
      <div className="">
        {/* Follow-Ups and Rescues Cards */}
        <div className="mb-6">
          <FollowUpsDueCard />
          <TodaySummaryCard />
        </div>

        {/* Search Form and Add Lead Button */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start">
          <div className="flex-1 w-full">
            <SearchForm onSearch={handleSearch} isLoading={isLoading} />
          </div>
          <button
            onClick={() => setShowAddLeadModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 whitespace-nowrap"
          >
            <UserPlus className="h-5 w-5" />
            Add Lead Manually
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6">
            <ErrorMessage
              error={error}
              onRetry={() => setError(null)}
              retryText="Clear Error"
            />
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-4">
            <PageLoading message="Searching Google Maps..." />
            <SkeletonTable rows={3} />
          </div>
        )}

        {/* Search Results Summary */}
        {!isLoading && hasSearched && searchStats && (
          <div className="mb-6 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Search Results</h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              {/* Added to CRM */}
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-medium text-green-800">Added to CRM</span>
                </div>
                <p className="text-2xl font-bold text-green-700">{leadsAddedToCRM}</p>
              </div>

              {/* Already Yours */}
              {leadsAlreadyYours > 0 && (
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="h-5 w-5 text-blue-600" />
                    <span className="text-sm font-medium text-blue-800">Already Yours</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-700">{leadsAlreadyYours}</p>
                </div>
              )}

              {/* Claimed by Others */}
              {leadsClaimedByOthers > 0 && (
                <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="h-5 w-5 text-red-600" />
                    <span className="text-sm font-medium text-red-800">Claimed by Others</span>
                  </div>
                  <p className="text-2xl font-bold text-red-700">{leadsClaimedByOthers}</p>
                  <p className="text-xs text-red-600 mt-1">Not shown below</p>
                </div>
              )}

              {/* Total from Google */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-gray-700">Total Found</span>
                </div>
                <p className="text-2xl font-bold text-gray-700">{searchStats.totalFromGoogle}</p>
              </div>
            </div>

            {/* CTA to go to CRM */}
            {leadsAddedToCRM > 0 && (
              <Link
                href="/dashboard/leads"
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors"
              >
                Go to CRM to Start Calling
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        )}

        {/* All Results Claimed Message */}
        {!isLoading && hasSearched && availableResults.length === 0 && leadsClaimedByOthers > 0 && (
          <div className="mb-6 bg-amber-50 rounded-xl border border-amber-200 p-8 text-center">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="h-8 w-8 text-amber-600" />
            </div>
            <h3 className="text-lg font-semibold text-amber-900 mb-2">
              All Results Already Claimed
            </h3>
            <p className="text-amber-700 mb-4">
              All {leadsClaimedByOthers} businesses from this search are already being worked by your teammates.
              Try searching for a different location or business type.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => {
                  setHasSearched(false);
                  setResults([]);
                  setAvailableResults([]);
                  setSearchStats(null);
                }}
                className="px-4 py-2 bg-amber-600 text-white font-semibold rounded-lg hover:bg-amber-700 transition-colors"
              >
                Search Again
              </button>
              <Link
                href="/dashboard/leads"
                className="px-4 py-2 bg-white text-amber-700 font-semibold rounded-lg border border-amber-300 hover:bg-amber-50 transition-colors"
              >
                Go to Your CRM
              </Link>
            </div>
          </div>
        )}

        {/* Email Scraping Button */}
        {!isLoading && availableResults.length > 0 && searchHistoryId && (
          <div className="mb-4">
            <button
              onClick={handleScrapeEmails}
              disabled={isScrapingEmails}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-semibold rounded-lg hover:from-emerald-700 hover:to-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {isScrapingEmails ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span>Extracting Emails...</span>
                </>
              ) : (
                <>
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  <span>Extract Emails from Websites</span>
                </>
              )}
            </button>
            <p className="text-xs text-slate-600 mt-2">
              Click to scrape email addresses from business websites
            </p>
          </div>
        )}

        {/* Results Table - Only show available leads (not claimed by others) */}
        {!isLoading && availableResults.length > 0 && (
          <div>
            <DataTable data={availableResults} />
          </div>
        )}

        {/* Empty State - No search yet */}
        {!isLoading && !hasSearched && !error && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-full mb-6 shadow-lg">
              <svg
                className="w-10 h-10 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Ready to Search
            </h3>
            <p className="text-sm text-gray-600">
              Enter your search criteria above to discover businesses
            </p>
          </div>
        )}

        {/* Empty State - Search returned nothing */}
        {!isLoading && hasSearched && results.length === 0 && leadsClaimedByOthers === 0 && !error && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-6">
              <XCircle className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No Results Found
            </h3>
            <p className="text-sm text-gray-600">
              Try a different search term or location
            </p>
          </div>
        )}
      </div>
      
      {/* Add Lead Modal */}
      <AddLeadModal
        isOpen={showAddLeadModal}
        onClose={() => setShowAddLeadModal(false)}
        onLeadAdded={() => {
          toast.success("Lead added! Redirecting to CRM...");
          setTimeout(() => {
            window.location.href = "/dashboard/leads";
          }, 1000);
        }}
      />
    </>
  );
}
