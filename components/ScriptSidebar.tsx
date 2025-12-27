"use client";

import { useState, useEffect } from "react";
import { 
  FileText, ChevronDown, ChevronUp, Loader2, 
  AlertTriangle, Lightbulb, MessageSquare, Target,
  Copy, Check
} from "lucide-react";
import toast from "react-hot-toast";
import { BadgeKey } from "@/lib/types";

interface CallScript {
  id: string;
  name: string;
  content: string;
  campaignName?: string;
}

interface ScriptSidebarProps {
  leadName?: string;
  campaignId?: string;
  badgeKey?: BadgeKey;
  scriptKey?: string | null;  // NEW: Explicit script key from dialer
  contactName?: string; // Contact person's name for {{first_name}} variable
  isInCall?: boolean;
}

// Common objection handlers
const OBJECTION_HANDLERS = [
  {
    objection: "We're not interested",
    response: "I completely understand. Quick question though — are you currently using any tool to give instant quotes to people calling about their junk cars? Most yards tell me they're losing 30% of callers who won't wait for a callback.",
    category: "soft_no"
  },
  {
    objection: "We already have something",
    response: "That's great! What are you using? I'm curious because most yards that switched to us said they were frustrated with [slow quotes / no website integration / paying per lead]. Does yours handle instant web quotes?",
    category: "competitor"
  },
  {
    objection: "Send me info / I'll think about it",
    response: "Absolutely, I'll send that right over. But let me ask — if this worked exactly how you wanted, would you actually try it? Our trial is completely free with 20 quotes included, so there's zero risk to see it in action.",
    category: "stall"
  },
  {
    objection: "How much does it cost?",
    response: "Great question. The trial is completely free — you get 20 instant quotes to test it out. After that, most yards pay around $50-100/month depending on volume. But honestly, if you're closing even one extra car a week from faster quotes, that pays for a year.",
    category: "price"
  },
  {
    objection: "I need to talk to my partner / owner",
    response: "Totally makes sense. When's a good time to catch both of you? I can do a quick 5-minute demo call — or if easier, I can send you a short video showing exactly how it works so you can share it with them.",
    category: "decision_maker"
  },
  {
    objection: "We're too busy right now",
    response: "I hear you — busy is good! Quick thought though: this actually saves time. Instead of manually quoting each car, customers get instant prices on your website 24/7. Can I show you a 2-minute demo?",
    category: "timing"
  },
];

// Default script when no campaign script exists
const DEFAULT_SCRIPT = `**Opening:**
"Hi, this is [Your Name] calling from Junk Car Calculator. Am I speaking with the owner or manager?"

**Hook:**
"Great! We help junk yards like yours get more cars by giving instant quotes to anyone who calls or visits your website. Most yards tell me they're losing callers who won't wait for a callback."

**Qualify:**
"Quick question — how are you currently handling quote requests? Do you have something on your website that gives instant prices?"

**Value Prop:**
"What we do is put a calculator right on your site. Customers punch in their car info and get an instant offer — 24/7. No more phone tag, no more lost leads."

**Trial Close:**
"We have a free trial with 20 quotes included, no credit card needed. Want me to set one up so you can see how it works?"

**Objection Handling:**
If busy: "Totally get it — I'll be quick. What if I sent you a 2-minute video showing exactly how it works?"
If not interested: "No problem. Out of curiosity, what are you using now for quotes?"
If send info: "Sure! What's the best email? I'll include a link so you can see the calculator in action."`;

// Quick CTA scripts
const CTA_SCRIPTS = [
  {
    label: "Offer Trial",
    script: "I'd love to get you set up with a free trial — that's 20 quotes, no credit card needed. What email should I send the login to?"
  },
  {
    label: "Send Info",
    script: "Let me send you a quick overview — what's the best email? I'll include a link so you can see exactly how the calculator looks on a website."
  },
  {
    label: "Schedule Demo",
    script: "How about I show you exactly how it works? Takes about 5 minutes. What's a good time tomorrow — morning or afternoon?"
  },
  {
    label: "Follow Up",
    script: "Sounds like the timing's not quite right. Can I check back in a week or two? What day works best for a quick call?"
  },
];

