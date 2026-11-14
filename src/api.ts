/**
 * Builds an API URL that works behind the portal's /<slug>/ prefix.
 *
 * BASE_URL is "/" in dev and "/comfyforge/" in the production build, so a
 * root-absolute path like "/api/copilot/chat" would leave the app and hit the
 * portal's own API (404) instead of this server.
 */
export function apiUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}

/**
 * Asks the copilot backend for a plain-text answer.
 * Throws an Error with the backend's message so callers can show it verbatim.
 */
export async function askCopilot(opts: {
  message: string;
  workflowContext: unknown;
  aiConfig: unknown;
  history?: { role: string; content: string }[];
}): Promise<string> {
  const res = await fetch(apiUrl('/api/copilot/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: opts.message,
      workflowContext: opts.workflowContext,
      history: opts.history ?? [],
      providerConfig: opts.aiConfig,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Copilot request failed (HTTP ${res.status})`);
  }
  return String(data.reply ?? '');
}

/** Strips markdown code fences so JSON payloads can be parsed. */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}
