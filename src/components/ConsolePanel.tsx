import React from 'react';
import { Terminal, CheckCircle2, Loader2, X, Image as ImageIcon } from 'lucide-react';
import { useT } from '../i18n';

interface ConsolePanelProps {
  isOpen: boolean;
  onClose: () => void;
  isExecuting: boolean;
  executionSteps: { progress: number; message: string }[];
  outputs: string[];
  error: string | null;
  simulation: boolean;
}

export const ConsolePanel: React.FC<ConsolePanelProps> = ({
  isOpen,
  onClose,
  isExecuting,
  executionSteps,
  outputs,
  error,
  simulation,
}) => {
  const tr = useT();
  if (!isOpen) return null;

  return (
    <div className="absolute bottom-14 lg:bottom-0 left-0 right-0 z-40 bg-slate-900/95 border-t border-slate-800 p-3 sm:p-4 shadow-2xl backdrop-blur-xl max-h-72 flex flex-col">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <Terminal className="w-4 h-4 text-indigo-400" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">{tr('consoleTitle')}</h3>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
              isExecuting
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-300 animate-pulse'
                : 'border-slate-700 bg-slate-800 text-slate-400'
            }`}
          >
            {isExecuting ? tr('running') : tr('idle')}
          </span>
        </div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 flex-1 overflow-hidden">
        {/* Logs */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-[11px] overflow-y-auto space-y-2">
          {executionSteps.length === 0 ? (
            <div className="text-slate-500">{tr('emptyQueue')}</div>
          ) : (
            executionSteps.map((step, idx) => (
              <div key={idx} className="flex items-center gap-2 text-slate-300">
                {step.progress === 100 ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin shrink-0" />
                )}
                <span>[{step.progress}%] {step.message}</span>
              </div>
            ))
          )}
        </div>

        {/* Output Preview */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-center relative overflow-hidden">
          {outputs.length > 0 ? (
            <div className="w-full h-full overflow-y-auto space-y-2">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span>{tr('comfyOutput', { n: outputs.length })}</span>
                <a
                  href={outputs[0]}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2 py-0.5 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-500"
                >
                  {tr('openFirst')}
                </a>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {outputs.slice(0, 4).map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className="block group">
                    <img
                      src={url}
                      alt={`Output ${i + 1}`}
                      loading="lazy"
                      className="w-full h-28 object-cover rounded-lg border border-slate-800 group-hover:border-indigo-500 transition-colors"
                    />
                  </a>
                ))}
              </div>
              {outputs.length > 4 && (
                <div className="text-[10px] text-slate-500 text-center">{tr('moreImages', { n: outputs.length - 4 })}</div>
              )}
            </div>
          ) : error ? (
            <div className="w-full">
              <div className="text-[10px] font-mono uppercase tracking-wider text-red-400 mb-1.5">{tr('executionFailed')}</div>
              <pre className="text-[11px] font-mono text-red-300 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">{error}</pre>
            </div>
          ) : simulation ? (
            <div className="text-center px-3">
              <div className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 inline-block mb-2">
                {tr('simulationBadge')}
              </div>
              <p className="text-xs text-slate-400">{tr('simulationText')}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-500 text-center">
              <ImageIcon className="w-8 h-8 mb-2 opacity-30" />
              <span className="text-xs">{tr('outputsHere')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
