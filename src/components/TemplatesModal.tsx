import React from 'react';
import { Workflow } from '../types';
import { DEFAULT_WORKFLOWS } from '../data/templates';
import { BookOpen, ArrowRight, X, Cpu } from 'lucide-react';
import { useT } from '../i18n';

interface TemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (workflow: Workflow) => void;
}

export const TemplatesModal: React.FC<TemplatesModalProps> = ({ isOpen, onClose, onSelectTemplate }) => {
  const tr = useT();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-400" />
              <span>{tr('templatesTitle')}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{tr('templatesSub')}</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 p-4 sm:p-6 pb-24 lg:pb-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          {DEFAULT_WORKFLOWS.map((wf) => (
            <div
              key={wf.id}
              className="p-5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-indigo-500/50 transition-all flex flex-col justify-between group"
            >
              <div>
                <h3 className="text-sm font-bold text-white group-hover:text-indigo-400 transition-colors mb-1.5">
                  {wf.name}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">{wf.description}</p>
                <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
                  <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{tr('nodesCount', { n: wf.nodes.length })}</span>
                  <span>·</span>
                  <span>{tr('linksCount', { n: wf.links.length })}</span>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800/80 flex justify-end">
                <button
                  onClick={() => {
                    onSelectTemplate(wf);
                    onClose();
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all"
                >
                  <span>{tr('loadTemplate')}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
