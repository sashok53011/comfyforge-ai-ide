// Minimal OpenAI-compatible endpoint for local testing of
// "Fetch models" / "Test connection" (scripts/mock-openai-endpoint.mjs).
//
//   node scripts/mock-openai-endpoint.mjs [port]     # default 8099
//
// Auth:  Authorization: Bearer sk-test-123
import http from 'node:http';

const KEY = 'sk-test-123';
const MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'o3-mini'];

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const authorized = (req.headers.authorization || '') === `Bearer ${KEY}`;

  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  if (req.method === 'GET' && (url.pathname === '/models' || url.pathname === '/v1/models')) {
    if (!authorized) return send(401, { error: { message: 'Incorrect API key provided.' } });
    return send(200, { object: 'list', data: MODELS.map((id) => ({ id, object: 'model' })) });
  }

  if (req.method === 'POST' && (url.pathname === '/chat/completions' || url.pathname === '/v1/chat/completions')) {
    if (!authorized) return send(401, { error: { message: 'Incorrect API key provided.' } });
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      let model = 'unknown';
      try {
        model = JSON.parse(raw).model || 'unknown';
      } catch {
        // keep 'unknown'
      }
      send(200, {
        id: 'chatcmpl-mock',
        object: 'chat.completion',
        model,
        choices: [{ index: 0, message: { role: 'assistant', content: 'pong' }, finish_reason: 'stop' }],
      });
    });
    return;
  }

  send(404, { error: { message: `Unknown path ${url.pathname}` } });
});

const port = Number(process.argv[2] || 8099);
server.listen(port, () => {
  console.log(`mock openai endpoint: http://localhost:${port}  (key: ${KEY})`);
});