export function ScriptSidebar({ leadName, campaignId, badgeKey, scriptKey, contactName, isInCall }: ScriptSidebarProps) {
  const [script, setScript] = useState<CallScript | null>(null);
  const [isLoadingScript, setIsLoadingScript] = useState(false);
  const [showScript, setShowScript] = useState(true);
  const [showObjections, setShowObjections] = useState(false);
  const [showCTAs, setShowCTAs] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [scriptWarning, setScriptWarning] = useState<string | null>(null);

  // Fetch script when campaign, badge, or scriptKey changes
  useEffect(() => {
    if (campaignId) {
      setIsLoadingScript(true);
      setScriptWarning(null);
      
      const params = new URLSearchParams({ campaignId: campaignId });
      if (scriptKey) {
        params.append('scriptKey', scriptKey);
      } else if (badgeKey) {
        params.append('badgeKey', badgeKey);
      }
      
      fetch(`/api/call-scripts?${params.toString()}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.scripts && data.scripts.length > 0) {
            // Priority order:
            // 1. Exact script_key match (if scriptKey provided)
            // 2. Badge-specific script (if badgeKey provided)
            // 3. Campaign default (no badge_key, no script_key)
            // 4. Any active script
            
            let selectedScript = null;
            
            if (scriptKey) {
              selectedScript = data.scripts.find((s: any) => s.scriptKey === scriptKey && s.isActive);
            }
            
            if (!selectedScript && badgeKey) {
              selectedScript = data.scripts.find((s: any) => s.badgeKey === badgeKey && s.isActive);
            }
            
            if (!selectedScript) {
              selectedScript = data.scripts.find((s: any) => !s.badgeKey && !s.scriptKey && s.isActive);
            }
            
            if (!selectedScript) {
              selectedScript = data.scripts.find((s: any) => s.isActive);
            }
            
            if (!selectedScript) {
              selectedScript = data.scripts[0];
            }
            
            if (selectedScript) {
              setScript({
                id: selectedScript.id,
                name: selectedScript.name,
                content: selectedScript.content,
                campaignName: selectedScript.campaignName,
              });
            } else {
              setScript(null);
            }
            
            // Show warning if requested script not found
            if (scriptKey && !data.scripts.find((s: any) => s.scriptKey === scriptKey)) {
              setScriptWarning(`No script for "${scriptKey}" - using fallback`);
            } else if (badgeKey && !data.scripts.find((s: any) => s.badgeKey === badgeKey)) {
              setScriptWarning(`No script for ${badgeKey} status`);
            }
          } else {
            setScript(null);
          }
        })
        .catch((err) => {
          console.error("Error fetching script:", err);
          setScript(null);
        })
        .finally(() => {
          setIsLoadingScript(false);
        });
    } else {
      setScript(null);
    }
  }, [campaignId, badgeKey, scriptKey]);

  // Copy to clipboard helper
  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Replace variables in script
  const processScript = (content: string): string => {
    // Extract first name from contact name (e.g., "Jim Smith" -> "Jim")
    const firstName = contactName?.split(' ')[0] || "[Name]";
    
    return content
      .replace(/\{name\}/gi, leadName || "[Name]")
      .replace(/\{business\}/gi, leadName || "[Business]")
      .replace(/\{\{first_name\}\}/gi, firstName);
  };

  return (
    <div className="w-96 bg-slate-800 border-l border-slate-700 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-700">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-400" />
          Call Resources
        </h3>
        {isInCall && (
          <div className="mt-2 flex items-center gap-2 text-sm text-green-400">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Active Call
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Script Section */}
        <div className="border-b border-slate-700">
          <button
            onClick={() => setShowScript(!showScript)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-700/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-400" />
              <span className="font-medium text-white">
                {script?.name || "Call Script"}
              </span>
              {!script && !isLoadingScript && (
                <span className="text-xs text-slate-500">(default)</span>
              )}
            </div>
            {showScript ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>
          
          {showScript && (
            <div className="px-4 pb-4">
              {isLoadingScript ? (
                <div className="flex items-center justify-center py-6 text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading script...
                </div>
              ) : (
                <>
                  {!script && !isLoadingScript && (
                    <div className="mb-2 px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded inline-block">
                      Default Script
                    </div>
                  )}
                  {scriptWarning && (
                    <div className="mb-2 px-2 py-1 bg-amber-500/20 text-amber-400 text-xs rounded inline-block">
                      {scriptWarning}
                    </div>
                  )}
                  <div 
                    className="text-sm text-slate-300 leading-relaxed prose prose-invert prose-sm max-w-none bg-slate-900/50 rounded-lg p-4 max-h-80 overflow-y-auto"
                    dangerouslySetInnerHTML={{ 
                      __html: processScript(script?.content || DEFAULT_SCRIPT)
                        .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
                        .replace(/\{name\}/gi, `<span class="bg-yellow-500/20 text-yellow-300 px-1 rounded">${leadName || '[Name]'}</span>`)
                        .replace(/\{business\}/gi, `<span class="bg-yellow-500/20 text-yellow-300 px-1 rounded">${leadName || '[Business]'}</span>`)
                        .replace(/\{\{first_name\}\}/gi, `<span class="bg-yellow-500/20 text-yellow-300 px-1 rounded">${contactName?.split(' ')[0] || '[Name]'}</span>`)
                        .replace(/\n/g, '<br/>')
                    }}
                  />
                </>
              )}
            </div>
          )}
        </div>

        {/* Quick CTAs Section */}
        <div className="border-b border-slate-700">
          <button
            onClick={() => setShowCTAs(!showCTAs)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-700/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-green-400" />
              <span className="font-medium text-white">Quick CTAs</span>
            </div>
            {showCTAs ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>
          
          {showCTAs && (
            <div className="px-4 pb-4 space-y-2">
              {CTA_SCRIPTS.map((cta, index) => (
                <div 
                  key={index}
                  className="bg-slate-900/50 rounded-lg p-3 group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-green-400 uppercase tracking-wide">
                      {cta.label}
                    </span>
                    <button
                      onClick={() => copyToClipboard(cta.script, index)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-700 rounded transition-all"
                      title="Copy to clipboard"
                    >
                      {copiedIndex === index ? (
                        <Check className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-slate-400" />
                      )}
                    </button>
                  </div>
                  <p className="text-sm text-slate-300">{cta.script}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Objection Handlers Section */}
        <div className="border-b border-slate-700">
          <button
            onClick={() => setShowObjections(!showObjections)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-700/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <span className="font-medium text-white">Objection Handlers</span>
            </div>
            {showObjections ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>
          
          {showObjections && (
            <div className="px-4 pb-4 space-y-3">
              {OBJECTION_HANDLERS.map((handler, index) => (
                <div 
                  key={index}
                  className="bg-slate-900/50 rounded-lg p-3 group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-amber-400">
                      "{handler.objection}"
                    </span>
                    <button
                      onClick={() => copyToClipboard(handler.response, 100 + index)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-700 rounded transition-all"
                      title="Copy to clipboard"
                    >
                      {copiedIndex === 100 + index ? (
                        <Check className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-slate-400" />
                      )}
                    </button>
                  </div>
                  <p className="text-sm text-slate-300">{handler.response}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tips Section */}
        <div className="px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-4 w-4 text-yellow-400" />
            <span className="text-sm font-medium text-white">Quick Tips</span>
          </div>
          <ul className="text-xs text-slate-400 space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-yellow-400">•</span>
              <span>Mirror their pace and energy level</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-400">•</span>
              <span>Ask open questions to uncover pain points</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-400">•</span>
              <span>Always get a next step before hanging up</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-400">•</span>
              <span>Log notes while details are fresh</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Keyboard Shortcuts Footer */}
      <div className="p-3 border-t border-slate-700 bg-slate-900/50">
        <div className="text-xs text-slate-500">
          <span className="font-medium text-slate-400">Shortcuts:</span>
          <span className="ml-2">1-6 = Quick Dispo</span>
          <span className="ml-2">• M = Mute</span>
          <span className="ml-2">• Esc = Skip</span>
        </div>
      </div>
    </div>
  );
}

