import React from 'react';
import { History, CheckCircle2, Clock, ArrowUpRight, Trash2, AlertTriangle, Layers } from 'lucide-react';
import { RunRecord, formatDuration, formatWhen } from '../lib/runHistory';
import { useT } from '../i18n';

interface HistoryViewProps {
  runs: RunRecord[];
  onRestore: (run: RunRecord) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

const STATUS_STYLES: Record<RunRecord['status'], { labelKey: string; className: string; Icon: typeof CheckCircle2 }> = {
  success: {
    labelKey: 'statusSuccess',
    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    Icon: CheckCircle2,
  },
  failed: {
    labelKey: 'statusFailed',
    className: 'bg-red-500/10 text-red-400 border-red-500/30',
    Icon: AlertTriangle,
  },
  simulation: {
    labelKey: 'statusSimulation',
    className: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    Icon: Layers,
  },
};

export const HistoryView: React.FC<HistoryViewProps> = ({ runs, onRestore, onRemove, onClear }) => {
  const tr = useT();

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-950 p-4 sm:p-8 pb-24 lg:pb-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-400" />
              <span>{tr('history')}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">{tr('historySub')}</p>
          </div>
          {runs.length > 0 && (
            <button
              onClick={onClear}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-red-950 border border-slate-700 hover:border-red-700 text-xs font-semibold text-slate-300 hover:text-red-300 transition-colors"
            >
              {tr('clearAll')}
            </button>
          )}
        </div>

        {runs.length === 0 ? (
          <div className="p-12 rounded-xl border border-dashed border-slate-800 text-center text-slate-500 text-sm">
            {tr('noRunsYet', { queue: tr('queuePrompt') })}
          </div>
        ) : (
          <div className="space-y-3">
            {runs.map((run) => {
              const status = STATUS_STYLES[run.status] || STATUS_STYLES.simulation;
              const StatusIcon = status.Icon;
              return (
                <div
                  key={run.id}
                  className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex items-start justify-between gap-4 shadow-lg hover:border-indigo-500/50 transition-all"
                >
                  <div className="flex gap-4 min-w-0">
                    {run.outputs[0] ? (
                      <img
                        src={run.outputs[0]}
                        alt=""
                        loading="lazy"
                        className="w-16 h-16 rounded-lg object-cover border border-slate-800 shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg border border-slate-800 bg-slate-950 flex items-center justify-center shrink-0">
                        <StatusIcon className="w-5 h-5 opacity-60" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white truncate">{run.workflowName}</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border flex items-center gap-1 ${status.className}`}>
                          <StatusIcon className="w-3 h-3" /> {tr(status.labelKey)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 font-mono flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> {formatWhen(run.at)}
                        </span>
                        <span>·</span>
                        <span>{formatDuration(run.durationMs)}</span>
                        <span>·</span>
                        <span>{run.workflow.nodes.length} nodes</span>
                        {run.promptId && (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-[140px]">{run.promptId.slice(0, 13)}…</span>
                          </>
                        )}
                        {run.outputs.length > 0 && (
                          <>
                            <span>·</span>
                            <span>{tr('imageCount', { n: run.outputs.length })}</span>
                          </>
                        )}
                      </div>
                      {run.error && (
                        <div className="mt-1.5 text-[11px] font-mono text-red-400 break-words line-clamp-2">{run.error}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => onRestore(run)}
                      title="Load this workflow snapshot back onto the canvas"
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all border border-slate-700"
                    >
                      <span>{tr('restore')}</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onRemove(run.id)}
                      title={tr('removeEntry')}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-red-950 border border-slate-700 hover:border-red-700 text-slate-400 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
