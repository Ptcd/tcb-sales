"use client";

import { LeadStatus } from "@/lib/types";

interface LeadStatusBadgeProps {
  status: LeadStatus;
  onClick?: () => void;
  className?: string;
}

const statusConfig: Record<LeadStatus, { label: string; color: string; bgColor: string }> = {
  new: {
    label: "New",
    color: "text-blue-700",
    bgColor: "bg-blue-100",
  },
  contacted: {
    label: "Contacted",
    color: "text-yellow-700",
    bgColor: "bg-yellow-100",
  },
  interested: {
    label: "Interested",
    color: "text-green-700",
    bgColor: "bg-green-100",
  },
  trial_started: {
    label: "Trial Started",
    color: "text-indigo-700",
    bgColor: "bg-indigo-100",
  },
  follow_up: {
    label: "Follow-Up",
    color: "text-orange-700",
    bgColor: "bg-orange-100",
  },
  closed_won: {
    label: "Closed Won",
    color: "text-emerald-700",
    bgColor: "bg-emerald-100",
  },
  closed_lost: {
    label: "Closed Lost",
    color: "text-rose-700",
    bgColor: "bg-rose-100",
  },
  not_interested: {
    label: "Not Interested",
    color: "text-gray-700",
    bgColor: "bg-gray-100",
  },
  converted: {
    label: "Converted",
    color: "text-purple-700",
    bgColor: "bg-purple-100",
  },
};

export default function LeadStatusBadge({
  status,
  onClick,
  className = "",
}: LeadStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.new;

  return (
    <span
      onClick={onClick}
      className={`
        inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
        ${config.bgColor} ${config.color}
        ${onClick ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}
        ${className}
      `}
    >
      {config.label}
    </span>
  );
}

