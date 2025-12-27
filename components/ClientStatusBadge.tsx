"use client";

import { Crown, Clock, AlertTriangle, CheckCircle, Zap, MinusCircle, Code } from "lucide-react";

interface ClientStatusBadgeProps {
  status: string | null;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
}

const statusConfig: Record<string, {
  label: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  none: {
    label: "No Status",
    bgColor: "bg-gray-100",
    textColor: "text-gray-600",
    borderColor: "border-gray-200",
    icon: MinusCircle,
  },
  trialing: {
    label: "Trialing",
    bgColor: "bg-blue-100",
    textColor: "text-blue-700",
    borderColor: "border-blue-200",
    icon: Clock,
  },
  trial_activated: {
    label: "Activated",
    bgColor: "bg-indigo-100",
    textColor: "text-indigo-700",
    borderColor: "border-indigo-200",
    icon: Zap,
  },
  snippet_installed: {
    label: "Snippet Installed",
    bgColor: "bg-purple-100",
    textColor: "text-purple-700",
    borderColor: "border-purple-200",
    icon: Code,
  },
  trial_qualified: {
    label: "Trial Qualified",
    bgColor: "bg-indigo-100",
    textColor: "text-indigo-700",
    borderColor: "border-indigo-200",
    icon: CheckCircle,
  },
  credits_low: {
    label: "Credits Low",
    bgColor: "bg-amber-100",
    textColor: "text-amber-700",
    borderColor: "border-amber-200",
    icon: AlertTriangle,
  },
  trial_expiring: {
    label: "Trial Expiring",
    bgColor: "bg-orange-100",
    textColor: "text-orange-700",
    borderColor: "border-orange-200",
    icon: Clock,
  },
  paid: {
    label: "Paid",
    bgColor: "bg-green-100",
    textColor: "text-green-700",
    borderColor: "border-green-200",
    icon: Crown,
  },
};

export default function ClientStatusBadge({ 
  status, 
  size = "md",
  showIcon = true 
}: ClientStatusBadgeProps) {
  const config = statusConfig[status || "none"] || statusConfig.none;
  const Icon = config.icon;

  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-3 py-1 text-sm",
    lg: "px-4 py-1.5 text-base",
  };

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${config.bgColor} ${config.textColor} ${config.borderColor} ${sizeClasses[size]}`}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      {config.label}
    </span>
  );
}

/**
 * Get the color class for a status (useful for other components)
 */
export function getStatusColor(status: string | null): string {
  const config = statusConfig[status || "none"] || statusConfig.none;
  return config.textColor;
}

/**
 * Get the background color class for a status
 */
export function getStatusBgColor(status: string | null): string {
  const config = statusConfig[status || "none"] || statusConfig.none;
  return config.bgColor;
}

