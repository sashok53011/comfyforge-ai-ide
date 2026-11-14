import React, { useEffect, useState } from 'react';
import { Code2, Play, Terminal, FileCode } from 'lucide-react';
import { apiUrl } from '../api';
import { useT } from '../i18n';

const STORAGE_KEY = 'comfyforge.codestudio';

const DEFAULT_PYTHON = `class CustomFaceRestoreNode:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",),
                "fidelity": ("FLOAT", {"default": 0.6, "min": 0.0, "max": 1.0, "step": 0.05}),
                "upscale_factor": ("INT", {"default": 2, "min": 1, "max": 4})
            }
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "restore_faces"
    CATEGORY = "ComfyForge/Enhancers"

    def restore_faces(self, image, fidelity, upscale_factor):
        print(f"Executing CodeFormer face restoration with fidelity {fidelity}")
        return (image * upscale_factor,)
`;

function loadSaved(): { language: 'python' | 'javascript'; code: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.code === 'string') return parsed;
  } catch {
    // corrupted storage — fall back to defaults
  }
  return null;
}

export const CodeStudio: React.FC = () => {
  const tr = useT();
  const saved = loadSaved();
  const [language, setLanguage] = useState<'python' | 'javascript'>(saved?.language || 'python');
  const [code, setCode] = useState<string>(saved?.code || DEFAULT_PYTHON);
  const [outputLog, setOutputLog] = useState<string>(tr('readyLog'));
  const [isTesting, setIsTesting] = useState(false);

  // Keep the snippet between reloads.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ language, code }));
    } catch {
      // storage blocked — the snippet still works for this session
    }
  }, [language, code]);

  const handleTestCompile = async () => {
    setIsTesting(true);
    setOutputLog(
      language === 'python'
        ? '$ python -m py_compile snippet.py\nRunning…'
        : '$ node --check snippet.mjs\nRunning…'
    );
    try {
      const res = await fetch(apiUrl('/api/code/validate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setOutputLog(`[OK] ${data.message}\n\n${tr('checkedLines', { n: code.split('\n').length, bytes: code.length })}`);
      } else {
        setOutputLog(`[ERROR]\n${data.error || data.message || `Validation failed (HTTP ${res.status}).`}`);
      }
    } catch (err: any) {
      setOutputLog(`[ERROR] Network error: ${err?.message || err}`);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-950 p-4 sm:p-6 pb-20 lg:pb-6 overflow-hidden">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Code2 className="w-5 h-5 text-indigo-400" />
            <span>{tr('codeStudioTitle')}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">{tr('codeStudioSub')}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl">
            <button
              onClick={() => {
                setLanguage('python');
                setCode(`class CustomFaceRestoreNode:\n    @classmethod\n    def INPUT_TYPES(s):\n        return {"required": {"image": ("IMAGE",)}}\n    RETURN_TYPES = ("IMAGE",)\n    FUNCTION = "execute"\n    def execute(self, image):\n        return (image,)`);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                language === 'python' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {tr('pythonTab')}
            </button>
            <button
              onClick={() => {
                setLanguage('javascript');
                setCode(`import { app } from "../../scripts/app.js";\n\napp.registerExtension({\n    name: "ComfyForge.CustomWidget",\n    async beforeRegisterNodeDef(nodeType, nodeData, app) {\n        console.log("Registered custom extension widget:", nodeData.name);\n    }\n});`);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                language === 'javascript' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {tr('jsTab')}
            </button>
          </div>

          <button
            onClick={handleTestCompile}
            disabled={isTesting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50"
          >
            <Play className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
            <span>{isTesting ? tr('compiling') : tr('testCompile')}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 pt-6 overflow-hidden">
        {/* Editor Pane */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 bg-slate-950/60 border-b border-slate-800 text-xs font-mono text-slate-400">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-indigo-400" />
              <span>extensions/custom_nodes/node_sandbox.{language === 'python' ? 'py' : 'js'}</span>
            </div>
            <span>UTF-8</span>
          </div>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="flex-1 bg-transparent p-4 font-mono text-xs text-indigo-200 focus:outline-none resize-none leading-relaxed"
            spellCheck={false}
          />
        </div>

        {/* Terminal / Output Pane */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 bg-slate-950/60 border-b border-slate-800 text-xs font-mono text-slate-400">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span>{tr('compilationLog')}</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <pre className="flex-1 p-4 font-mono text-[11px] text-emerald-300 bg-slate-950 overflow-y-auto leading-relaxed whitespace-pre-wrap">
            {outputLog}
          </pre>
        </div>
      </div>
    </div>
  );
};
