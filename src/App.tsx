import { useState, useEffect } from 'react';
import { ActiveView, ComfyNodeData, Workflow, Language, AIProviderConfig, DbTable } from './types';
import { DEFAULT_WORKFLOWS } from './data/templates';
import { Navbar } from './components/Navbar';
import { Canvas } from './components/Canvas';
import { NodeInspector } from './components/NodeInspector';
import { NodeLibraryModal } from './components/NodeLibraryModal';
import { CodeStudio } from './components/CodeStudio';
import { TemplatesModal } from './components/TemplatesModal';
import { AICopilot } from './components/AICopilot';
import { ConsolePanel } from './components/ConsolePanel';
import { HistoryView } from './components/HistoryView';
import { SettingsModal } from './components/SettingsModal';
import { AINodeConstructorModal } from './components/AINodeConstructorModal';
import { apiUrl } from './api';
import { LanguageContext } from './i18n';
import { AI_SETTINGS_KEY, COMFYUI_KEY, SHARED_AI_KEY, saveAiSettings } from './lib/aiSettings';
import { exportToComfyUi, importFromComfy } from './lib/comfyFormat';
import { addRun, clearRuns, loadRuns, makeRunId, removeRun, RunRecord } from './lib/runHistory';

/** The portal mirrors its shared AI config ({baseUrl, apiKey, model}) into SHARED_AI_KEY. */

const DEFAULT_AI_CONFIG: AIProviderConfig = {
  provider: 'openai_compatible',
  endpoint: 'https://ai.devhorizon.online',
  apiKey: '',
  llmModel: 'gpt-4o',
};

