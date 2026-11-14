import React from 'react';
import { ComfyNodeData } from '../types';
import { Eye, FileText, Database } from 'lucide-react';
import { useT } from '../i18n';

interface MiniPreviewProps {
  selectedNode: ComfyNodeData | null;
}

/** Describes what flows out of this node — honestly: nothing renders until a real run. */
export const MiniPreview: React.FC<MiniPreviewProps> = ({ selectedNode }) => {
  const tr = useT();
  if (!selectedNode) return null;

  const hasImageOutput = selectedNode.outputs.some((o) => o.type === 'IMAGE');
  const hasSqlOutput = selectedNode.outputs.some((o) => o.type === 'SQL') || selectedNode.category === 'database';
  const hasDataOutput = selectedNode.outputs.some((o) => o.type === 'DATA') || selectedNode.category === 'documents' || selectedNode.category === 'scripts';

  const portLine = (name: string, type: string) => (
    <div className="text-[10px] text-slate-400">
      {tr('portPrefix')}: {name} → {type}
    </div>
  );

  return (
    <div className="space-y-3 pt-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <Eye className="w-3.5 h-3.5 text-indigo-400" />
          <span>{tr('miniPreview')}</span>
        </h3>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400">{tr('liveSnapshot')}</span>
      </div>

      <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 overflow-hidden shadow-inner space-y-2">
        {hasImageOutput ? (
          <div className="space-y-2 text-center">
            <div className="rounded-lg border border-dashed border-slate-700 p-4 text-[11px] text-slate-400 leading-relaxed">
              {tr('imagePort')}
            </div>
            {selectedNode.outputs
              .filter((o) => o.type === 'IMAGE')
              .map((o) => (
                <div key={o.name}>{portLine(o.name, o.type)}</div>
              ))}
          </div>
        ) : hasSqlOutput ? (
          <div className="space-y-2 font-mono text-[11px]">
            <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold">
              <Database className="w-3.5 h-3.5" />
              <span>SQL / database</span>
            </div>
            <div className="p-2 rounded bg-slate-900 border border-slate-800 text-slate-400 text-[10px] leading-relaxed">
              {tr('sqlPort')}
            </div>
            {selectedNode.outputs.map((o) => (
              <div key={o.name}>{portLine(o.name, o.type)}</div>
            ))}
          </div>
        ) : hasDataOutput ? (
          <div className="space-y-2 font-mono text-[11px]">
            <div className="flex items-center gap-1.5 text-indigo-400 text-xs font-bold">
              <FileText className="w-3.5 h-3.5" />
              <span>Data / script</span>
            </div>
            <div className="p-2 rounded bg-slate-900 border border-slate-800 text-slate-400 text-[10px] leading-relaxed">
              {tr('dataPort')}
            </div>
            {selectedNode.outputs.map((o) => (
              <div key={o.name}>{portLine(o.name, o.type)}</div>
            ))}
          </div>
        ) : (
          <div className="p-4 text-center text-slate-500 text-xs font-mono leading-relaxed">{tr('modelPort')}</div>
        )}
      </div>
    </div>
  );
};
