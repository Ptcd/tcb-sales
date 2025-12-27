"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BusinessResult } from "@/lib/types";
import toast, { Toaster } from "react-hot-toast";
import DataTable from "@/components/DataTable";
import { PageLoading, LoadingSpinner } from "@/components/LoadingSpinner";
import { ErrorMessage } from "@/components/ErrorBoundary";
import { SkeletonTable } from "@/components/Skeleton";

interface SearchMetadata {
  keyword: string;
  location: string;
  resultCount: number;
  searchDate: string;
  resultsFound: number;
}

export default function HistoryResultsPage() {
  const params = useParams();
  const router = useRouter();
  const [results, setResults] = useState<BusinessResult[]>([]);
  const [metadata, setMetadata] = useState<SearchMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isScrapingEmails, setIsScrapingEmails] = useState(false);

  useEffect(() => {
    if (params.id) {
      fetchSearchResults(params.id as string);
    }
  }, [params.id]);

  const fetchSearchResults = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/history/${id}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch search results");
      }

      setResults(data.results);
      setMetadata(data.searchMetadata);
    } catch (error) {
      console.error("Error fetching search results:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to load search results";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleScrapeEmails = async () => {
    const searchHistoryId = params.id as string;
    
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

      // Refresh the results to show newly scraped emails
      await fetchSearchResults(searchHistoryId);

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

  if (loading) {
    return (
      <div className="space-y-6">
        <PageLoading message="Loading search results..." />
        <SkeletonTable rows={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.push("/dashboard/history")}
          className="text-slate-600 hover:text-slate-800 font-medium"
        >
          ← Back to History
        </button>
        <ErrorMessage
          error={error}
          onRetry={() => params.id && fetchSearchResults(params.id as string)}
          retryText="Retry"
        />
      </div>
    );
  }

  if (!metadata) {
    return (
      <div className="text-center py-12">
        <div className="mx-auto h-12 w-12 text-gray-400 mb-4">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.29-1.009-5.824-2.709M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Search results not found
        </h3>
        <p className="text-gray-600 mb-4">
          The search results you're looking for could not be found.
        </p>
        <button
          onClick={() => router.push("/dashboard/history")}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-xl text-white bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500"
        >
          Back to History
        </button>
      </div>
    );
  }

  return (
    <>
      <Toaster position="top-right" />
      {/* Header */}
      <div className="mb-4">
        <button
          onClick={() => router.push("/dashboard/history")}
          className="mb-4 text-blue-600 hover:text-blue-800 font-medium"
        >
          ← Back to History
        </button>

        <div className="bg-white rounded-lg shadow p-4">
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Search Results
          </h1>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="font-semibold text-gray-700">Keyword:</span>
              <p className="text-gray-900">{metadata.keyword}</p>
            </div>
            <div>
              <span className="font-semibold text-gray-700">Location:</span>
              <p className="text-gray-900">{metadata.location}</p>
            </div>
            <div>
              <span className="font-semibold text-gray-700">
                Results Found:
              </span>
              <p className="text-gray-900">
                {results.length} / {metadata.resultCount}
              </p>
            </div>
            <div>
              <span className="font-semibold text-gray-700">Search Date:</span>
              <p className="text-gray-900">{formatDate(metadata.searchDate)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Email Scraper Button */}
      {results.length > 0 && (
        <div className="mb-4">
          <button
            onClick={handleScrapeEmails}
            disabled={isScrapingEmails}
            className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-medium rounded-xl hover:from-emerald-600 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-emerald-500/30"
          >
            {isScrapingEmails ? (
              <>
                <LoadingSpinner size="sm" />
                <span className="ml-2">Scraping Emails...</span>
              </>
            ) : (
              <>
                <svg
                  className="w-5 h-5 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
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
          <p className="text-xs text-gray-500 mt-2">
            Click to scrape email addresses from business websites
          </p>
        </div>
      )}

      {/* Results */}
      {results.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <p className="text-gray-500 text-lg">
            No results found for this search.
          </p>
        </div>
      ) : (
        <DataTable data={results} />
      )}
    </>
  );
}
