import {platforms} from './domain.mjs';
import {stepKinds, validateSolution} from './market.mjs';

export const DEFAULT_MODEL = 'huihui_ai/qwen3-coder-next-abliterated:latest';
const text = (maxLength) => ({type: 'string', minLength: 1, maxLength});
export const replySchema = {
  type: 'object', additionalProperties: false, required: ['reply', 'draft'],
  properties: {
    reply: text(4000),
    draft: {anyOf: [{type: 'null'}, {
      type: 'object', additionalProperties: false,
      required: ['title', 'description', 'platform', 'steps', 'requirements'],
      properties: {
        title: text(70), description: {...text(1000), minLength: 20},
        platform: {type: 'string', enum: platforms.map(p => p.id)},
        steps: {type: 'array', minItems: 2, maxItems: 12, items: {
          type: 'object', additionalProperties: false, required: ['kind', 'label'],
          properties: {kind: {type: 'string', enum: stepKinds}, label: text(80)},
        }},
        requirements: {type: 'array', maxItems: 2, uniqueItems: true, items: {enum: ['SMS', 'CAPTCHA']}},
      },
    }]},
  },
};
const system = `You help users plan workflows in HyperAccts. Answer questions and create editable workflow drafts when requested. Campaign execution is currently a simulation. You cannot run code, control browsers, publish, purchase, or modify accounts. Explain those limits accurately. Include a Validate inputs step in every draft and an Owner review step for verification. Do not request credentials. Return JSON matching this schema: ${JSON.stringify(replySchema)}`;

export function validateMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 12 ||
      messages.at(-1)?.role !== 'user' || messages.some(m =>
        !m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' ||
        !m.content.trim() || m.content.length > 4000) ||
      messages.reduce((n, m) => n + m.content.length, 0) > 12000) {
    throw new Error('Use up to 12 messages and 12,000 characters, ending with your request.');
  }
  return messages.map(({role, content}) => ({role, content}));
}

export function parseReply(content) {
  if (typeof content !== 'string' || content.length > 20000) throw new Error('Invalid model response.');
  const value = JSON.parse(content);
  if (!value || typeof value.reply !== 'string' || !value.reply.trim() || value.reply.length > 4000) {
    throw new Error('Invalid model reply.');
  }
  let draft = null;
  if (value.draft !== null) {
    const d = value.draft;
    if (!d || typeof d.title !== 'string' || typeof d.description !== 'string' ||
        d.description.length > 1000 || !Array.isArray(d.steps) ||
        d.steps.some(s => !s || typeof s.label !== 'string' || s.label.length > 80) ||
        !Array.isArray(d.requirements) || d.requirements.length > 2) throw new Error('Invalid workflow draft.');
    draft = {title: d.title, description: d.description, platform: d.platform,
      steps: d.steps.map(({kind, label}) => ({kind, label})), requirements: [...new Set(d.requirements)]};
    const errors = validateSolution({...draft, creator: 'AI draft', version: '1.0.0', price: 0});
    if (errors.length) throw new Error('Invalid workflow draft.');
  }
  return {reply: value.reply, draft};
}

export function createAssistant({baseUrl = process.env.HYPERACCTS_OLLAMA_URL || 'http://127.0.0.1:11434',
  model = process.env.HYPERACCTS_AI_MODEL || DEFAULT_MODEL, fetchModel = fetch, timeoutMs = 180000} = {}) {
  const endpoint = new URL(baseUrl);
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password ||
      endpoint.search || endpoint.hash || endpoint.pathname !== '/') throw new Error('Use an Ollama server origin without credentials or a path.');
  let busy = false;
  return {
    async status() {
      try {
        const r = await fetchModel(new URL('/api/ps', endpoint), {signal: AbortSignal.timeout(5000), redirect: 'error'});
        if (!r.ok) throw new Error();
        const data = await r.json();
        const loaded = data.models.some(m => m.name === model || m.model === model);
        return {ok: true, model, loaded, message: loaded ? 'Model loaded and ready.' : 'Model is not loaded. Load it in Ollama before chatting.'};
      } catch { return {ok: false, model, loaded: false, message: 'Cannot reach Ollama. Set HYPERACCTS_OLLAMA_URL and check the connection.'}; }
    },
    async chat(messages) {
      const validated = validateMessages(messages);
      if (busy) throw new Error('A model request is already running. Wait for it to finish.');
      busy = true;
      try {
        const r = await fetchModel(new URL('/api/chat', endpoint), {
          method: 'POST', headers: {'content-type': 'application/json'}, redirect: 'error',
          signal: AbortSignal.timeout(timeoutMs),
          body: JSON.stringify({model, messages: [{role: 'system', content: system}, ...validated],
            stream: false, format: replySchema, keep_alive: -1, options: {temperature: 0.1, num_predict: 1800}}),
        });
        if (!r.ok) throw new Error();
        const data = await r.json();
        if (data.done !== true || data.done_reason === 'length') throw new Error();
        return {ok: true, model, ...parseReply(data.message?.content)};
      } catch { throw new Error('The model could not complete a valid reply. Check Ollama and try a shorter request.'); }
      finally { busy = false; }
    },
  };
}
