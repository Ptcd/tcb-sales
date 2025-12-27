"use client";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import { useState, useEffect } from "react";
import Button from "@/components/Button";
import Input from "@/components/Input";
import Tooltip from "@/components/Tooltip";
import { exportToCSV, exportToExcel } from "@/lib/utils/export";
import type { BusinessResult } from "@/lib/types";
import LeadStatusDropdown from "@/components/LeadStatusDropdown";
import NotesPanel from "@/components/NotesPanel";
import ActivityTimeline from "@/components/ActivityTimeline";
import LeadDetailsPanel from "@/components/LeadDetailsPanel";
import SMSPanel from "@/components/SMSPanel";
import { EmailPanel } from "@/components/EmailPanel";
import { MessageSquare, Activity, Phone, Mail, UserPlus, MessageCircle, Info } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import TrialStageBadge from "@/components/TrialStageBadge";

interface DataTableProps {
  data: BusinessResult[];
  isLoading?: boolean;
  searchParams?: {
    keyword: string;
    location: string;
    resultCount: number;
  };
  isTrialsView?: boolean;
}

const columnHelper = createColumnHelper<BusinessResult>();

export default function DataTable({
  data,
  isLoading,
  searchParams,
  isTrialsView = false,
}: DataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [notesPanelOpen, setNotesPanelOpen] = useState(false);
  const [activityPanelOpen, setActivityPanelOpen] = useState(false);
  const [detailsPanelOpen, setDetailsPanelOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<BusinessResult | null>(null);
  const [tableData, setTableData] = useState<BusinessResult[]>(data);
  const [rowSelection, setRowSelection] = useState({});
  const [smsPanelOpen, setSmsPanelOpen] = useState(false);
  const [emailPanelOpen, setEmailPanelOpen] = useState(false);
  const [addEmailLead, setAddEmailLead] = useState<BusinessResult | null>(null);
  const [newEmailValue, setNewEmailValue] = useState("");
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; full_name: string; email: string }>>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedAssignee, setSelectedAssignee] = useState<string>("");
  const router = useRouter();

  // Update table data when prop changes
  useEffect(() => {
    setTableData(data);
  }, [data]);

  // Fetch user role and team members (for admins)
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const profileRes = await fetch("/api/auth/profile");
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          setIsAdmin(profileData.role === "admin");
          // Store current user ID for claimed lead comparison
          if (profileData.profile?.id) {
            setCurrentUserId(profileData.profile.id);
          }

          // If admin, fetch team members for assignment
          if (profileData.role === "admin") {
            const teamRes = await fetch("/api/team/users");
            if (teamRes.ok) {
              const teamData = await teamRes.json();
              setTeamMembers(teamData.users || []);
            }
          }
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    };

    fetchUserData();
  }, []);

  // Function to update lead status in local state
  const updateLeadStatus = (leadId: string, newStatus: string) => {
    setTableData(prevData =>
      prevData.map(lead =>
        lead.id === leadId ? { ...lead, leadStatus: newStatus as any } : lead
      )
    );
  };

  const columns: ColumnDef<BusinessResult, any>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllPageRowsSelected()}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
          className="rounded border-gray-300 cursor-pointer"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          className="rounded border-gray-300 cursor-pointer"
        />
      ),
    },
    {
      accessorKey: "name",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-7 px-2 text-xs font-medium text-slate-700 hover:text-slate-900"
        >
          Business Name
          <svg
            className="ml-2 h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={
                column.getIsSorted() === "asc"
                  ? "M5 15l7-7 7 7"
                  : "M19 9l-7 7-7-7"
              }
            />
          </svg>
        </Button>
      ),
      cell: ({ row }) => {
        const name = row.getValue("name") as string;
        // Use the new isClaimedByOther field if available, fallback to old logic
        const isClaimedByOther = row.original.isClaimedByOther || (
          row.original.isExistingLead && 
          row.original.existingOwnerId && 
          row.original.existingOwnerId !== currentUserId
        );
        return (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-900">{name}</span>
            {isClaimedByOther && row.original.existingOwnerName && (
              <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                Claimed by {row.original.existingOwnerName}
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row, getValue }) => {
        const phone = getValue();
        return phone ? (
          <Tooltip content="Call with softphone">
            <button
              onClick={() => {
                if (!phone) {
                  toast.error("No phone number available");
                  return;
                }
                window.location.href = `/dashboard/dialer?leadId=${row.original.id}&phone=${encodeURIComponent(phone)}&name=${encodeURIComponent(row.original.name)}`;
              }}
              className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
            >
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
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                />
              </svg>
              {phone}
            </button>
          </Tooltip>
        ) : (
          <span className="text-slate-400">—</span>
        );
      },
    },
    {
      accessorKey: "leadStatus",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.leadStatus || 'new';
        return (
          <LeadStatusDropdown
            key={row.original.id}
            leadId={row.original.id}
            currentStatus={status}
            onStatusChange={(newStatus) => {
              updateLeadStatus(row.original.id, newStatus);
            }}
          />
        );
      },
    },
    {
      id: "nextAction",
      header: "Next Action",
      cell: ({ row }) => {
        const nextActionAt = row.original.nextActionAt;
        const nextActionNote = row.original.nextActionNote;
        
        if (!nextActionAt) {
          return <span className="text-slate-400 text-xs">—</span>;
        }
        
        const actionDate = new Date(nextActionAt);
        const isOverdue = actionDate < new Date();
        const isToday = actionDate.toDateString() === new Date().toDateString();
        
        return (
          <div className="flex flex-col gap-1">
            <div className={`text-xs font-medium ${
              isOverdue ? 'text-red-600' : isToday ? 'text-orange-600' : 'text-slate-700'
            }`}>
              {isToday ? 'Today' : isOverdue ? 'Overdue' : actionDate.toLocaleDateString()}{' '}
              {actionDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            {nextActionNote && (
              <div className="text-xs text-slate-500 truncate max-w-[150px]" title={nextActionNote}>
                {nextActionNote}
              </div>
            )}
          </div>
        );
      },
    },
    // Only show these columns in trials view
    ...(isTrialsView ? [
      {
        id: "trialBadge",
        header: "Stage",
        cell: ({ row }: { row: { original: BusinessResult } }) => {
          const badge = row.original.badgeKey || (row.original as any).badge_key;
          return <TrialStageBadge badgeKey={badge} />;
        },
      },
      {
        id: "aging",
        header: "Aging",
        cell: ({ row }: { row: { original: BusinessResult } }) => {
          const tp = row.original.trialPipeline;
          if (!tp?.trialStartedAt) return <span className="text-slate-400">—</span>;
          const days = Math.floor((Date.now() - new Date(tp.trialStartedAt).getTime()) / 86400000);
          return <span className={days > 7 ? "text-red-600 font-medium" : "text-slate-700"}>{days}d</span>;
        },
      },
      {
        id: "trialEnds",
        header: "Trial Ends",
        cell: ({ row }: { row: { original: BusinessResult } }) => {
          const tp = row.original.trialPipeline;
          if (!tp?.trialEndsAt) return <span className="text-slate-400">—</span>;
          return <span className="text-xs">{new Date(tp.trialEndsAt).toLocaleDateString()}</span>;
        },
      },
      {
        id: "convertedInfo",
        header: "Converted",
        cell: ({ row }: { row: { original: BusinessResult } }) => {
          const tp = row.original.trialPipeline;
          if (!tp?.convertedAt) return <span className="text-slate-400">—</span>;
          return (
            <div className="text-xs">
              <div className="text-green-600 font-medium">{tp.plan}</div>
              <div className="text-slate-500">${tp.mrr}/mo</div>
            </div>
          );
        },
      },
    ] : []),
    {
      id: "details",
      header: "Details",
      cell: ({ row }) => (
        <Tooltip content="View details">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedLead(row.original);
              setDetailsPanelOpen(true);
            }}
            className="h-7 w-7 p-0 hover:bg-blue-50"
          >
            <Info className="h-4 w-4 text-blue-600" />
          </Button>
        </Tooltip>
      ),
    },
    {
      id: "crmActions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          {row.original.phone && (() => {
            // Use the new isClaimedByOther field if available, fallback to old logic
            const isClaimedByOther = row.original.isClaimedByOther || (
              row.original.isExistingLead && 
              row.original.existingOwnerId && 
              row.original.existingOwnerId !== currentUserId
            );
            
            if (isClaimedByOther) {
              return (
                <Tooltip content="This lead is already being worked by another team member">
                  <div className="flex items-center gap-2 opacity-50 cursor-not-allowed">
                    <MessageCircle className="h-4 w-4 text-gray-400" />
                    <Phone className="h-4 w-4 text-gray-400" />
                  </div>
                </Tooltip>
              );
            }
            
            return (
              <>
                <Tooltip content="Send text">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenConversation(row.original)}
                    className="h-7 w-7 p-0 hover:bg-cyan-50"
                  >
                    <MessageCircle className="h-4 w-4 text-cyan-600" />
                  </Button>
                </Tooltip>
                <Tooltip content="Call lead">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCallLead(row.original)}
                    className="h-7 w-7 p-0 hover:bg-green-50"
                  >
                    <Phone className="h-4 w-4 text-green-600" />
                  </Button>
                </Tooltip>
              </>
            );
          })()}
          {/* Email button - always show, different behavior based on whether email exists */}
          <Tooltip content={row.original.email ? "Send email" : "Add email address"}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (row.original.email) {
                  setSelectedLead(row.original);
                  setEmailPanelOpen(true);
                } else {
                  setAddEmailLead(row.original);
                  setNewEmailValue("");
                }
              }}
              className={`h-7 w-7 p-0 ${row.original.email ? "hover:bg-indigo-50" : "hover:bg-gray-100"}`}
            >
              <Mail className={`h-4 w-4 ${row.original.email ? "text-indigo-600" : "text-gray-400"}`} />
            </Button>
          </Tooltip>
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: tableData,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    getRowId: (row) => row.id,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      rowSelection,
    },
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  const handleExportCSV = () => {
    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `business-data-${timestamp}`;
    exportToCSV(tableData, filename);
  };

  const handleExportExcel = () => {
    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `business-data-${timestamp}`;
    exportToExcel(tableData, filename);
  };

  const handleCallLead = (lead: BusinessResult) => {
    if (!lead.phone) {
      toast.error("No phone number available for this lead");
      return;
    }
    
    // Redirect to dialer mode with this lead pre-loaded
    window.location.href = `/dashboard/dialer?leadId=${lead.id}&phone=${encodeURIComponent(lead.phone)}&name=${encodeURIComponent(lead.name)}`;
  };


  const handleAddEmail = async () => {
    if (!addEmailLead) return;
    
    if (!newEmailValue.trim()) {
      toast.error("Please enter an email address");
      return;
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmailValue.trim())) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsSavingEmail(true);
    try {
      const response = await fetch(`/api/leads/${addEmailLead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmailValue.trim() }),
      });

      if (!response.ok) {
        throw new Error("Failed to update email");
      }

      // Update the lead in local state
      const updatedData = tableData.map((item) =>
        item.id === addEmailLead.id
          ? { ...item, email: newEmailValue.trim() }
          : item
      );
      setTableData(updatedData);

      toast.success("Email added successfully! You can now send emails to this lead.");
      
      // Ask if they want to send an email now
      const leadWithEmail = { ...addEmailLead, email: newEmailValue.trim() };
      setAddEmailLead(null);
      setNewEmailValue("");
      
      // Open email panel with the updated lead
      setSelectedLead(leadWithEmail);
      setEmailPanelOpen(true);
    } catch (error) {
      console.error("Error saving email:", error);
      toast.error("Failed to add email address");
    } finally {
      setIsSavingEmail(false);
    }
  };

  const handleOpenConversation = (lead: BusinessResult) => {
    if (!lead.phone) {
      toast.error("No phone number available");
      return;
    }
    // Navigate to conversations with lead ID, phone, and name as query params
    // This allows creating new conversations even when lead doesn't exist in DB yet
    const params = new URLSearchParams({
      leadId: lead.id,
      phone: lead.phone,
      name: lead.name || "Unknown",
    });
    router.push(`/dashboard/conversations?${params.toString()}`);
  };

  const handleBulkAssign = async () => {
    if (!selectedAssignee) {
      toast.error("Please select a team member to assign leads to");
      return;
    }

    const selectedLeadIds = Object.keys(rowSelection);
    if (selectedLeadIds.length === 0) {
      toast.error("Please select at least one lead");
      return;
    }

    try {
      const response = await fetch("/api/admin/assign-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadIds: selectedLeadIds,
          assignedTo: selectedAssignee,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to assign leads");
      }

      toast.success(`Successfully assigned ${data.assignedCount} lead(s)`);
      setShowAssignModal(false);
      setSelectedAssignee("");
      setRowSelection({});

      // Refresh table data
      const updatedData = tableData.map((item) =>
        selectedLeadIds.includes(item.id)
          ? { ...item, assignedTo: selectedAssignee }
          : item
      );
      setTableData(updatedData);
    } catch (error: any) {
      console.error("Error assigning leads:", error);
      toast.error(error.message || "Failed to assign leads");
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-slate-200 rounded w-1/4"></div>
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-slate-100 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-slate-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              {data.length} Results
            </h3>
            {searchParams && (
              <p className="text-xs text-slate-600 mt-1">
                {searchParams.keyword} in {searchParams.location}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {Object.keys(rowSelection).length > 0 && (
              <>
                {isAdmin && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setShowAssignModal(true)}
                    className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700"
                  >
                    <UserPlus className="h-4 w-4" />
                    Assign ({Object.keys(rowSelection).length})
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setSmsPanelOpen(true)}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  <MessageSquare className="h-4 w-4" />
                  Send SMS ({Object.keys(rowSelection).length})
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setEmailPanelOpen(true)}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700"
                >
                  <Mail className="h-4 w-4" />
                  Send Email ({Object.keys(rowSelection).length})
                </Button>
              </>
            )}
            <Tooltip content="Export as CSV">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                className="flex items-center gap-2"
              >
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
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                CSV
              </Button>
            </Tooltip>
            <Tooltip content="Export as Excel">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                className="flex items-center gap-2"
              >
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
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Excel
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="border-b border-slate-200 p-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search all columns..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="max-w-sm"
            />
          </div>
          <div className="text-xs text-slate-800 font-medium">
            Showing {table.getFilteredRowModel().rows.length} of {data.length}{" "}
            results
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-200">
            {table.getRowModel().rows.map((row) => {
              const nextActionAt = row.original.nextActionAt ? new Date(row.original.nextActionAt) : null;
              const now = new Date();
              const todayStr = now.toDateString();
              const isToday = nextActionAt && nextActionAt.toDateString() === todayStr;
              const isOverdue = nextActionAt && nextActionAt < now && !isToday;
              const twoDaysOut = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
              const isUpcoming = nextActionAt && nextActionAt > now && nextActionAt <= twoDaysOut && !isToday;

              const rowHighlight = isToday || isOverdue || isUpcoming;
              const highlightClass = isToday || isOverdue
                ? "bg-amber-50 hover:bg-amber-100"
                : isUpcoming
                ? "bg-blue-50 hover:bg-blue-100"
                : "hover:bg-slate-50";

              return (
                <tr
                  key={row.id}
                  className={`transition-colors duration-150 ${highlightClass}`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 whitespace-nowrap">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="border-t border-slate-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-800 font-medium">
              Rows per page:
            </span>
            <select
              value={table.getState().pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-900 bg-white focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-100"
            >
              {[5, 10, 20, 30, 50].map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  {pageSize}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-sm text-slate-800 font-medium">
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount()}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
                Last
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* CRM Panels */}
      {selectedLead && (
        <>
          <LeadDetailsPanel
            lead={selectedLead}
            isOpen={detailsPanelOpen}
            onClose={() => setDetailsPanelOpen(false)}
            onCall={handleCallLead}
            onText={handleOpenConversation}
          />
          <NotesPanel
            leadId={selectedLead.id}
            leadName={selectedLead.name}
            isOpen={notesPanelOpen}
            onClose={() => setNotesPanelOpen(false)}
          />
          <ActivityTimeline
            leadId={selectedLead.id}
            leadName={selectedLead.name}
            isOpen={activityPanelOpen}
            onClose={() => setActivityPanelOpen(false)}
          />
        </>
      )}

      {/* SMS Panel */}
      <SMSPanel
        isOpen={smsPanelOpen}
        onClose={() => {
          setSmsPanelOpen(false);
          setRowSelection({});
        }}
        selectedLeadIds={Object.keys(rowSelection)}
        leads={tableData}
      />

      {/* Email Panel */}
      {emailPanelOpen && (
        <EmailPanel
          leads={
            selectedLead 
              ? [selectedLead] 
              : Object.keys(rowSelection)
                  .filter(key => (rowSelection as Record<string, boolean>)[key])
                  .map(id => tableData.find(lead => lead.id === id))
                  .filter((lead): lead is BusinessResult => lead !== undefined)
          }
          onClose={() => {
            setEmailPanelOpen(false);
            setSelectedLead(null);
            setRowSelection({});
          }}
          onEmailsSent={() => {
            // Refresh data or show success message
            toast.success("Emails sent successfully!");
          }}
        />
      )}


      {/* Bulk Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Assign {Object.keys(rowSelection).length} Lead(s)
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assign to
                </label>
                <select
                  value={selectedAssignee}
                  onChange={(e) => setSelectedAssignee(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select a team member...</option>
                  {teamMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.full_name || member.email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAssignModal(false);
                    setSelectedAssignee("");
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleBulkAssign}>Assign</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Email Modal */}
      {addEmailLead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-indigo-100 rounded-full">
                <Mail className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Add Email Address
                </h3>
                <p className="text-sm text-gray-600">{addEmailLead.name}</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={newEmailValue}
                  onChange={(e) => setNewEmailValue(e.target.value)}
                  placeholder="example@email.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddEmail();
                    }
                  }}
                />
                <p className="text-xs text-gray-500 mt-1">
                  This will be saved to the lead&apos;s profile
                </p>
              </div>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAddEmailLead(null);
                    setNewEmailValue("");
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleAddEmail}
                  disabled={isSavingEmail}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {isSavingEmail ? "Saving..." : "Save & Send Email"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
