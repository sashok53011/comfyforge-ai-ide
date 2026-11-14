import React, { useEffect, useRef, useState } from 'react';
import { AIProviderConfig, Language } from '../types';
import { t } from '../i18n';
import { Settings, Globe, Cpu, X, Check, Server, List, PlugZap, Loader2, Smartphone } from 'lucide-react';
import {
  fetchModelList,
  loadModelCache,
  localSettingsOverridePortal,
  saveModelCache,
  testAiConnection,
  validateAiConfig,
} from '../lib/aiSettings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  aiConfig: AIProviderConfig;
  setAiConfig: (config: AIProviderConfig) => void;
  comfyuiUrl: string;
  setComfyuiUrl: (url: string) => void;
}

interface StatusState {
  loading: boolean;
  message: string | null;
  error: boolean;
}

const IDLE: StatusState = { loading: false, message: null, error: false };

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  language,
  setLanguage,
  aiConfig,
  setAiConfig,
  comfyuiUrl,
  setComfyuiUrl,
}) => {
  const [config, setConfig] = useState<AIProviderConfig>(aiConfig);
  const [comfyUrl, setComfyUrl] = useState(comfyuiUrl);
  const [saved, setSaved] = useState(false);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [fetchState, setFetchState] = useState<StatusState>(IDLE);
  const [testState, setTestState] = useState<StatusState>(IDLE);
  const [validation, setValidation] = useState<string[]>([]);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const wasOpenRef = useRef(false);

  // Re-sync from the live values only on the closed → open transition: doing it
  // whenever aiConfig changes would wipe the "Saved ✓" confirmation right away.
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setConfig(aiConfig);
      setComfyUrl(comfyuiUrl);
      setModelOptions(loadModelCache(aiConfig));
      setSaved(false);
      setValidation([]);
      setSaveNote(null);
      setFetchState(IDLE);
      setTestState(IDLE);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, aiConfig, comfyuiUrl]);

  if (!isOpen) return null;

  /* ------------------------------------------------------------- actions */

  const handleFetchModels = async () => {
    setFetchState({ loading: true, message: t('fetchingModels', language), error: false });
    try {
      const { models } = await fetchModelList(config);
      setModelOptions(models);
      saveModelCache(config, models);
      setFetchState({ loading: false, message: t('modelsFound', language, { n: models.length }), error: false });
    } catch (err: any) {
      setFetchState({
        loading: false,
        message: t('modelsError', language, { msg: err?.message || 'unknown error' }),
        error: true,
      });
    }
  };

  const handleTest = async () => {
    // Endpoint/key/model must be valid before a test makes sense.
    const errors = validateAiConfig(config, comfyUrl).filter((e) => e !== 'invalidComfyUrl');
    setValidation(errors);
    if (errors.length) return;

    setTestState({ loading: true, message: t('testingConnection', language), error: false });
    try {
      const { latencyMs } = await testAiConnection(config);
      setTestState({ loading: false, message: t('testOk', language, { ms: latencyMs }), error: false });
    } catch (err: any) {
      setTestState({
        loading: false,
        message: `${t('testFailed', language)}: ${err?.message || 'unknown error'}`,
        error: true,
      });
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateAiConfig(config, comfyUrl);
    setValidation(errors);
    if (errors.length) return; // stay open and show the reasons

    setAiConfig(config); // App → saveAiSettings(): normalise + persist both keys
    setComfyuiUrl(comfyUrl.trim());
    setSaved(true);
    setSaveNote(t('settingsStored', language, { key: 'comfyforge.settings.ai' }));
    setTimeout(() => setSaved(false), 1500);
  };

  const statusClass = (state: StatusState) =>
    `text-[11px] ${state.error ? 'text-red-400' : 'text-slate-400'}`;

  /* --------------------------------------------------------------- render */

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
              <Settings className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{t('settings', language)}</h2>
              <p className="text-xs text-slate-400">Language &amp; AI Provider Configuration</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 sm:p-6 space-y-5 sm:space-y-6 overflow-y-auto">
          {/* Language Selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-2">
              <Globe className="w-4 h-4 text-indigo-400" />
              <span>{t('languageLabel', language)}</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { code: 'en', label: 'English' },
                { code: 'ru', label: 'Русский' },
                { code: 'de', label: 'Deutsch' },
              ].map((lang) => (
                <button
                  type="button"
                  key={lang.code}
                  onClick={() => setLanguage(lang.code as Language)}
                  className={`py-2.5 rounded-xl text-xs font-medium border transition-all ${
                    language === lang.code
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-500/25'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>

          {/* AI Provider Config */}
          <div className="space-y-4 pt-4 border-t border-slate-800">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-400" />
              <span>{t('aiProviderConfig', language)}</span>
            </label>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-slate-400">{t('providerType', language)}</label>
                <select
                  value={config.provider}
                  onChange={(e) => {
                    const provider = e.target.value as AIProviderConfig['provider'];
                    // Keys are provider-specific: drop the old one instead of
                    // silently sending an OpenAI key to Google (or vice versa).
                    setConfig({ ...config, provider, apiKey: provider === config.provider ? config.apiKey : '' });
                    setFetchState(IDLE);
                    setTestState(IDLE);
                  }}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="gemini">Google Gemini (native)</option>
                  <option value="openai_compatible">OpenAI-Compatible Endpoint</option>
                </select>
              </div>

              {config.provider === 'openai_compatible' && (
                <>
                  <div>
                    <label className="text-[11px] text-slate-400">{t('openaiEndpoint', language)}</label>
                    <input
                      type="text"
                      value={config.endpoint}
                      onChange={(e) => {
                        setConfig({ ...config, endpoint: e.target.value });
                        setFetchState(IDLE);
                      }}
                      placeholder="https://api.openai.com/v1"
                      className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400">{t('apiKey', language)}</label>
                    <input
                      type="password"
                      value={config.apiKey}
                      onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                      placeholder="sk-..."
                      autoComplete="off"
                      className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                </>
              )}

              {/* Model: free text + suggestions fetched from the provider */}
              <div>
                <label className="text-[11px] text-slate-400">{t('llmModel', language)}</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="text"
                    list="comfyforge-model-list"
                    value={config.llmModel}
                    onChange={(e) => setConfig({ ...config, llmModel: e.target.value })}
                    placeholder="gpt-4o"
                    className="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleFetchModels}
                    disabled={fetchState.loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition-colors disabled:opacity-50 shrink-0"
                    title={t('fetchModels', language)}
                  >
                    {fetchState.loading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <List className="w-3.5 h-3.5" />
                    )}
                    <span>{t('fetchModels', language)}</span>
                  </button>
                </div>
                <datalist id="comfyforge-model-list">
                  {modelOptions.map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
                {fetchState.message && (
                  <p className={`${statusClass(fetchState)} mt-1 font-mono break-words`}>{fetchState.message}</p>
                )}
                {modelOptions.length > 0 && !fetchState.message && (
                  <p className="text-[11px] text-slate-500 mt-1 font-mono">
                    {t('modelsFound', language, { n: modelOptions.length })} — pick from the dropdown or type any name
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ComfyUI server used for real execution */}
          <div className="space-y-3 pt-4 border-t border-slate-800">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-400" />
              <span>{t('comfyuiServer', language)}</span>
            </label>
            <input
              type="text"
              value={comfyUrl}
              onChange={(e) => setComfyUrl(e.target.value)}
              placeholder="http://localhost:8188"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
            />
            <p className="text-[11px] text-slate-400 leading-relaxed">{t('comfyuiHint', language)}</p>
          </div>

          {/* Validation / test / save feedback */}
          {validation.length > 0 && (
            <div className="p-3 rounded-xl border border-red-500/40 bg-red-500/10 space-y-1">
              {validation.map((key) => (
                <p key={key} className="text-[11px] text-red-300 font-medium">
                  • {t(key, language)}
                </p>
              ))}
            </div>
          )}

          {testState.message && (
            <p className={`${statusClass(testState)} font-mono break-words`}>{testState.message}</p>
          )}

          {saveNote && (
            <div className="space-y-1">
              <p className="text-[11px] text-emerald-400 font-mono">{saveNote}</p>
              {localSettingsOverridePortal() && (
                <p className="text-[11px] text-slate-500">{t('portalOverride', language)}</p>
              )}
            </div>
          )}

          {/* Android APK */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                {t('androidApk', language)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">{t('androidApkHint', language)}</p>
            </div>
            <a
              href="ComfyForge-AI-IDE.apk"
              download="ComfyForge-AI-IDE.apk"
              className="shrink-0 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all"
            >
              {t('download', language)}
            </a>
          </div>

          <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-3 pb-1 mt-auto bg-slate-900 border-t border-slate-800 flex flex-wrap justify-end gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 whitespace-nowrap rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
            >
              {t('close', language)}
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={testState.loading}
              className="flex items-center gap-2 px-4 py-2 whitespace-nowrap rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition-all disabled:opacity-50"
            >
              {testState.loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <PlugZap className="w-3.5 h-3.5" />
              )}
              <span>{testState.loading ? t('testingConnection', language) : t('testConnection', language)}</span>
            </button>
            <button
              type="submit"
              className="flex flex-1 sm:flex-none items-center justify-center gap-2 px-5 py-2 whitespace-nowrap rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all"
            >
              {saved && <Check className="w-3.5 h-3.5" />}
              <span>{saved ? t('savedAiSettings', language) : t('saveAiSettings', language)}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
