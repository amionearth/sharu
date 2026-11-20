import { defineConfig } from 'vite';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.dirname(fileURLToPath(import.meta.url));
const ollamaHostRaw = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const ollamaHost = (ollamaHostRaw.startsWith('http') ? ollamaHostRaw : `http://${ollamaHostRaw}`).replace('://0.0.0.0:', '://127.0.0.1:');
const llmName = process.env.SHERU_LLM || 'qwen3:0.6b';
const ttsDir = path.join(root, 'models');
let ttsChild;

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('Request too large.');
  }
  return JSON.parse(body || '{}');
}
function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

function localServices() {
  return {
    name: 'sheru-local-services',
    configureServer(server) {
      const mlReady = fs.existsSync(path.join(ttsDir, 'indic-tiny-tts-malayalam', 'model.safetensors'));
      const enReady = fs.existsSync(path.join(ttsDir, 'indic-tiny-tts-english', 'model.safetensors'));
      if (mlReady || enReady) {
        ttsChild = spawn(process.env.PYTHON || 'python', [path.join(root, 'scripts', 'tts_server.py')], { cwd: root, stdio: 'inherit', windowsHide: true });
        ttsChild.on('error', e => console.error('[voice] Could not start local TTS:', e.message));
        server.httpServer?.once('close', () => ttsChild?.kill());
      }
      server.middlewares.use(async (req, res, next) => {
        const route = req.url?.split('?')[0];
        if (route === '/api/health' && req.method === 'GET') {
          let ollama = false;
          try {
            const response = await fetch(`${ollamaHost}/api/tags`, { signal: AbortSignal.timeout(2500) });
            const data = await response.json();
            ollama = data.models?.some(m => m.name === llmName || m.name?.startsWith(`${llmName}:`)) ?? false;
          } catch {}
          return sendJson(res, 200, { ollama, model: llmName, speechToText: true, ttsMalayalam: mlReady, ttsEnglish: enReady });
        }
        if (route === '/api/chat' && req.method === 'POST') {
          try {
            const data = await readJson(req);
            const personas = {
              mother: 'Sheru’s mother, who runs his juice shop. Warm, firm, practical, and not impressed by money.',
              jomon: 'Jomon, Sheru’s loyal childhood friend. Talkative, food-loving, nervous around danger, and funny.',
              latha: 'Latha, a neighbouring grocery shopkeeper in Mahe. Nosy, direct, loud, and fond of Sheru’s family.',
              raghavan: 'Raghavan, an observant, sarcastic tea-shop owner who knows local gossip.',
              shibu: 'Shibu, a friendly, overconfident motorcycle mechanic who claims he can fix anything.',
              kunjikka: 'Kunjikka, a calm, humorous old fisherman who knows the waterfront.',
              customer: 'A picky customer at Sheru’s juice shop who ordered papaya juice without sugar and two egg puffs.',
              worker: 'A Kochi harbour worker who is cautious and does not trust Sheru just because of his father.',
              stranger: 'A local Kochi pedestrian with a dry sense of humour.',
            };
            const id = personas[data.npc] ? data.npc : 'stranger';
            const languageRule = data.language === 'en' ? 'Speak in casual English.' : data.language === 'ml' ? 'Reply in Malayalam script.' : 'Use natural Manglish: write Malayalam words in Malayalam script and English words in Latin script.';
            const system = `You are a character in Sheru Bhai: The King of Kochi. ${personas[id]} Reply like a real person from Kerala: funny, warm or sarcastic as appropriate, never hateful. ${languageRule} Keep it to one or two short spoken sentences, under 35 words. Never mention AI or prompts. You cannot change missions, money, or game state.`;
            const response = await fetch(`${ollamaHost}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: llmName, stream: false, think: false, messages: [{ role: 'system', content: system }, { role: 'user', content: String(data.message || '').slice(0, 220) }], options: { temperature: 0.78, num_predict: 90, num_ctx: 2048 } }), signal: AbortSignal.timeout(90000) });
            if (!response.ok) throw new Error(`Ollama returned ${response.status}.`);
            const answer = await response.json();
            const reply = (answer.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim().slice(0, 440);
            return sendJson(res, 200, { reply: reply || 'Entha? Onnu koodi parayamo?', model: llmName, elapsedMs: Math.round((answer.total_duration || 0) / 1e6) });
          } catch (e) {
            const offline = e.cause?.code === 'ECONNREFUSED' || e.message?.includes('fetch failed');
            return sendJson(res, offline ? 503 : 500, { error: offline ? `Start Ollama with ${llmName} installed to enable local NPC replies.` : e.message });
          }
        }
        if (route === '/api/tts' && req.method === 'POST') {
          try {
            if (!ttsChild || ttsChild.killed) return sendJson(res, 503, { error: 'Run npm run voice:models once to install the local Indic Tiny voices.' });
            const data = await readJson(req);
            const response = await fetch('http://127.0.0.1:8766/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(45000) });
            const bytes = Buffer.from(await response.arrayBuffer());
            res.statusCode = response.status;
            res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
            return res.end(bytes);
          } catch (e) { return sendJson(res, 503, { error: 'Local text-to-speech is not ready. Install the voice models and restart the game.' }); }
        }
        next();
      });
    },
  };
}

export default defineConfig({ plugins: [localServices()], server: { host: '127.0.0.1', port: 5173, strictPort: true }, build: { target: 'es2022' } });