/** Own settings win; otherwise reuse the config injected by the portal's AI Settings. */
function loadAiConfig(): AIProviderConfig {
  try {
    const own = localStorage.getItem(AI_SETTINGS_KEY);
    if (own) return { ...DEFAULT_AI_CONFIG, ...JSON.parse(own) };

    const shared = localStorage.getItem(SHARED_AI_KEY);
    if (shared) {
      const cfg = JSON.parse(shared);
      if (cfg && cfg.baseUrl) {
        return {
          ...DEFAULT_AI_CONFIG,
          endpoint: cfg.baseUrl,
          apiKey: cfg.apiKey || '',
          llmModel: cfg.model || DEFAULT_AI_CONFIG.llmModel,
        };
      }
    }
  } catch {
    // Corrupted storage — fall back to the defaults below.
  }
  return DEFAULT_AI_CONFIG;
}

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('canvas');
  const [currentWorkflow, setCurrentWorkflow] = useState<Workflow>(DEFAULT_WORKFLOWS[1]); // Default to multi-format pipeline
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('comfyforge.theme');
      return saved === null ? true : saved === 'dark';
    } catch {
      return true;
    }
  });
  const [language, setLanguage] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('comfyforge.language');
      if (saved === 'ru' || saved === 'de' || saved === 'en') return saved;
    } catch {
      // storage blocked — fall back to English
    }
    return 'en';
  });
  const [aiConfig, setAiConfig] = useState<AIProviderConfig>(loadAiConfig);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);

  // ComfyUI server for real execution; an empty string switches to simulation.
  const [comfyuiUrl, setComfyuiUrlState] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(COMFYUI_KEY);
      return stored === null ? 'http://localhost:8188' : stored;
    } catch {
      return 'http://localhost:8188';
    }
  });

  // Result of the latest run (images / error / simulation flag).
  const [runResult, setRunResult] = useState<{ outputs: string[]; error: string | null; simulation: boolean } | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>(loadRuns);

  // Scratch SQLite database lives in memory: it is sent with every SQL request.
  const [dbState, setDbState] = useState<{ name: string; base64: string } | null>(null);
  const [dbTables, setDbTables] = useState<DbTable[]>([]);

  const updateComfyuiUrl = (url: string) => {
    const { comfyuiUrl: stored } = saveAiSettings(aiConfig, url);
    setComfyuiUrlState(stored);
  };

  /** Called by the SQL editor after each statement/attach; keeps schema in sync. */
  const handleDbChange = (base64: string, name: string) => {
    setDbState({ name, base64 });
    refreshSchema(base64);
  };

  const refreshSchema = async (base64: string | null) => {
    try {
      const res = await fetch(apiUrl('/api/sql/schema'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sqliteBase64: base64 || '' }),
      });
      const data = await res.json();
      setDbTables(res.ok && data.success && Array.isArray(data.tables) ? data.tables : []);
    } catch {
      setDbTables([]);
    }
  };
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAIConstructorOpen, setIsAIConstructorOpen] = useState(false);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionSteps, setExecutionSteps] = useState<{ progress: number; message: string }[]>([]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      localStorage.setItem('comfyforge.theme', isDarkMode ? 'dark' : 'light');
    } catch {
      // storage blocked — theme still applies for this session
    }
  }, [isDarkMode]);

  useEffect(() => {
    try {
      localStorage.setItem('comfyforge.language', language);
    } catch {
      // storage blocked — language still applies for this session
    }
  }, [language]);

  /** Persists only explicit edits from the settings modal (normalised + stored by saveAiSettings). */
  const updateAiConfig = (config: AIProviderConfig) => {
    const { aiConfig: stored } = saveAiSettings(config, comfyuiUrl);
    setAiConfig(stored);
  };

  const selectedNode = currentWorkflow.nodes.find((n) => n.id === selectedNodeId) || null;

  const handleUpdateNode = (updatedNode: ComfyNodeData) => {
    setCurrentWorkflow((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === updatedNode.id ? updatedNode : n)),
    }));
  };

  const handleDeleteNode = (id: string) => {
    setCurrentWorkflow((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== id),
      links: prev.links.filter((l) => l.fromNode !== id && l.toNode !== id),
    }));
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  const handleAddNode = (newNode: ComfyNodeData) => {
    setCurrentWorkflow((prev) => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
    }));
    setSelectedNodeId(newNode.id);
  };

  const recordRun = (patch: Omit<RunRecord, 'id' | 'workflowId' | 'workflowName' | 'at' | 'workflow'>) => {
    const record: RunRecord = {
      id: makeRunId(),
      workflowId: currentWorkflow.id,
      workflowName: currentWorkflow.name,
      at: new Date().toISOString(),
      workflow: currentWorkflow,
      ...patch,
    };
    setRuns(addRun(record));
  };

  const handleExecuteWorkflow = async () => {
    setIsExecuting(true);
    setIsConsoleOpen(true);
    setExecutionSteps([{ progress: 5, message: `Queueing "${currentWorkflow.name}" (${currentWorkflow.nodes.length} node(s))…` }]);
    setRunResult(null);
    const startedAt = Date.now();

    try {
      const res = await fetch(apiUrl("/api/workflow/execute"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow: currentWorkflow, comfyui: { baseUrl: comfyuiUrl } }),
      });
      const data = await res.json().catch(() => ({}));
      const durationMs = typeof data.durationMs === "number" ? data.durationMs : Date.now() - startedAt;
      const steps = Array.isArray(data.steps) ? data.steps : [];

      if (res.ok && data.success) {
        const simulation = !!data.simulation;
        setExecutionSteps(steps);
        setRunResult({ outputs: data.outputs || [], error: null, simulation });
        recordRun({
          status: simulation ? "simulation" : "success",
          mode: simulation ? "simulation" : "comfyui",
          promptId: data.promptId,
          outputs: data.outputs || [],
          durationMs,
        });
      } else {
        const message = data.error || `Execution failed (HTTP ${res.status}).`;
        setExecutionSteps([...steps, { progress: 100, message: `Failed: ${message}` }]);
        setRunResult({ outputs: [], error: message, simulation: false });
        recordRun({ status: "failed", mode: "comfyui", outputs: [], durationMs, error: message });
      }
    } catch (err: any) {
      const message = `Network error: ${err?.message || err}`;
      setExecutionSteps((prev) => [...prev, { progress: 100, message }]);
      setRunResult({ outputs: [], error: message, simulation: false });
      recordRun({ status: "failed", mode: "comfyui", outputs: [], durationMs: Date.now() - startedAt, error: message });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleRestoreRun = (run: RunRecord) => {
    setCurrentWorkflow(run.workflow);
    setSelectedNodeId(null);
    setActiveView("canvas");
  };

  const handleExportWorkflow = () => {
    const payload = exportToComfyUi(currentWorkflow);
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${currentWorkflow.name.replace(/\s+/g, '_')}_comfyui.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportWorkflow = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          const fallbackName = file.name.replace(/\.json$/i, '').replace(/_/g, ' ').slice(0, 60);
          const imported = importFromComfy(parsed, fallbackName);
          if (imported && imported.nodes.length > 0) {
            setCurrentWorkflow(imported);
            setSelectedNodeId(null);
            alert(`Imported ${imported.nodes.length} node(s) and ${imported.links.length} connection(s).`);
          } else {
            alert("Unsupported JSON: expected a ComfyUI workflow (Save or API format) or a ComfyForge export.");
          }
        } catch (err) {
          alert("Failed to parse JSON file.");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleNewWorkflow = () => {
    const newWf: Workflow = {
      id: "wf_" + Math.random().toString(36).substring(2, 9),
      name: "New Multi-Format Pipeline",
      description: "Blank canvas workflow supporting SQL, MDF, SQLite, scripts, and documents.",
      nodes: [],
      links: [],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };
    setCurrentWorkflow(newWf);
    setSelectedNodeId(null);
  };

  return (
    <LanguageContext.Provider value={language}>
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar
        activeView={activeView}
        setActiveView={setActiveView}
        workflowName={currentWorkflow.name}
        onExecute={handleExecuteWorkflow}
        isExecuting={isExecuting}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        onOpenCopilot={() => setIsCopilotOpen(!isCopilotOpen)}
        onExportWorkflow={handleExportWorkflow}
        onImportWorkflow={handleImportWorkflow}
        onNewWorkflow={handleNewWorkflow}
        onOpenSettings={() => setIsSettingsOpen(true)}
        language={language}
      />

      <div className="flex-1 flex overflow-hidden relative">
        <main className="flex-1 flex overflow-hidden">
          {activeView === 'canvas' && (
            <>
              <div className="flex-1 relative">
                <Canvas
                  nodes={currentWorkflow.nodes}
                  links={currentWorkflow.links}
                  setNodes={(updater) =>
                    setCurrentWorkflow((prev) => ({
                      ...prev,
                      nodes: typeof updater === 'function' ? updater(prev.nodes) : updater,
                    }))
                  }
                  setLinks={(updater) =>
                    setCurrentWorkflow((prev) => ({
                      ...prev,
                      links: typeof updater === 'function' ? updater(prev.links) : updater,
                    }))
                  }
                  selectedNodeId={selectedNodeId}
                  setSelectedNodeId={setSelectedNodeId}
                  onAddNodeModal={() => setIsLibraryOpen(true)}
                  onOpenAIConstructor={() => setIsAIConstructorOpen(true)}
                  aiConfig={aiConfig}
                />
              </div>
              <NodeInspector
                selectedNode={selectedNode}
                onUpdateNode={handleUpdateNode}
                onDeleteNode={handleDeleteNode}
                onClose={() => setSelectedNodeId(null)}
                workflow={currentWorkflow}
                dbTables={dbTables}
                dbState={dbState}
                onDbChange={handleDbChange}
              />
            </>
          )}

          {activeView === 'library' && (
            <div className="flex-1 p-4 sm:p-8 pb-24 lg:pb-8 overflow-y-auto">
              <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white">ComfyUI Node & Multi-Format Registry</h2>
                    <p className="text-xs text-slate-400 mt-1">Support for sql, .mdf/.ndf/.ldf, sqlite, db, dbm, bat, sh, py, ps1, cmd, text, md, json, csv</p>
                  </div>
                  <button
                    onClick={() => setIsLibraryOpen(true)}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow"
                  >
                    + Add Node to Canvas
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeView === 'code' && <CodeStudio />}
          {activeView === 'templates' && (
            <div className="flex-1 p-4 sm:p-8 pb-24 lg:pb-8 overflow-y-auto">
              <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white">Workflow Templates</h2>
                    <p className="text-xs text-slate-400 mt-1">Load production-tested diffusion & multi-format database pipelines</p>
                  </div>
                  <button
                    onClick={() => setIsTemplatesOpen(true)}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow"
                  >
                    Open Templates Library
                  </button>
                </div>
              </div>
            </div>
          )}
          {activeView === 'history' && (
            <HistoryView
              runs={runs}
              onRestore={handleRestoreRun}
              onRemove={(id) => setRuns(removeRun(id))}
              onClear={() => setRuns(clearRuns())}
            />
          )}
        </main>

        <AICopilot
          isOpen={isCopilotOpen}
          onClose={() => setIsCopilotOpen(false)}
          workflowContext={{ nodes: currentWorkflow.nodes, links: currentWorkflow.links }}
          onAddGeneratedNode={handleAddNode}
          aiConfig={aiConfig}
        />

        <ConsolePanel
          isOpen={isConsoleOpen}
          onClose={() => setIsConsoleOpen(false)}
          isExecuting={isExecuting}
          executionSteps={executionSteps}
          outputs={runResult?.outputs ?? []}
          error={runResult?.error ?? null}
          simulation={runResult?.simulation ?? false}
        />
      </div>

      <NodeLibraryModal
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        onAddNode={handleAddNode}
      />

      <TemplatesModal
        isOpen={isTemplatesOpen}
        onClose={() => setIsTemplatesOpen(false)}
        onSelectTemplate={(wf) => {
          setCurrentWorkflow(wf);
          setActiveView('canvas');
        }}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        language={language}
        setLanguage={setLanguage}
        aiConfig={aiConfig}
        setAiConfig={updateAiConfig}
        comfyuiUrl={comfyuiUrl}
        setComfyuiUrl={updateComfyuiUrl}
      />

      <AINodeConstructorModal
        isOpen={isAIConstructorOpen}
        onClose={() => setIsAIConstructorOpen(false)}
        onAddNode={handleAddNode}
        aiConfig={aiConfig}
      />
    </div>
    </LanguageContext.Provider>
  );
}
