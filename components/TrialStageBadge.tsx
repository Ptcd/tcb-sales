"use client";

import { BADGE_CONFIG, BadgeKey } from "@/lib/badges";

interface TrialStageBadgeProps {
  badgeKey?: string;
}

export default function TrialStageBadge({ badgeKey }: TrialStageBadgeProps) {
  const config = BADGE_CONFIG[badgeKey as BadgeKey] || BADGE_CONFIG.new;
  
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
      {config.label}
    </span>
  );
}


