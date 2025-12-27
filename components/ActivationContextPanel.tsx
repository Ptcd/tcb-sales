'use client';

import { 
  CheckCircle2, 
  XCircle, 
  ExternalLink, 
  Phone, 
  Clock, 
  AlertTriangle,
  User,
  Globe,
  Settings,
  TestTube,
  LogIn
} from 'lucide-react';
import { JCCActivationRecord, JCCChecklistItem, JCCBlocker } from '@/lib/types';

interface ActivationContextPanelProps {
  activation: JCCActivationRecord | null;
  isLoading?: boolean;
}

// Blocker display config
const BLOCKER_LABELS: Record<JCCBlocker, { label: string; color: string }> = {
  ghosting: { label: 'Ghosting', color: 'bg-red-500/20 text-red-400' },
  no_website: { label: 'No Website', color: 'bg-orange-500/20 text-orange-400' },
  needs_dev: { label: 'Needs Dev', color: 'bg-purple-500/20 text-purple-400' },
  fear_of_install: { label: 'Fear of Install', color: 'bg-yellow-500/20 text-yellow-400' },
  do_it_later: { label: 'Do It Later', color: 'bg-blue-500/20 text-blue-400' },
};

// Checklist item icons
const CHECKLIST_ICONS: Record<string, React.ReactNode> = {
  login: <LogIn className="h-4 w-4" />,
  settings: <Settings className="h-4 w-4" />,
  install: <Globe className="h-4 w-4" />,
  test_lead: <TestTube className="h-4 w-4" />,
};

// Status badge colors
const STATUS_COLORS: Record<string, string> = {
  queued: 'bg-yellow-500/20 text-yellow-400',
  in_progress: 'bg-blue-500/20 text-blue-400',
  activated: 'bg-green-500/20 text-green-400',
  killed: 'bg-red-500/20 text-red-400',
};

export function ActivationContextPanel({ 
  activation, 
  isLoading 
}: ActivationContextPanelProps) {
  if (isLoading) {
    return (
      <div className="w-80 bg-slate-800 border-l border-slate-700 p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-slate-700 rounded w-3/4" />
          <div className="h-20 bg-slate-700 rounded" />
          <div className="h-20 bg-slate-700 rounded" />
        </div>
      </div>
    );
  }

  if (!activation) {
    return (
      <div className="w-80 bg-slate-800 border-l border-slate-700 p-4">
        <p className="text-slate-400 text-sm">No activation selected</p>
      </div>
    );
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="w-80 bg-slate-800 border-l border-slate-700 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-2">
          Activation Context
        </h3>
        <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[activation.activation_status] || 'bg-slate-600 text-slate-300'}`}>
          {activation.activation_status.toUpperCase()}
        </span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Trial Age */}
        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">
            Trial Age
          </h4>
          <div className="flex items-center gap-2 text-white">
            <Clock className="h-4 w-4 text-slate-500" />
            <span className="font-medium">{activation.trial_age_days} days</span>
            <span className="text-slate-500 text-sm">
              (started {formatDate(activation.trial_started_at)})
            </span>
          </div>
        </div>

        {/* Contact History */}
        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">
            Contact History
          </h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Attempts</span>
              <span className="text-white font-medium">
                {activation.rescue_attempts}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Last Contact</span>
              <span className="text-white">
                {formatDate(activation.last_contact_at)}
              </span>
            </div>
            {activation.last_contact_result && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Last Result</span>
                <span className="text-white capitalize">
                  {activation.last_contact_result.replace('_', ' ')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Checklist */}
        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">
            Setup Checklist
          </h4>
          <div className="space-y-2">
            {activation.checklist.map((item) => (
              <div 
                key={item.key}
                className={`flex items-center gap-3 p-2 rounded ${
                  item.completed 
                    ? 'bg-green-500/10' 
                    : 'bg-slate-700/50'
                }`}
              >
                {item.completed ? (
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                ) : (
                  <XCircle className="h-4 w-4 text-slate-500" />
                )}
                <span className="text-slate-300">{CHECKLIST_ICONS[item.key]}</span>
                <span className={`text-sm capitalize ${
                  item.completed ? 'text-white' : 'text-slate-400'
                }`}>
                  {item.key.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Blockers */}
        {activation.blockers.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2 flex items-center gap-2">
              <AlertTriangle className="h-3 w-3 text-yellow-500" />
              Blockers
            </h4>
            <div className="flex flex-wrap gap-2">
              {activation.blockers.map((blocker) => (
                <span
                  key={blocker}
                  className={`px-2 py-1 rounded text-xs font-medium ${BLOCKER_LABELS[blocker]?.color || 'bg-slate-600 text-slate-300'}`}
                >
                  {BLOCKER_LABELS[blocker]?.label || blocker}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Next Action */}
        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">
            Next Action
          </h4>
          <div className="bg-slate-700/50 rounded p-3">
            <div className="text-white font-medium capitalize">
              {activation.next_action_type.replace(/_/g, ' ')}
            </div>
            <div className="text-slate-400 text-sm mt-1">
              Due: {formatDate(activation.next_action_due_at)}
            </div>
          </div>
        </div>
      </div>

      {/* Footer - Deep Link Button */}
      <div className="p-4 border-t border-slate-700">
        <a
          href={activation.deep_link}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          Open Activation Workspace
        </a>
      </div>
    </div>
  );
}


