import { AIProviderConfig } from '../types';
import { apiUrl } from '../api';

/** Storage keys shared with App.tsx (kept here so persistence lives in one place). */
export const AI_SETTINGS_KEY = 'comfyforge.settings.ai';
export const COMFYUI_KEY = 'comfyforge.comfyui.url';
export const SHARED_AI_KEY = 'comfyforge.ai-provider';
export const MODEL_CACHE_KEY = 'comfyforge.models';

export interface ModelList {
  models: string[];
  source: string;
}

async function postJson<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: any) {
    const timeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw new Error(timeout ? `Timed out after ${Math.round(timeoutMs / 1000)}s.` : `Network error: ${err?.message || err}`);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Request failed (HTTP ${res.status}).`);
  }
  return data as T;
}

/**
 * Real model catalogue from the provider (server-side proxy — no CORS).
 * Works for OpenAI-compatible endpoints and for Gemini.
 */
export function fetchModelList(config: AIProviderConfig): Promise<ModelList> {
  return postJson<ModelList>(
    '/api/ai/models',
    { provider: config.provider, endpoint: config.endpoint, apiKey: config.apiKey },
    15_000
  );
}

/** Sends one tiny completion and measures the round trip. */
export function testAiConnection(config: AIProviderConfig): Promise<{ latencyMs: number; reply?: string }> {
  return postJson<{ latencyMs: number; reply?: string }>(
    '/api/ai/test',
    {
      provider: config.provider,
      endpoint: config.endpoint,
      apiKey: config.apiKey,
      llmModel: config.llmModel,
    },
    25_000
  );
}

/**
 * Validation before saving. Returns i18n keys (empty = valid) so this module
 * stays UI-agnostic and the modal renders them in the active language.
 */
export function validateAiConfig(config: AIProviderConfig, comfyuiUrl: string): string[] {
  const errors: string[] = [];

  if (config.provider === 'openai_compatible') {
    if (!/^https?:\/\/\S+$/i.test(config.endpoint.trim())) errors.push('invalidEndpoint');
    if (!config.apiKey.trim()) errors.push('keyRequired');
  }
  if (!config.llmModel.trim()) errors.push('modelRequired');
  if (comfyuiUrl.trim() && !/^https?:\/\/\S+$/i.test(comfyuiUrl.trim())) errors.push('invalidComfyUrl');

  return errors;
}

/** Normalised values that get written to storage. */
function normalize(config: AIProviderConfig, comfyuiUrl: string): { aiConfig: AIProviderConfig; comfyuiUrl: string } {
  return {
    aiConfig: {
      ...config,
      endpoint: config.endpoint.trim().replace(/\/+$/, ''),
      apiKey: config.apiKey.trim(),
      llmModel: config.llmModel.trim(),
    },
    comfyuiUrl: comfyuiUrl.trim().replace(/\/+$/, ''),
  };
}

/**
 * The "Save AI provider settings" function: normalise + persist.
 * Returns what was actually stored (so the UI can show it truthfully).
 */
export function saveAiSettings(config: AIProviderConfig, comfyuiUrl: string): { aiConfig: AIProviderConfig; comfyuiUrl: string } {
  const stored = normalize(config, comfyuiUrl);
  try {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(stored.aiConfig));
    localStorage.setItem(COMFYUI_KEY, stored.comfyuiUrl);
  } catch {
    // storage blocked — the values still apply for this session
  }
  return stored;
}

/* ------------------------------------------------------- model list cache */

function cacheKey(config: AIProviderConfig): string {
  return `${config.provider}|${(config.endpoint || '').trim().replace(/\/+$/, '')}`;
}

export function loadModelCache(config: AIProviderConfig): string[] {
  try {
    const raw = localStorage.getItem(MODEL_CACHE_KEY);
    if (!raw) return [];
    const map = JSON.parse(raw);
    const list = map?.[cacheKey(config)];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveModelCache(config: AIProviderConfig, models: string[]): void {
  try {
    const raw = localStorage.getItem(MODEL_CACHE_KEY);
    const map: Record<string, string[]> = raw ? JSON.parse(raw) : {};
    map[cacheKey(config)] = models.slice(0, 500);
    localStorage.setItem(MODEL_CACHE_KEY, JSON.stringify(map));
  } catch {
    // cache is a nicety — ignore quota/blocked storage
  }
}

/** True when local settings exist *and* a portal-shared key would be shadowed by them. */
export function localSettingsOverridePortal(): boolean {
  try {
    return !!localStorage.getItem(AI_SETTINGS_KEY) && !!localStorage.getItem(SHARED_AI_KEY);
  } catch {
    return false;
  }
}
