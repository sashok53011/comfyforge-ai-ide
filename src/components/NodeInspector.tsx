import React, { useState } from 'react';
import { ComfyNodeData, DbTable, Workflow } from '../types';
import { Settings, Code, Trash2, Cpu } from 'lucide-react';
import { SchemaVisualizer } from './SchemaVisualizer';
import { SQLEditorModal } from './SQLEditorModal';
import { MiniPreview } from './MiniPreview';
import { useT } from '../i18n';

interface NodeInspectorProps {
  selectedNode: ComfyNodeData | null;
  onUpdateNode: (updatedNode: ComfyNodeData) => void;
  onDeleteNode: (id: string) => void;
  onClose: () => void;
  workflow: Workflow;
  dbTables: DbTable[];
  dbState: { name: string; base64: string } | null;
  onDbChange: (base64: string, name: string) => void;
}

export const NodeInspector: React.FC<NodeInspectorProps> = ({
  selectedNode,
  onUpdateNode,
  onDeleteNode,
  onClose,
  workflow,
  dbTables,
  dbState,
  onDbChange,
}) => {
  const [isSQLEditorOpen, setIsSQLEditorOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const tr = useT();

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(selectedNode?.customCode || '');
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1500);
    } catch {
      setCopiedCode(false);
    }
  };

  if (!selectedNode) {
    return (
      <div className="hidden lg:flex w-80 border-l border-slate-800 bg-slate-900/90 p-6 flex-col items-center justify-center text-center text-slate-500">
        <Cpu className="w-10 h-10 mb-3 opacity-40 animate-pulse" />
        <h3 className="text-sm font-semibold text-slate-300">{tr('noNodeSelected')}</h3>
        <p className="text-xs text-slate-500 mt-1">{tr('selectNodeHint')}</p>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-x-0 top-16 bottom-14 z-40 border-l border-slate-800 bg-slate-900/95 p-4 sm:p-5 flex flex-col overflow-y-auto lg:static lg:z-auto lg:w-80 lg:p-5 lg:h-[calc(100vh-4rem)]">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-bold text-white">Node Inspector</h2>
          </div>
          <button onClick={onClose} className="text-xs text-slate-400 hover:text-white">
            {tr('close')}
          </button>
        </div>

        <div className="space-y-5 pt-4">
          <div>
            <label className="text-[10px] font-mono uppercase text-slate-400 tracking-wider">{tr('nodeTitle')}</label>
            <input
              type="text"
              value={selectedNode.title}
              onChange={(e) => onUpdateNode({ ...selectedNode, title: e.target.value })}
              className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
            />
          </div>

          <div>
            <label className="text-[10px] font-mono uppercase text-slate-400 tracking-wider">{tr('classType')}</label>
            <div className="mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-indigo-400">
              {selectedNode.type}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-mono uppercase text-slate-400 tracking-wider">{tr('nodeStyle')}</label>
            <select
              value={selectedNode.style}
              onChange={(e) => onUpdateNode({ ...selectedNode, style: e.target.value as any })}
              className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="classic">Classic Comfy (Standard Python)</option>
              <option value="neon">Neon UI (Custom Widget)</option>
              <option value="opensource">OpenSource Wrapper</option>
              <option value="compiled">Compiled Wasm / C++ Node</option>
            </select>
          </div>

          {/* Mini-Preview Component */}
          <MiniPreview selectedNode={selectedNode} />

          {/* D3 graph of this workflow's data nodes + tables from the attached database */}
          <SchemaVisualizer
            selectedNode={selectedNode}
            workflow={workflow}
            dbTables={dbTables}
            onOpenSQLEditor={() => setIsSQLEditorOpen(true)}
          />

          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Code className="w-3.5 h-3.5 text-indigo-400" />
              <span>{tr('widgetsParams')}</span>
            </h3>
            {selectedNode.widgets.map((widget, idx) => (
              <div key={idx} className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5">
                <div className="flex justify-between text-xs text-slate-300">
                  <span className="font-medium">{widget.name}</span>
                  <span className="font-mono text-indigo-400">{widget.value}</span>
                </div>
                {widget.type === 'COMBO' ? (
                  <select
                    value={widget.value}
                    onChange={(e) => {
                      const newWidgets = [...selectedNode.widgets];
                      newWidgets[idx].value = e.target.value;
                      onUpdateNode({ ...selectedNode, widgets: newWidgets });
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                  >
                    {widget.options?.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : widget.type === 'STRING' ? (
                  <textarea
                    rows={3}
                    value={widget.value}
                    onChange={(e) => {
                      const newWidgets = [...selectedNode.widgets];
                      newWidgets[idx].value = e.target.value;
                      onUpdateNode({ ...selectedNode, widgets: newWidgets });
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-200 resize-none font-mono"
                  />
                ) : (
                  <input
                    type="number"
                    value={widget.value}
                    onChange={(e) => {
                      const newWidgets = [...selectedNode.widgets];
                      newWidgets[idx].value = parseFloat(e.target.value);
                      onUpdateNode({ ...selectedNode, widgets: newWidgets });
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono"
                  />
                )}
              </div>
            ))}
          </div>

          <div>
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">{tr('jsonSpec')}</h3>
            <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[10px] text-indigo-300 overflow-x-auto max-h-48">
              {JSON.stringify(
                {
                  class_type: selectedNode.type,
                  inputs: selectedNode.widgets.reduce((acc: any, w) => {
                    acc[w.name] = w.value;
                    return acc;
                  }, {}),
                },
                null,
                2
              )}
            </pre>
          </div>

          {selectedNode.customCode ? (
            <div>
              <div className="flex items-center justify-between mb-2 gap-2">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">{tr('customCode')}</h3>
                <button
                  onClick={handleCopyCode}
                  className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-semibold text-slate-200 transition-colors shrink-0"
                >
                  {copiedCode ? tr('copied') : tr('copy')}
                </button>
              </div>
              <pre className="p-3 rounded-lg bg-slate-950 border border-emerald-800/50 font-mono text-[10px] text-emerald-300 overflow-x-auto max-h-64 whitespace-pre-wrap">
                {selectedNode.customCode}
              </pre>
              <p className="text-[10px] text-slate-500 mt-1">{tr('customCodeHint')}</p>
            </div>
          ) : null}

          <button
            onClick={() => onDeleteNode(selectedNode.id)}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{tr('deleteNode')}</span>
          </button>
        </div>
      </div>

      <SQLEditorModal
        isOpen={isSQLEditorOpen}
        onClose={() => setIsSQLEditorOpen(false)}
        nodeTitle={selectedNode.title}
        dbState={dbState}
        onDbChange={onDbChange}
      />
    </>
  );
};
