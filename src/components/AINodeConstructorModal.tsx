import React, { useState } from 'react';
import { Sparkles, X, Plus, Loader2 } from 'lucide-react';
import { useT } from '../i18n';
import { ComfyNodeData, AIProviderConfig } from '../types';
import { apiUrl } from '../api';

interface AINodeConstructorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddNode: (node: ComfyNodeData) => void;
  aiConfig: AIProviderConfig;
}

export const AINodeConstructorModal: React.FC<AINodeConstructorModalProps> = ({
  isOpen,
  onClose,
  onAddNode,
  aiConfig,
}) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const tr = useT();

  if (!isOpen) return null;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || loading) return;

    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/copilot/generate-node'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, providerConfig: aiConfig }),
      });
      const data = await res.json();
      if (data.success && data.node) {
        setResult(data.node);
      } else {
        alert("Failed to generate node from AI constructor.");
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCanvas = () => {
    if (!result) return;
    const newNode: ComfyNodeData = {
      id: 'node_' + Math.random().toString(36).substring(2, 9),
      type: result.name.replace(/\s+/g, ''),
      title: result.name,
      category: 'custom',
      style: 'neon',
      position: { x: 250 + Math.random() * 100, y: 200 + Math.random() * 100 },
      size: { width: 320, height: 220 },
      inputs: (result.inputs || []).map((i: any) => ({ name: i.name, type: i.type })),
      outputs: (result.outputs || []).map((o: any) => ({ name: o.name, type: o.type })),
      widgets: (result.inputs || []).map((i: any) => ({
        name: i.name,
        type: i.type === 'INT' ? 'INT' : i.type === 'FLOAT' ? 'FLOAT' : 'STRING',
        value: i.default || 'default',
      })),
      customCode: result.pythonCode,
    };
    onAddNode(newNode);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{tr('constructorTitle')}</h2>
              <p className="text-xs text-slate-400">{tr('constructorSub')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleGenerate} className="p-4 sm:p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 mb-1.5 block">{tr('promptLabel')}</label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={tr('constructorPlaceholder')}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none font-medium leading-relaxed"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 disabled:opacity-50 transition-all"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{loading ? tr('generating') : tr('generateNode')}</span>
            </button>
          </div>
        </form>

        {result && (
          <div className="p-4 sm:p-6 pb-24 lg:pb-6 border-t border-slate-800 bg-slate-950/60 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">{result.name}</h3>
                <p className="text-xs text-slate-400">{result.description}</p>
              </div>
              <button
                onClick={handleAddToCanvas}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20"
              >
                <Plus className="w-4 h-4" />
                <span>{tr('addToCanvas')}</span>
              </button>
            </div>
            <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[10px] text-indigo-300 overflow-x-auto max-h-36">
              {result.pythonCode}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
