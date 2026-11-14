import React from 'react';
import { ActiveView, Language } from '../types';
import { t } from '../i18n';
import { Layers, Code2, BookOpen, History, Cpu, Play, Sparkles, Moon, Sun, Download, Upload, Plus, Settings } from 'lucide-react';

interface NavbarProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  workflowName: string;
  onExecute: () => void;
  isExecuting: boolean;
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
  onOpenCopilot: () => void;
  onExportWorkflow: () => void;
  onImportWorkflow: () => void;
  onNewWorkflow: () => void;
  onOpenSettings: () => void;
  language: Language;
}

const MOBILE_TABS = [
  { key: 'canvas', labelKey: 'tabCanvas', Icon: Layers },
  { key: 'library', labelKey: 'tabRegistry', Icon: Cpu },
  { key: 'code', labelKey: 'tabCode', Icon: Code2 },
  { key: 'templates', labelKey: 'tabTemplates', Icon: BookOpen },
  { key: 'history', labelKey: 'tabHistory', Icon: History },
] as const;

export const Navbar: React.FC<NavbarProps> = ({
  activeView,
  setActiveView,
  workflowName,
  onExecute,
  isExecuting,
  isDarkMode,
  setIsDarkMode,
  onOpenCopilot,
  onExportWorkflow,
  onImportWorkflow,
  onNewWorkflow,
  onOpenSettings,
  language,
}) => {
  return (
    <>
    <header className="flex items-center justify-between gap-2 sm:gap-8 px-3 sm:px-6 h-16 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40">
      {/* Zone 1: Brand Wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-pink-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <Cpu className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
            ComfyForge <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-mono font-medium">v1.3</span>
          </h1>
          <p className="hidden sm:block text-xs text-slate-400 truncate max-w-[200px]">{workflowName}</p>
        </div>
      </div>

      {/* Zone 2: Navigation Links */}
      <nav className="hidden lg:flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800/80 text-sm font-medium text-slate-400">
        <button
          onClick={() => setActiveView('canvas')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all whitespace-nowrap shrink-0 ${
            activeView === 'canvas' ? 'bg-indigo-600 text-white shadow-sm' : 'hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>{t('canvasGraph', language)}</span>
        </button>

        <button
          onClick={() => setActiveView('library')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all whitespace-nowrap shrink-0 ${
            activeView === 'library' ? 'bg-indigo-600 text-white shadow-sm' : 'hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>{t('nodeRegistry', language)}</span>
        </button>

        <button
          onClick={() => setActiveView('code')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all whitespace-nowrap shrink-0 ${
            activeView === 'code' ? 'bg-indigo-600 text-white shadow-sm' : 'hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Code2 className="w-4 h-4" />
          <span>{t('pythonJsCode', language)}</span>
        </button>

        <button
          onClick={() => setActiveView('templates')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all whitespace-nowrap shrink-0 ${
            activeView === 'templates' ? 'bg-indigo-600 text-white shadow-sm' : 'hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>{t('templates', language)}</span>
        </button>

        <button
          onClick={() => setActiveView('history')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all whitespace-nowrap shrink-0 ${
            activeView === 'history' ? 'bg-indigo-600 text-white shadow-sm' : 'hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <History className="w-4 h-4" />
          <span>{t('history', language)}</span>
        </button>
      </nav>

      {/* Zone 3: Actions & Controls */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onNewWorkflow}
          title={t('newWorkflow', language)}
          className="hidden sm:inline-flex p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>

        <button
          onClick={onImportWorkflow}
          title={t('importWorkflow', language)}
          className="hidden sm:inline-flex p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <Upload className="w-4 h-4" />
        </button>

        <button
          onClick={onExportWorkflow}
          title={t('exportWorkflow', language)}
          className="hidden sm:inline-flex p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <Download className="w-4 h-4" />
        </button>

        <button
          onClick={onOpenSettings}
          title={t('settingsTitle', language)}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>

        <button
          onClick={onOpenCopilot}
          title={t('aiCopilot', language)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-semibold hover:from-violet-500 hover:to-indigo-500 shadow-lg shadow-indigo-500/25 transition-all whitespace-nowrap shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          <span className="hidden sm:inline">{t('aiCopilot', language)}</span>
        </button>

        <button
          onClick={onExecute}
          disabled={isExecuting}
          title={isExecuting ? t('executing', language) : t('queuePrompt', language)}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 shadow-lg shadow-emerald-600/25 transition-all disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <Play className={`w-3.5 h-3.5 ${isExecuting ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{isExecuting ? t('executing', language) : t('queuePrompt', language)}</span>
        </button>

        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>

    {/* Mobile bottom tab bar — phones and small tablets only */}
    <nav className="mobile-tabbar lg:hidden fixed bottom-0 inset-x-0 z-30 bg-slate-900/95 border-t border-slate-800 backdrop-blur-md grid grid-cols-5">
      {MOBILE_TABS.map(({ key, labelKey, Icon }) => (
        <button
          key={key}
          onClick={() => setActiveView(key)}
          aria-label={t(labelKey, language)}
          aria-current={activeView === key ? 'page' : undefined}
          className={`flex flex-col items-center justify-center gap-0.5 py-2 px-1 text-[10px] font-medium transition-colors ${
            activeView === key ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Icon className="w-5 h-5" />
          <span className="truncate max-w-full">{t(labelKey, language)}</span>
        </button>
      ))}
    </nav>
    </>
  );
};
