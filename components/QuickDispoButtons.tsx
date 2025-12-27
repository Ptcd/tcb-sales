"use client";

import { useEffect, useCallback } from "react";
import { 
  PhoneMissed, PhoneOff, UserX, ThumbsDown, 
  FileText, Rocket, Calendar
} from "lucide-react";
import { CallOutcomeCode } from "@/lib/types";

interface QuickDispoButtonsProps {
  selectedCode: CallOutcomeCode | "";
  onSelect: (code: CallOutcomeCode) => void;
  disabled?: boolean;
}

interface DispoButton {
  code: CallOutcomeCode;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  hoverColor: string;
  shortcut: string;
}

const DISPO_BUTTONS: DispoButton[] = [
  {
    code: "NO_ANSWER",
    label: "No Answer",
    shortLabel: "No Ans",
    icon: <PhoneMissed className="h-4 w-4" />,
    color: "text-slate-400",
    bgColor: "bg-slate-700",
    hoverColor: "hover:bg-slate-600",
    shortcut: "1",
  },
  {
    code: "BUSY",
    label: "Busy",
    shortLabel: "Busy",
    icon: <PhoneOff className="h-4 w-4" />,
    color: "text-orange-400",
    bgColor: "bg-orange-500/20",
    hoverColor: "hover:bg-orange-500/30",
    shortcut: "2",
  },
  {
    code: "INTERESTED_INFO_SENT",
    label: "Info Sent",
    shortLabel: "Info",
    icon: <FileText className="h-4 w-4" />,
    color: "text-blue-400",
    bgColor: "bg-blue-500/20",
    hoverColor: "hover:bg-blue-500/30",
    shortcut: "3",
  },
  {
    code: "ONBOARDING_SCHEDULED",
    label: "Schedule Onboarding",
    shortLabel: "Schedule",
    icon: <Calendar className="h-4 w-4" />,
    color: "text-green-400",
    bgColor: "bg-green-500/20",
    hoverColor: "hover:bg-green-500/30",
    shortcut: "4",
  },
  {
    code: "CALLBACK_SCHEDULED",
    label: "Callback",
    shortLabel: "Callback",
    icon: <Calendar className="h-4 w-4" />,
    color: "text-purple-400",
    bgColor: "bg-purple-500/20",
    hoverColor: "hover:bg-purple-500/30",
    shortcut: "5",
  },
  {
    code: "NOT_INTERESTED",
    label: "Not Interested",
    shortLabel: "Not Int",
    icon: <ThumbsDown className="h-4 w-4" />,
    color: "text-red-400",
    bgColor: "bg-red-500/20",
    hoverColor: "hover:bg-red-500/30",
    shortcut: "6",
  },
  {
    code: "WRONG_NUMBER",
    label: "Wrong Number",
    shortLabel: "Wrong #",
    icon: <UserX className="h-4 w-4" />,
    color: "text-gray-400",
    bgColor: "bg-gray-500/20",
    hoverColor: "hover:bg-gray-500/30",
    shortcut: "7",
  },
];

export function QuickDispoButtons({ selectedCode, onSelect, disabled }: QuickDispoButtonsProps) {
  // Keyboard shortcut handler
  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    if (disabled) return;
    
    // Only handle number keys 1-7
    const key = e.key;
    if (key >= "1" && key <= "7") {
      const index = parseInt(key) - 1;
      if (index < DISPO_BUTTONS.length) {
        e.preventDefault();
        onSelect(DISPO_BUTTONS[index].code);
      }
    }
  }, [onSelect, disabled]);

  // Register keyboard shortcuts
  useEffect(() => {
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [handleKeyPress]);

  return (
    <div className="grid grid-cols-4 gap-2">
      {DISPO_BUTTONS.map((btn) => {
        const isSelected = selectedCode === btn.code;
        
        return (
          <button
            key={btn.code}
            onClick={() => onSelect(btn.code)}
            disabled={disabled}
            className={`
              relative px-3 py-3 rounded-lg font-medium text-sm
              flex flex-col items-center justify-center gap-1
              transition-all duration-150
              ${isSelected 
                ? `${btn.bgColor} ${btn.color} ring-2 ring-offset-2 ring-offset-slate-800 ring-current` 
                : `${btn.bgColor} ${btn.color} ${btn.hoverColor}`
              }
              ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
            `}
            title={`${btn.label} (Press ${btn.shortcut})`}
          >
            {/* Keyboard shortcut badge */}
            <span className="absolute top-1 right-1 text-[10px] text-slate-500 font-mono">
              {btn.shortcut}
            </span>
            
            {/* Icon */}
            {btn.icon}
            
            {/* Label */}
            <span className="text-xs">{btn.shortLabel}</span>
            
            {/* Selected indicator */}
            {isSelected && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-current rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}


