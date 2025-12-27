"use client";

import { useState } from "react";
import { BusinessResult } from "@/lib/types";
import { exportToCSV, exportToExcel } from "@/lib/utils/export";
import {
  FileText,
  FileSpreadsheet,
  MapPin,
  Phone,
  Globe,
  Star,
  User,
  AlertCircle,
} from "lucide-react";
import Pagination from "./Pagination";
import Tooltip from "./Tooltip";
import { SkeletonTable } from "./Skeleton";

interface ResultsTableProps {
  results: BusinessResult[];
  itemsPerPage?: number;
  isLoading?: boolean;
}

export default function ResultsTable({
  results,
  itemsPerPage = 10,
  isLoading = false,
}: ResultsTableProps) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(results.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentResults = results.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };
  if (isLoading) {
    return <SkeletonTable rows={5} />;
  }

  if (results.length === 0) {
    return null;
  }

  const handleExportCSV = () => {
    const timestamp = new Date().getTime();
    exportToCSV(results, `google-maps-results-${timestamp}`);
  };

  const handleExportExcel = () => {
    const timestamp = new Date().getTime();
    exportToExcel(results, `google-maps-results-${timestamp}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg shadow-lg">
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {results.length} Results
            </h2>
          </div>
        </div>
        <div className="flex gap-2">
          <Tooltip content="Export CSV">
            <button
              onClick={handleExportCSV}
              className="flex items-center rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-bold text-white hover:from-emerald-600 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100 shadow-lg transition-all duration-200"
            >
              <FileText className="w-4 h-4 mr-1" />
              CSV
            </button>
          </Tooltip>
          <Tooltip content="Export Excel">
            <button
              onClick={handleExportExcel}
              className="flex items-center rounded-lg bg-gradient-to-r from-slate-600 to-slate-700 px-4 py-2 text-sm font-bold text-white hover:from-slate-700 hover:to-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-100 shadow-lg transition-all duration-200"
            >
              <FileSpreadsheet className="w-4 h-4 mr-1" />
              Excel
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-700">
                Business
              </th>
              <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-700">
                Address
              </th>
              <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-700">
                Phone
              </th>
              <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-700">
                Rating
              </th>
              <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-700">
                Reviews
              </th>
              <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-700">
                Website
              </th>
              <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-700">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {currentResults.map((result, index) => {
              // Determine row styling based on existing lead status
              const isExisting = result.isExistingLead;
              // Use the new isClaimedByOther field if available, fallback to old logic
              const isClaimedByOther = result.isClaimedByOther || 
                (isExisting && result.existingOwnerId && result.existingOwnerId !== result.assignedTo);
              const isOwnedByMe = isExisting && !isClaimedByOther && result.existingOwnerId;
              
              // Row background color based on ownership
              let rowBgClass = "hover:bg-gray-50";
              if (isClaimedByOther) {
                // Red/orange for claimed by teammate - clearly unavailable
                rowBgClass = "bg-red-50 hover:bg-red-100 border-l-4 border-red-400 opacity-60";
              } else if (isOwnedByMe) {
                // Blue for already yours
                rowBgClass = "bg-blue-50 hover:bg-blue-100 border-l-4 border-blue-400";
              } else if (isExisting) {
                // Purple for exists but unassigned - available to claim
                rowBgClass = "bg-purple-50 hover:bg-purple-100 border-l-4 border-purple-400";
              }
              
              return (
              <tr
                key={result.id || index}
                className={`${rowBgClass} transition-colors duration-150`}
              >
                <td className="whitespace-nowrap px-6 py-4 text-sm font-bold text-gray-900">
                  <div className="flex items-center">
                    <MapPin className="w-4 h-4 mr-2 text-gray-400" />
                    {result.name}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-700">
                  {result.address}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                  {result.phone ? (
                    <div className="flex items-center">
                      <Phone className="w-4 h-4 mr-2 text-gray-400" />
                      {result.phone}
                    </div>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                  {result.rating ? (
                    <div className="flex items-center">
                      <Star className="w-4 h-4 mr-1 text-yellow-400 fill-current" />
                      <span className="font-bold">
                        {result.rating.toFixed(1)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                  {result.reviewCount ? (
                    <span className="font-bold">{result.reviewCount}</span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-700">
                  {result.website ? (
                    <Tooltip content="Visit website">
                      <a
                        href={result.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-emerald-600 hover:text-emerald-800 hover:underline font-bold transition-colors"
                      >
                        <Globe className="w-4 h-4 mr-1" />
                        Visit
                      </a>
                    </Tooltip>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm">
                  {isClaimedByOther ? (
                    // Claimed by another team member - clearly show unavailable
                    <div className="flex flex-col gap-1">
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold bg-red-100 text-red-800">
                        <User className="w-3 h-3 mr-1" />
                        Claimed
                      </span>
                      {result.existingOwnerName && (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                          By: {result.existingOwnerName}
                        </span>
                      )}
                    </div>
                  ) : isOwnedByMe ? (
                    // Already owned by current user
                    <div className="flex flex-col gap-1">
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold bg-blue-100 text-blue-800">
                        <User className="w-3 h-3 mr-1" />
                        Yours
                      </span>
                      {result.leadStatus && (
                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                          result.leadStatus === 'converted' ? 'bg-green-100 text-green-800' :
                          result.leadStatus === 'not_interested' ? 'bg-red-100 text-red-800' :
                          result.leadStatus === 'interested' ? 'bg-blue-100 text-blue-800' :
                          result.leadStatus === 'contacted' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {result.leadStatus}
                        </span>
                      )}
                    </div>
                  ) : isExisting ? (
                    // Exists but unclaimed - just claimed by this search
                    <div className="flex flex-col gap-1">
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold bg-purple-100 text-purple-800">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Claimed
                      </span>
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-700">
                        Added to your CRM
                      </span>
                    </div>
                  ) : (
                    // Brand new lead
                    <div className="flex flex-col gap-1">
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-800">
                        New
                      </span>
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-700">
                        Added to your CRM
                      </span>
                    </div>
                  )}
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        itemsPerPage={itemsPerPage}
        totalItems={results.length}
      />
    </div>
  );
}
