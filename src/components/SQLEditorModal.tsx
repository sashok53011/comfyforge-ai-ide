import React, { useState } from 'react';
import { Database, Play, X, Table, CheckCircle2, Terminal, Upload, AlertTriangle } from 'lucide-react';
import { apiUrl } from '../api';
import { useT } from '../i18n';

interface QueryResult {
  columns: string[];
  rows: unknown[][];
  changes?: number;
  truncated?: boolean;
  durationMs?: number;
}

interface SQLEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodeTitle: string;
  dbState: { name: string; base64: string } | null;
  onDbChange: (base64: string, name: string) => void;
}

export const SQLEditorModal: React.FC<SQLEditorModalProps> = ({ isOpen, onClose, nodeTitle, dbState, onDbChange }) => {
  const tr = useT();
  const [query, setQuery] = useState('SELECT 1 + 1 AS one;');
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAttach = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      onDbChange(value, file.name);
      setResult(null);
      setError(null);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleExecute = async () => {
    if (!query.trim() || executing) return;
    setExecuting(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/sql/query'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, sqliteBase64: dbState?.base64 || '' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setResult(null);
        setError(data.error || `${tr('queryFailed')} (HTTP ${res.status}).`);
        return;
      }
      setResult({
        columns: data.columns || [],
        rows: data.rows || [],
        changes: data.changes,
        truncated: !!data.truncated,
        durationMs: data.durationMs,
      });
      if (typeof data.sqliteBase64 === 'string') {
        onDbChange(data.sqliteBase64, dbState?.name || 'scratch.db');
      }
    } catch (err: any) {
      setResult(null);
      setError(`${tr('networkError')}: ${err?.message || err}`);
    } finally {
      setExecuting(false);
    }
  };

  const isSelect = /^\s*(select|with|pragma|explain)/i.test(query);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
              <Database className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{tr('sqlEditorTitle', { node: nodeTitle })}</h2>
              <p className="text-xs text-slate-400">
                {tr('sqlEditorSub')} · {tr('databaseLabel')}: {dbState ? dbState.name : tr('scratchDb')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer transition-colors">
              <Upload className="w-3.5 h-3.5" />
              <span>{dbState ? tr('replaceDb') : tr('attachDb')}</span>
              <input type="file" accept=".sqlite,.sqlite3,.db,.db3,application/x-sqlite3" onChange={handleAttach} className="hidden" />
            </label>
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Query Input */}
        <div className="p-4 sm:p-6 space-y-4 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-indigo-400" />
              <span>{tr('sqlStatement')}</span>
            </label>
            <button
              onClick={handleExecute}
              disabled={executing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 ${executing ? 'animate-spin' : ''}`} />
              <span>{executing ? tr('runningQuery') : tr('runQuery')}</span>
            </button>
          </div>

          <textarea
            rows={4}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-indigo-200 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
            spellCheck={false}
          />
          <p className="text-[11px] text-slate-500">{isSelect ? tr('sqlSelectHint') : tr('sqlWriteHint')}</p>
        </div>

        {/* Results */}
        <div className="flex-1 p-4 sm:p-6 pb-24 lg:pb-6 overflow-y-auto space-y-3 bg-slate-950/40">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Table className="w-4 h-4 text-indigo-400" />
              <span>{tr('queryResult')}</span>
            </h3>
            {result && (
              <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {result.columns.length > 0
                  ? tr('rowsIn', { rows: result.rows.length, more: result.truncated ? '+' : '', ms: result.durationMs ?? 0 })
                  : tr('changesIn', { n: result.changes ?? 0, ms: result.durationMs ?? 0 })}
              </span>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-xl border border-red-500/40 bg-red-500/10 text-red-300 text-xs font-mono flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="whitespace-pre-wrap break-words">{error}</span>
            </div>
          )}

          {result && result.columns.length > 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-x-auto shadow-inner">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900 text-slate-300 font-mono">
                    {result.columns.map((col, i) => (
                      <th key={i} className="p-3 font-semibold">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-slate-200">
                  {result.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-900/40 transition-colors">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="p-3">
                          {cell === null ? <span className="text-slate-500">NULL</span> : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !error && (
              <div className="p-12 text-center text-slate-500 text-xs">
                {result ? tr('noRows') : tr('runQueryHint')}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
