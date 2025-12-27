"use client";

import { useEffect, useState } from "react";
import { SearchHistory } from "@/lib/types";
import toast, { Toaster } from "react-hot-toast";
import { useRouter } from "next/navigation";
import HistoryTable from "@/components/HistoryTable";
import { PageLoading } from "@/components/LoadingSpinner";
import { ErrorMessage } from "@/components/ErrorBoundary";
import { SkeletonTable } from "@/components/Skeleton";

export default function HistoryPage() {
  const [history, setHistory] = useState<SearchHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch("/api/history");
      if (!response.ok) {
        throw new Error("Failed to fetch history");
      }
      const data = await response.json();
      setHistory(data.history || []);
    } catch (error) {
      console.error("Error fetching history:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to load search history";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewResults = (id: string) => {
    router.push(`/dashboard/history/${id}`);
  };

  const handleDeleteHistory = async (id: string) => {
    if (!confirm("Are you sure you want to delete this search history?")) {
      return;
    }

    try {
      setDeletingId(id);
      const response = await fetch(`/api/history/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete history");
      }

      setHistory(history.filter((item) => item.id !== id));
      toast.success("Search history deleted successfully");
    } catch (error) {
      console.error("Error deleting history:", error);
      toast.error("Failed to delete search history");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <Toaster position="top-right" />

      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold text-slate-900">Search History</h1>
        </div>
        <p className="text-slate-600">
          View and manage your previous business searches
        </p>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6">
          <ErrorMessage
            error={error}
            onRetry={fetchHistory}
            retryText="Retry"
          />
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="space-y-4">
          <PageLoading message="Loading search history..." />
          <SkeletonTable rows={3} />
        </div>
      ) : history.length === 0 ? (
        <div className="text-center py-12">
          <div className="mx-auto h-12 w-12 text-slate-400 mb-4">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            No search history found
          </h3>
          <p className="text-slate-600 mb-6">
            Your search history will appear here once you start searching for
            businesses.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-xl text-white bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
          >
            Start Searching
          </button>
        </div>
      ) : (
        <HistoryTable
          data={history}
          isLoading={deletingId !== null}
          onViewResults={handleViewResults}
          onDeleteHistory={handleDeleteHistory}
        />
      )}
    </>
  );
}
