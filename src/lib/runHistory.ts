import { Workflow } from '../types';

/**
 * Persistent execution log (localStorage — survives reloads).
 * Every entry stores the workflow snapshot so "Restore" really reloads it.
 */
export interface RunRecord {
  id: string;
  workflowId: string;
  workflowName: string;
  at: string;
  durationMs: number;
  status: 'success' | 'failed' | 'simulation';
  mode: 'comfyui' | 'simulation';
  promptId?: string;
  outputs: string[];
  error?: string;
  workflow: Workflow;
}

const STORAGE_KEY = 'comfyforge.run_history';
const MAX_ENTRIES = 30;

export function loadRuns(): RunRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((r) => r && typeof r === 'object') : [];
  } catch {
    return [];
  }
}

function persist(runs: RunRecord[]): RunRecord[] {
  const capped = runs.slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
  } catch {
    // quota exceeded — the in-memory list still works for this session
  }
  return capped;
}

export function addRun(run: RunRecord): RunRecord[] {
  return persist([run, ...loadRuns()]);
}

export function removeRun(id: string): RunRecord[] {
  return persist(loadRuns().filter((r) => r.id !== id));
}

export function clearRuns(): RunRecord[] {
  return persist([]);
}

export function makeRunId(): string {
  return `run_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `Today at ${time}` : `${date.toLocaleDateString()} ${time}`;
}
