// ── Multi-Provider LLM Service ──
// All API calls route through Electron's main process via IPC to bypass CORS.
// The main process makes the actual HTTP requests from Node.js (no CORS restrictions).

export type LLMProvider =
  | 'ollama_cloud'      // 2026-08-17 — Ollama Cloud via OLLAMA_API_KEY (OAuth)
  | 'ollama_local'      // 2026-08-17 — local Ollama daemon (no key needed; uses ollamaEndpoint)
  | 'openrouter'        // 2026-08-17 — OpenRouter via OPENROUTER_API_KEY (OAuth)
  | 'featherless'       // 2026-08-17 — Featherless via FEATHERLESSAI_OPENCLAW_KEYS (OAuth)
  | 'anthropic'         // Claude (api.anthropic.com) — direct
  | 'minimax'           // MiniMax (api.minimax.io) — direct, OpenAI-compatible
  | 'openai'            // direct
  | 'gemini'            // direct
  | 'qwen'              // 2026-08-17 — Aliyun DashScope / Token Plan — direct
  | 'glm'               // direct
  | 'kimi'              // direct
  | 'piapi'             // direct
  | 'custom';           // direct, user-configured endpoint

// 2026-08-17 — engine classification.
//
//   OAuth / Token Plan engine: providers where you BUY A PLAN and
//   receive a token (sk-sp-..., ollama_..., openrouter_..., etc.)
//   that the app uses for all calls. The plan = subscription = your
//   "OAuth" auth. Examples: Qwen Token Plan (Aliyun), Ollama Cloud,
//   OpenRouter credits, Featherless. These hit the provider's
//   plan-authenticated endpoint with a Bearer token.
//
//   Direct API engine: providers where you BYO (bring-your-own)
//   per-call API key from the provider's dashboard, OR talk to a
//   local daemon. PAYG billing per token, or no billing at all for
//   local. Examples: Anthropic, OpenAI, Gemini, GLM, Kimi, MiniMax,
//   PiAPI, Custom, Ollama Local (localhost daemon, no key needed).
//
// Ade 2026-08-17 11:05 MDT: "all providers should be under direct api
// engine, while OAuth / Gateway engine: should be for providers that
// give token plans like qwen so qwen should also be under OAuth /
// Gateway engine/ token plan". Qwen moved from Direct to OAuth/Token
// Plan because its auth model is exactly that — a Token Plan (sk-sp-…
// key issued by the Aliyun plan). Ollama Local moved from OAuth to
// Direct because it's a local daemon, not a token plan.
export const OAUTH_PROVIDERS: LLMProvider[] = [
  'ollama_cloud',
  'openrouter',
  'featherless',
  'qwen',        // Aliyun Token Plan (sk-sp-... key on token-plan endpoint)
];
export const DIRECT_PROVIDERS: LLMProvider[] = [
  'ollama_local', // local daemon at ollamaLocalEndpoint, no key
  'anthropic',
  'minimax',
  'openai',
  'gemini',
  'glm',
  'kimi',
  'piapi',
  'custom',
];

export function isOAuthProvider(p: LLMProvider): boolean { return OAUTH_PROVIDERS.includes(p); }
export function isDirectProvider(p: LLMProvider): boolean { return DIRECT_PROVIDERS.includes(p); }
export function isVisionModel(p: LLMProvider, model: string): boolean {
  // Cheap heuristic: vision-capable models. Used by Coding mode to
  // pick a vision model for the screen-capture path. Doesn't have to
  // be exhaustive — the user can override in settings.
  const m = model.toLowerCase();
  if (p === 'anthropic') return true; // all Claude 3+ are vision
  if (p === 'openai') return /gpt-4o|vision|gpt-5/.test(m);
  if (p === 'gemini') return /gemini-2|gemini-1\.5/.test(m);
  if (p === 'qwen') return /vl|vision/.test(m);
  if (p === 'ollama_cloud' || p === 'ollama_local') return /vl|vision|llava/.test(m);
  if (p === 'openrouter') return /vision|vl|gpt-4o|claude|gemini/.test(m);
  if (p === 'featherless') return /vl|vision/.test(m);
  return false;
}

// Back-compat alias — the old `gateway_ollama` provider was an internal
// routing abstraction; map it to the new user-facing `ollama_cloud`.
export function normalizeProvider(p: LLMProvider | string): LLMProvider {
  if (p === 'gateway_ollama') return 'ollama_cloud';
  if (p === 'openclaw') return 'openrouter';
  return p as LLMProvider;
}

// OpenClaw gateway (OpenAI-compatible) running locally on the Mac.
export const OPENCLAW_GATEWAY_ENDPOINT = 'http://localhost:18789/v1/chat/completions';

// MiniMax — OpenAI-compatible chat completions at api.minimax.io/v1.
// Override with the `minimaxEndpoint` setting if MiniMax ever moves hostnames.
export const MINIMAX_API_ENDPOINT = 'https://api.minimax.io/v1/chat/completions';

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  endpoint?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface LLMResponse {
  text: string;
  provider: LLMProvider;
  model: string;
  tokensUsed?: number;
}

// Provider model catalogs
export const PROVIDER_MODELS: Record<LLMProvider, { label: string; models: { id: string; name: string }[] }> = {
  // ── OAuth / Gateway providers (OpenClaw-managed keys) ──
  ollama_cloud: {
    label: 'Ollama Cloud',
    // All ids MUST carry the :cloud suffix — bare names route to a
    // local Ollama daemon (use ollama_local for that). Verified live
    // on api.ollama.com with OLLAMA_API_KEY.
    models: [
      { id: 'deepseek-v4-pro:cloud', name: 'DeepSeek V4 Pro (default · free)' },
      { id: 'qwen3.5:397b-cloud', name: 'Qwen 3.5 397B (cloud)' },
      { id: 'qwen-vl-max:cloud', name: 'Qwen VL Max (vision · for Coding mode)' },
      { id: 'llama-3.3-70b:cloud', name: 'Llama 3.3 70B (cloud)' },
      { id: 'kimi-k2.6:cloud', name: 'Kimi K2.6 (cloud)' },
      { id: 'gpt-oss:120b-cloud', name: 'GPT-OSS 120B (cloud)' },
    ],
  },
  ollama_local: {
    label: 'Ollama Local',
    // Local Ollama daemon (e.g. localhost:11434). No :cloud suffix.
    // The list is the most common local models — `ollama list` on the
    // user's machine may show different ones.
    models: [
      { id: 'llama3.1', name: 'Llama 3.1 (8B)' },
      { id: 'llama3.2', name: 'Llama 3.2 (3B)' },
      { id: 'mistral', name: 'Mistral 7B' },
      { id: 'codellama', name: 'CodeLlama (13B)' },
      { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder (7B)' },
      { id: 'deepseek-coder-v2', name: 'DeepSeek Coder V2' },
      { id: 'llava', name: 'LLaVA (vision · for Coding mode)' },
    ],
  },
  openrouter: {
    label: 'OpenRouter',
    // Smart-routed multi-provider catalog. Vision-capable rows are
    // tagged so the Coding-mode auto-pick can find them.
    models: [
      { id: 'auto', name: 'Auto (Smart Routing)' },
      { id: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (vision)' },
      { id: 'anthropic/claude-opus-4-6', name: 'Claude Opus 4.6 (vision)' },
      { id: 'openai/gpt-4o', name: 'GPT-4o (vision)' },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini (vision · cheap)' },
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash (vision · fast)' },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro (vision)' },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1 (reasoning)' },
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
    ],
  },
  featherless: {
    label: 'Featherless',
    models: [
      { id: 'featherless/zai-org/GLM-5.1-FP8', name: 'GLM 5.1 FP8' },
      { id: 'featherless/meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B' },
    ],
  },

  // ── Direct API providers (provider's own key) ──
  anthropic: {
    label: 'Anthropic (Claude)',
    models: [
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5 (Fast · vision)' },
      { id: 'claude-opus-5', name: 'Claude Opus 5 (Latest · 1M ctx · flagship · vision)' },
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8 (vision)' },
      { id: 'claude-opus-4-7', name: 'Claude Opus 4.7 (vision)' },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6 (vision)' },
      { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5 (vision)' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (vision)' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5 (Fastest · vision)' },
    ],
  },
  minimax: {
    label: 'MiniMax',
    // Direct hits to api.minimax.io — no gateway needed. <think> tags
    // are stripped in-flight.
    models: [
      { id: 'MiniMax-M3', name: 'MiniMax M3 (1M context · frontier)' },
      { id: 'MiniMax-M2.7-highspeed', name: 'MiniMax M2.7 Highspeed' },
      { id: 'MiniMax-M2.7', name: 'MiniMax M2.7 (reasoning)' },
      { id: 'MiniMax-M2.1-highspeed', name: 'MiniMax M2.1 Highspeed' },
      { id: 'MiniMax-M2.1', name: 'MiniMax M2.1' },
    ],
  },
  openai: {
    label: 'OpenAI',
    models: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (vision · cheap)' },
      { id: 'gpt-4o', name: 'GPT-4o (vision)' },
      { id: 'gpt-5.4', name: 'GPT-5.4 Codex (Latest)' },
      { id: 'o3', name: 'o3 (Reasoning)' },
    ],
  },
  gemini: {
    label: 'Google Gemini',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (vision · fast)' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (vision)' },
    ],
  },
  qwen: {
    label: 'Qwen Token Plan (Aliyun)',
    // 2026-08-17 — moved from Direct API to OAuth / Token Plan
    // engine. Auth: Bearer with the sk-sp-... key from the Aliyun
    // Token Plan. Endpoint: token-plan.ap-southeast-1.maas.aliyuncs.com
    //
    // The Token Plan supports these model ids (verified against
    // Aliyun docs 2026-08-17):
    //   - qwen-max             text, frontier
    //   - qwen-max-latest      text, latest build
    //   - qwen-plus            text, mid-tier
    //   - qwen-plus-latest     text, latest
    //   - qwen-turbo           text, fast
    //   - qwen-vl-max          vision, frontier (Coding mode)
    //   - qwen-vl-plus         vision, mid-tier
    //
    // Note: `qwen3.8-max` and `qwen3.5-plus` are NOT valid Token Plan
    // ids. They were names from a previous app version. The 404
    // error Ade hit on 2026-08-17 11:06 was because the stored model
    // was `qwen3.8-max` — that id doesn't exist on the Token Plan
    // endpoint. Migrated to `qwen-max` below.
    models: [
      { id: 'qwen-max', name: 'Qwen Max (frontier text · Token Plan)' },
      { id: 'qwen-vl-max', name: 'Qwen VL Max (vision · for Coding mode)' },
      { id: 'qwen-plus', name: 'Qwen Plus (mid-tier)' },
      { id: 'qwen-turbo', name: 'Qwen Turbo (fast · cheap)' },
      { id: 'qwen-vl-plus', name: 'Qwen VL Plus (vision · mid-tier)' },
    ],
  },
  glm: {
    label: 'GLM (Zhipu AI)',
    models: [
      { id: 'glm-5.1', name: 'GLM 5.1' },
      { id: 'glm-4-plus', name: 'GLM 4 Plus' },
    ],
  },
  kimi: {
    label: 'Kimi (Moonshot)',
    models: [
      { id: 'kimi-k2.6', name: 'Kimi K2.6' },
    ],
  },
  piapi: {
    label: 'PiAPI',
    models: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (PAYG · last resort)' },
    ],
  },
  custom: {
    label: 'Custom Endpoint',
    models: [
      { id: 'custom', name: 'Custom Model' },
    ],
  },
};

// 2026-08-17 — engine-scoped provider/model helpers. Used by the
// Settings panel to filter the dropdown to the providers reachable
// with the current auth method.
export function getProvidersForEngine(engine: 'oauth' | 'direct'): LLMProvider[] {
  return engine === 'oauth' ? OAUTH_PROVIDERS : DIRECT_PROVIDERS;
}

export function getProviderLabel(p: LLMProvider): string {
  return PROVIDER_MODELS[p]?.label || p;
}

// ── CORS-free fetch ──
// Routes through Electron main process IPC to bypass browser CORS restrictions.
// Falls back to direct fetch only if electronAPI is unavailable (shouldn't happen in production).
async function corsFetch(url: string, options: {
  method: string;
  headers: Record<string, string>;
  body?: string;
}): Promise<any> {
  const api = (window as any).electronAPI;

  if (api?.fetchProxy) {
    // Route through Electron main process (CORS-free)
    const result = await api.fetchProxy(url, options);
    if (!result.ok) {
      const errMsg = result.data?.error?.message || result.data?.error || `HTTP ${result.status}`;
      throw new Error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
    }
    return result.data;
  } else {
    // Direct fetch fallback (will hit CORS in browser — only works in Node.js / Electron with webSecurity disabled)
    const response = await fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
    });
    return response.json();
  }
}

// ── Anthropic Claude ──
async function callAnthropic(messages: Message[], config: LLMConfig): Promise<LLMResponse> {
  const systemMsg = messages.find((m) => m.role === 'system');
  const conversationMsgs = messages.filter((m) => m.role !== 'system');

  // Filter out any messages with empty content — Anthropic 400s on
  // "User message must have non-empty content" if a part maps to {type:'text',text:''}.
  // (Failure 1.1 in the Seun test — long interviewer questions would silently
  // produce an image part with no base64 and break the request.)
  const sanitizedConv = conversationMsgs
    .map((m) => {
      if (typeof m.content === 'string') {
        return { role: m.role, content: m.content };
      }
      const parts = (m.content as ContentPart[])
        .map((part) => {
          if (part.type === 'text') {
            const t = (part.text || '').trim();
            return t ? { type: 'text' as const, text: t } : null;
          }
          if (part.type === 'image_url') {
            const dataUrl = part.image_url!.url;
            const base64Match = dataUrl.match(/^data:image\/(.*?);base64,(.*)$/);
            if (base64Match) {
              return {
                type: 'image' as const,
                source: {
                  type: 'base64' as const,
                  media_type: `image/${base64Match[1]}` as any,
                  data: base64Match[2],
                },
              };
            }
            return null;
          }
          return null;
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);
      return { role: m.role, content: parts };
    })
    // Drop messages that became empty after sanitization.
    .filter((m) => {
      if (typeof m.content === 'string') return m.content.trim().length > 0;
      return (m.content as any[]).length > 0;
    });

  if (sanitizedConv.length === 0) {
    throw new Error('Anthropic: all user messages were empty after sanitization');
  }

  const anthropicMessages = sanitizedConv;

  const data = await corsFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens || 4096,
      // NOTE: `temperature` is deprecated on Claude Opus 4.7+, Opus 4.8, and Sonnet 5.
      // Anthropic returns HTTP 400 if you set a non-default value. Omit it entirely
      // and let the model use its default (1.0).
      system: systemMsg?.content || '',
      messages: anthropicMessages,
    }),
  });

  if (data.error) throw new Error(`Anthropic: ${data.error.message}`);

  return {
    text: data.content?.[0]?.text || '',
    provider: 'anthropic',
    model: config.model,
    tokensUsed: data.usage?.output_tokens,
  };
}

// ── OpenAI ──
async function callOpenAI(messages: Message[], config: LLMConfig): Promise<LLMResponse> {
  const openaiMessages = messages.map((m) => {
    if (typeof m.content === 'string') {
      return { role: m.role, content: m.content };
    }
    return {
      role: m.role,
      content: (m.content as ContentPart[]).map((part) => {
        if (part.type === 'text') return { type: 'text' as const, text: part.text! };
        if (part.type === 'image_url') return { type: 'image_url' as const, image_url: part.image_url! };
        return { type: 'text' as const, text: '' };
      }),
    };
  });

  const data = await corsFetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: openaiMessages,
      max_tokens: config.maxTokens || 4096,
      temperature: config.temperature ?? 0.3,
    }),
  });

  if (data.error) throw new Error(`OpenAI: ${data.error.message}`);

  return {
    text: data.choices?.[0]?.message?.content || '',
    provider: 'openai',
    model: config.model,
    tokensUsed: data.usage?.completion_tokens,
  };
}

// ── Google Gemini ──
async function callGemini(messages: Message[], config: LLMConfig): Promise<LLMResponse> {
  const systemMsg = messages.find((m) => m.role === 'system');
  const conversationMsgs = messages.filter((m) => m.role !== 'system');

  const contents = conversationMsgs.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts:
      typeof m.content === 'string'
        ? [{ text: m.content }]
        : (m.content as ContentPart[]).map((part) => {
            if (part.type === 'text') return { text: part.text! };
            if (part.type === 'image_url') {
              const dataUrl = part.image_url!.url;
              const base64Match = dataUrl.match(/^data:image\/(.*?);base64,(.*)$/);
              if (base64Match) {
                return { inlineData: { mimeType: `image/${base64Match[1]}`, data: base64Match[2] } };
              }
            }
            return { text: '' };
          }),
  }));

  const data = await corsFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: systemMsg ? { parts: [{ text: systemMsg.content as string }] } : undefined,
        generationConfig: {
          temperature: config.temperature ?? 0.3,
          maxOutputTokens: config.maxTokens || 4096,
        },
      }),
    }
  );

  if (data.error) throw new Error(`Gemini: ${data.error.message}`);

  return {
    text: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
    provider: 'gemini',
    model: config.model,
    tokensUsed: data.usageMetadata?.candidatesTokenCount,
  };
}

// ── Ollama (Cloud or Local) ──
async function callOllama(messages: Message[], config: LLMConfig): Promise<LLMResponse> {
  const endpoint = config.endpoint || 'https://api.ollama.com';

  const ollamaMessages = messages.map((m) => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : (m.content as ContentPart[]).map((p) => p.text || '').join('\n'),
    images:
      typeof m.content !== 'string'
        ? (m.content as ContentPart[])
            .filter((p) => p.type === 'image_url')
            .map((p) => {
              const match = p.image_url!.url.match(/^data:image\/.*?;base64,(.*)$/);
              return match ? match[1] : '';
            })
            .filter(Boolean)
        : undefined,
  }));

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const data = await corsFetch(`${endpoint}/api/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: ollamaMessages,
      stream: false,
      options: {
        temperature: config.temperature ?? 0.3,
        num_predict: config.maxTokens || 4096,
      },
    }),
  });

  if (data.error) throw new Error(`Ollama: ${data.error}`);
  // 2026-08-17 — use the actual config.provider so the legacy 'ollama'
  // and the new 'ollama_cloud' / 'ollama_local' all report correctly.
  return {
    text: data.message?.content || '',
    provider: (config.provider === 'ollama_local' ? 'ollama_local' : 'ollama_cloud') as any,
    model: config.model,
    tokensUsed: data.eval_count,
  };
}

// ── GLM (Zhipu AI) ──
async function callGLM(messages: Message[], config: LLMConfig): Promise<LLMResponse> {
  const endpoint = config.endpoint || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

  const data = await corsFetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : (m.content as ContentPart[]).map((p) => p.text || '').join('\n'),
      })),
      max_tokens: config.maxTokens || 4096,
      temperature: config.temperature ?? 0.3,
    }),
  });

  if (data.error) throw new Error(`GLM: ${data.error.message}`);

  return {
    text: data.choices?.[0]?.message?.content || '',
    provider: 'glm',
    model: config.model,
    tokensUsed: data.usage?.completion_tokens,
  };
}

// ── Qwen (Aliyun DashScope / Token Plan) ──
// 2026-08-17 P0 fix — added so Ade's stored `provider: 'qwen'` settings
// don't blow up with "Unsupported provider: qwen". The Token Plan
// endpoint is OpenAI-compatible and uses Bearer auth with the `sk-sp-…`
// key. Note: `qwen3-coder-plus` is NOT a Token-Plan model (it's on the
// regular DashScope inference endpoint) — it's listed in the catalog
// for reference but will 404 if selected. The qwen-vl-max vision model
// accepts images via the same OpenAI-compatible `image_url` content
// part used by the screen-capture path, so it can OCR LeetCode
// questions.
async function callQwen(messages: Message[], config: LLMConfig): Promise<LLMResponse> {
  const endpoint = config.endpoint || 'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions';

  if (!config.apiKey) {
    throw new Error('Qwen: API key is required (set QWEN_API_KEY in .env, or paste it in Settings → API Keys → Qwen)');
  }

  // Token Plan accepts the OpenAI-style content part array. We map
  // `image_url` to a Qwen-VL-compatible image part and pass `text` and
  // multimodal messages through as-is.
  const data = await corsFetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map((m) => {
        if (typeof m.content === 'string') {
          return { role: m.role, content: m.content };
        }
        return {
          role: m.role,
          content: (m.content as ContentPart[]).map((part) => {
            if (part.type === 'text') return { type: 'text' as const, text: part.text || '' };
            if (part.type === 'image_url') return { type: 'image_url' as const, image_url: part.image_url };
            return { type: 'text' as const, text: '' };
          }),
        };
      }),
      max_tokens: config.maxTokens || 4096,
      temperature: config.temperature ?? 0.3,
    }),
  });

  if (data.error) {
    const code = data.error.code || '';
    const msg = data.error.message || JSON.stringify(data.error);
    const err = new Error(`Qwen${code ? ` [${code}]` : ''}: ${msg}`);
    (window as any).electronAPI?.logToMain?.('error', `[LLM] Qwen ${config.model} failed: ${err.message}`);
    throw err;
  }

  // Qwen sometimes returns `data.choices[0].message` as a string (rare
  // but seen on vl-max). Normalize to a string.
  const choice = data.choices?.[0]?.message;
  const text = typeof choice === 'string' ? choice : choice?.content || '';

  (window as any).electronAPI?.logToMain?.('info', `[LLM] Qwen ${config.model} OK (${text.length} chars)`);

  return {
    text,
    provider: 'qwen',
    model: config.model,
    tokensUsed: data.usage?.completion_tokens,
  };
}

// ── MiniMax (direct, OpenAI-compatible) ──
// Hits api.minimax.io/v1/chat/completions. MiniMax models (M3, M2.7, M2.x) include
// <think>…</think> blocks in the response by default — strip them so the
// interview answer shows the final answer only, not the chain-of-thought.
async function callMiniMax(messages: Message[], config: LLMConfig): Promise<LLMResponse> {
  const endpoint = config.endpoint || MINIMAX_API_ENDPOINT;

  if (!config.apiKey) {
    throw new Error('MiniMax: API key is required (set it in Settings → API Keys → MiniMax)');
  }

  const data = await corsFetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map((m) => ({
        role: m.role,
        content:
          typeof m.content === 'string'
            ? m.content
            : (m.content as ContentPart[]).map((p) => p.text || '').join('\n'),
      })),
      max_tokens: config.maxTokens || 4096,
      // MiniMax lets you set temperature on M2/M3; harmless to pass.
      temperature: config.temperature ?? 0.3,
      stream: false,
    }),
  });

  if (data.error) {
    const msg = data.error?.message || data.error || JSON.stringify(data.error);
    throw new Error(`MiniMax: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }

  // MiniMax returns content with embedded <think>…</think> tags — strip them.
  // Also collapses any leading/trailing whitespace left behind.
  const stripThinkTags = (s: string): string =>
    s
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<\/?think>/gi, '')
      .trim();

  // Some responses put reasoning in `reasoning_content` (when reasoning_split=true).
  const reasoning =
    typeof data.choices?.[0]?.message?.reasoning_content === 'string'
      ? data.choices[0].message.reasoning_content
      : '';
  const rawContent =
    data.choices?.[0]?.message?.content ||
    data.message?.content ||
    data.content ||
    '';
  const text = stripThinkTags(String(rawContent || reasoning || ''));

  return {
    text,
    provider: 'minimax',
    model: config.model,
    tokensUsed: data.usage?.completion_tokens,
  };
}


// Routes Ollama / Featherless requests through the OpenClaw daemon on localhost:18789.
// No API key needed — the daemon already holds upstream credentials.
async function callGateway(messages: Message[], config: LLMConfig): Promise<LLMResponse> {
  const endpoint = config.endpoint || OPENCLAW_GATEWAY_ENDPOINT;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

  const data = await corsFetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: messages.map((m) => ({
        role: m.role,
        content:
          typeof m.content === 'string'
            ? m.content
            : (m.content as ContentPart[]).map((p) => p.text || '').join('\n'),
      })),
      max_tokens: config.maxTokens || 4096,
      temperature: config.temperature ?? 0.3,
      stream: false,
    }),
  });

  if (data.error) throw new Error(`OpenClaw gateway: ${data.error?.message || JSON.stringify(data.error)}`);

  return {
    text: data.choices?.[0]?.message?.content || data.message?.content || '',
    provider: config.provider,
    model: config.model,
    tokensUsed: data.usage?.completion_tokens,
  };
}

// ── OpenClaw (via OpenRouter) ──
async function callOpenClaw(messages: Message[], config: LLMConfig): Promise<LLMResponse> {
  const endpoint = config.endpoint || 'https://openrouter.ai/api/v1/chat/completions';

  const data = await corsFetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      'HTTP-Referer': 'https://interview-copilot.app',
      'X-Title': 'Interview Copilot',
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : (m.content as ContentPart[]).map((p) => p.text || '').join('\n'),
      })),
      max_tokens: config.maxTokens || 4096,
      temperature: config.temperature ?? 0.3,
    }),
  });

  if (data.error) throw new Error(`OpenClaw: ${data.error?.message || JSON.stringify(data.error)}`);

  return {
    text: data.choices?.[0]?.message?.content || '',
    provider: 'openrouter' as any,
    model: config.model,
    tokensUsed: data.usage?.completion_tokens,
  };
}

// ── OpenRouter (direct) ──
async function callOpenRouter(messages: Message[], config: LLMConfig): Promise<LLMResponse> {
  const endpoint = config.endpoint || 'https://openrouter.ai/api/v1/chat/completions';

  const data = await corsFetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      'HTTP-Referer': 'https://interview-copilot.app',
      'X-Title': 'Interview Copilot',
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : (m.content as ContentPart[]).map((p) => p.text || '').join('\n'),
      })),
      max_tokens: config.maxTokens || 4096,
      temperature: config.temperature ?? 0.3,
    }),
  });

  if (data.error) throw new Error(`OpenRouter: ${data.error?.message || JSON.stringify(data.error)}`);

  return {
    text: data.choices?.[0]?.message?.content || '',
    provider: 'openrouter',
    model: config.model,
    tokensUsed: data.usage?.completion_tokens,
  };
}

// ── Custom OpenAI-compatible endpoint ──
async function callCustomEndpoint(messages: Message[], config: LLMConfig): Promise<LLMResponse> {
  if (!config.endpoint) throw new Error('Custom endpoint URL is required');

  const data = await corsFetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : (m.content as ContentPart[]).map((p) => p.text || '').join('\n'),
      })),
      max_tokens: config.maxTokens || 4096,
      temperature: config.temperature ?? 0.3,
    }),
  });

  if (data.error) throw new Error(`Custom: ${data.error?.message || JSON.stringify(data.error)}`);

  return {
    text: data.choices?.[0]?.message?.content || data.message?.content || '',
    provider: config.provider,
    model: config.model,
  };
}

// ── Main dispatch ──
export async function callLLM(messages: Message[], config: LLMConfig): Promise<LLMResponse> {
  // 2026-08-17 P0 fix — log the call attempt to the main-process
  // terminal so `npm start` shows what's being sent. Without this, an
  // LLM error like "Unsupported provider: qwen" only shows up in the
  // overlay UI's red banner and is invisible from the terminal.
  const logToMain = (window as any).electronAPI?.logToMain;
  logToMain?.('info', `[LLM] call ${config.provider}/${config.model} (${messages.length} msgs)`);
  switch (config.provider) {
    // 2026-08-17 — providers reorganized into OAuth/Gateway and Direct
    // API buckets. The old `gateway_ollama` and `openclaw` keys were
    // internal routing abstractions and are no longer in the user-
    // facing dropdown (see OAUTH_PROVIDERS / DIRECT_PROVIDERS).
    case 'ollama_cloud':
      // Reuse callOllama — it already supports the :cloud model ids.
      return callOllama(messages, { ...config, endpoint: config.endpoint || 'https://api.ollama.com' });
    case 'ollama_local':
      // Local Ollama daemon. No key needed; uses ollamaEndpoint from
      // settings. Strip any :cloud suffix (a common copy-paste error).
      return callOllama(messages, { ...config, endpoint: config.endpoint || 'http://localhost:11434' });
    case 'openrouter':
      return callOpenRouter(messages, config);
    case 'featherless':
      return callGateway(messages, config);
    case 'anthropic':
      return callAnthropic(messages, config);
    case 'minimax':
      return callMiniMax(messages, config);
    case 'openai':
      return callOpenAI(messages, config);
    case 'gemini':
      return callGemini(messages, config);
    case 'qwen':
      return callQwen(messages, config);
    case 'glm':
      return callGLM(messages, config);
    case 'kimi':
      // Kimi uses an OpenAI-compatible endpoint at api.kimi.com.
      return callOpenAI(messages, {
        ...config,
        endpoint: config.endpoint || 'https://api.kimi.com/coding/v1/chat/completions',
      });
    case 'piapi':
      // PiAPI exposes gpt-4o-mini via an OpenAI-compatible endpoint.
      return callOpenAI(messages, {
        ...config,
        endpoint: config.endpoint || 'https://api.piapi.ai/api/v1/chat/completions',
      });
    case 'custom':
      return callCustomEndpoint(messages, config);
    // Back-compat: legacy providers (any string the user has stored
    // that isn't in the new taxonomy). The string cast is required
    // because TS narrows the union — runtime checks are fine.
    default: {
      // Legacy → new mapping
      const legacy = (config.provider as string) || '';
      if (legacy === 'gateway_ollama' || legacy === 'ollama') {
        return callOllama(messages, { ...config, endpoint: config.endpoint || 'https://api.ollama.com' });
      }
      if (legacy === 'openclaw') {
        return callOpenRouter(messages, config);
      }
      const err = new Error(`Unsupported provider: ${config.provider}`);
      logToMain?.('error', `[LLM] ${err.message}`);
      throw err;
    }
  }
}

// ── Streaming support ──
// Uses IPC streaming for Anthropic, falls back to non-streaming for other providers
export async function streamLLM(
  messages: Message[],
  config: LLMConfig,
  onChunk: (text: string) => void,
  onDone: (full: LLMResponse) => void
): Promise<void> {
  const api = (window as any).electronAPI;

  if (config.provider === 'anthropic' && api?.fetchStream) {
    // Stream through Electron main process IPC
    const systemMsg = messages.find((m) => m.role === 'system');
    const conversationMsgs = messages.filter((m) => m.role !== 'system');

    // Sanitize: drop empty content parts/blocks (issue 1.1 — Anthropic 400s otherwise)
    const anthropicMessages = conversationMsgs
      .map((m) => {
        if (typeof m.content === 'string') {
          const t = m.content.trim();
          return t ? { role: m.role, content: t } : null;
        }
        const parts = (m.content as ContentPart[])
          .map((part) => {
            if (part.type === 'text') {
              const t = (part.text || '').trim();
              return t ? { type: 'text' as const, text: t } : null;
            }
            if (part.type === 'image_url') {
              const dataUrl = part.image_url!.url;
              const base64Match = dataUrl.match(/^data:image\/(.*?);base64,(.*)$/);
              if (base64Match) {
                return {
                  type: 'image' as const,
                  source: {
                    type: 'base64' as const,
                    media_type: `image/${base64Match[1]}` as any,
                    data: base64Match[2],
                  },
                };
              }
              return null;
            }
            return null;
          })
          .filter((p): p is NonNullable<typeof p> => p !== null);
        return { role: m.role, content: parts };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .filter((m) => {
        if (typeof m.content === 'string') return m.content.trim().length > 0;
        return (m.content as any[]).length > 0;
      });

    if (anthropicMessages.length === 0) {
      throw new Error('Anthropic: all user messages were empty after sanitization');
    }

    let fullText = '';

    // Set up stream listeners
    const removeChunkListener = api.onStreamChunk((chunk: string) => {
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'content_block_delta' && data.delta?.text) {
              fullText += data.delta.text;
              onChunk(data.delta.text);
            }
          } catch {}
        }
      }
    });

    const donePromise = new Promise<void>((resolve) => {
      const removeDoneListener = api.onStreamDone(() => {
        removeDoneListener();
        resolve();
      });
    });

    const result = await api.fetchStream('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens || 4096,
        // `temperature` is deprecated on Opus 4.7+ / 4.8 / Sonnet 5 — omit it.
        system: systemMsg?.content || '',
        messages: anthropicMessages,
        stream: true,
      }),
    });

    if (!result.ok) {
      removeChunkListener();
      const errMsg = result.data?.error?.message || `HTTP ${result.status}`;
      throw new Error(`Anthropic Stream: ${errMsg}`);
    }

    await donePromise;
    removeChunkListener();

    onDone({
      text: fullText,
      provider: 'anthropic',
      model: config.model,
    });
  } else {
    // Non-streaming fallback — works for all providers
    const result = await callLLM(messages, config);
    onChunk(result.text);
    onDone(result);
  }
}

// ── Fallback model chain (P0 fix 1.6) ──
// If the primary provider errors out (rate limit, 400 empty content, network
// blip), automatically retry on a backup model. The user shouldn't have to
// manually swap providers mid-interview — Seun called this out in the test
// ("I need fall back, because if one agent no go reply, it will fall back
// to the other model"). Per Ade 2026-08-06 10:25 MDT: bundle with the P0
// fixes; Anthropic credits passed $1000 so we keep Anthropic as primary when
// possible but use MiniMax as the cheap insurance.
//
// Default fallback order: MiniMax M3 (1M context, cheap, fast) → Ollama cloud
// deepseek-v4-pro (free, no key needed if the ollama endpoint is configured).
// Tunable: pass `customFallbackChain` to override.

export interface FallbackStep {
  provider: LLMProvider;
  model: string;
  /** Provider key in apiKeys whose presence enables this fallback. Use
   *  'ollama' which is free and doesn't need a real key. */
  needsKey: 'minimax' | 'ollama' | 'ollama_cloud' | 'ollama_local' | 'openrouter' | 'featherless' | 'anthropic' | 'openai' | 'gemini' | 'qwen' | 'glm' | 'kimi' | 'piapi' | 'none';
  /** Custom endpoint override. For 'ollama' defaults to https://api.ollama.com. */
  endpoint?: string;
}

export const DEFAULT_FALLBACK_CHAIN: FallbackStep[] = [
  // 2026-08-17 P0 fix — wider ladder so ANY single-model failure
  // catches via the next. Order is cheapest/fastest-first within each
  // tier, then the free tier at the bottom. The Coding mode's screen
  // capture path uses a vision-capable model (qwen-vl-max or
  // gpt-4o-mini) so the vision read doesn't fail when the primary
  // happens to be a non-vision model.
  //
  // Tier 1 — cheap vision (Coding mode):
  { provider: 'qwen', model: 'qwen-vl-max', needsKey: 'qwen', endpoint: 'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions' },
  { provider: 'openai', model: 'gpt-4o-mini', needsKey: 'openai' },
  { provider: 'gemini', model: 'gemini-2.5-flash', needsKey: 'gemini' },
  // Tier 2 — frontier reasoning (Interview mode / solve step):
  { provider: 'minimax', model: 'MiniMax-M3', needsKey: 'minimax' },
  { provider: 'qwen', model: 'qwen-max', needsKey: 'qwen', endpoint: 'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions' },
  { provider: 'anthropic', model: 'claude-sonnet-5', needsKey: 'anthropic' },
  // Tier 3 — free:
  { provider: 'ollama_cloud', model: 'deepseek-v4-pro:cloud', needsKey: 'none', endpoint: 'https://api.ollama.com' },
];

/**
 * Call LLM with automatic fallback. Tries the primary config first; on any
 * thrown error, walks the fallback chain and returns the first success.
 * The full chain is logged so the user can see which provider actually
 * answered (the rendered answer doesn't say "I fell back" — the fallback is
 * transparent to the interviewer).
 */
export async function callLLMWithFallback(
  messages: Message[],
  primaryConfig: LLMConfig,
  apiKeys: Record<string, string> = {},
  customEndpoints: Record<string, string> = {},
  fallbackChain: FallbackStep[] = DEFAULT_FALLBACK_CHAIN
): Promise<LLMResponse> {
  try {
    return await callLLM(messages, primaryConfig);
  } catch (primaryError: any) {
    const primaryMsg = primaryError?.message || String(primaryError);
    console.warn(`[LLM] Primary ${primaryConfig.provider}/${primaryConfig.model} failed: ${primaryMsg}. Trying fallback chain.`);

    for (const step of fallbackChain) {
      // Skip if a required key is missing. Also look up under legacy
      // aliases (openclaw → openrouter, ollama → ollama_cloud) so
      // installs with old stored keys still work.
      if (step.needsKey !== 'none') {
        const key = apiKeys[step.needsKey]
          || (step.needsKey === 'openrouter' ? apiKeys['openclaw'] : '')
          || (step.needsKey === 'ollama_cloud' ? apiKeys['ollama'] : '');
        if (!key) {
          console.log(`[LLM] Skipping fallback ${step.provider}/${step.model} — no API key for ${step.needsKey}`);
          continue;
        }
      }
      // Don't retry on the same provider/model as the primary (and
      // account for legacy provider aliases).
      const primaryNorm = normalizeProvider(primaryConfig.provider);
      const stepNorm = normalizeProvider(step.provider);
      if (stepNorm === primaryNorm && step.model === primaryConfig.model) continue;

      const fallbackConfig: LLMConfig = {
        provider: step.provider,
        model: step.model,
        apiKey: step.needsKey === 'none'
          ? ''
          : (apiKeys[step.needsKey]
              || (step.needsKey === 'openrouter' ? apiKeys['openclaw'] : '')
              || (step.needsKey === 'ollama_cloud' ? apiKeys['ollama'] : '')),
        endpoint: step.endpoint || customEndpoints[step.provider] || undefined,
        temperature: primaryConfig.temperature,
        maxTokens: primaryConfig.maxTokens,
      };

      try {
        const result = await callLLM(messages, fallbackConfig);
        console.log(`[LLM] Fallback succeeded: ${step.provider}/${step.model}`);
        return result;
      } catch (fallbackError: any) {
        const msg = fallbackError?.message || String(fallbackError);
        console.warn(`[LLM] Fallback ${step.provider}/${step.model} also failed: ${msg}`);
      }
    }

    // All fallbacks failed — re-throw the primary error so the UI surfaces it
    throw new Error(`Primary ${primaryConfig.provider} failed: ${primaryMsg}. All ${fallbackChain.length} fallbacks also failed.`);
  }
}

/**
 * Streaming LLM with fallback. Tries to stream the primary (only Anthropic
 * is streamable via IPC today). If the stream errors out OR the primary is
 * non-Anthropic, falls back to non-streaming callLLMWithFallback so the user
 * still gets an answer — just delivered in one chunk.
 */
export async function streamLLMWithFallback(
  messages: Message[],
  primaryConfig: LLMConfig,
  apiKeys: Record<string, string> = {},
  customEndpoints: Record<string, string> = {},
  fallbackChain: FallbackStep[] = DEFAULT_FALLBACK_CHAIN,
  onChunk: (text: string) => void,
  onDone: (full: LLMResponse) => void
): Promise<void> {
  const api = (window as any).electronAPI;

  // Only Anthropic is streamable; everything else is non-streaming.
  if (primaryConfig.provider === 'anthropic' && api?.fetchStream) {
    try {
      await streamLLM(messages, primaryConfig, onChunk, onDone);
      return;
    } catch (streamError: any) {
      const msg = streamError?.message || String(streamError);
      console.warn(`[LLM] Anthropic stream failed: ${msg}. Falling back to non-streaming chain.`);
      // Fall through to non-streaming path
    }
  }

  // Non-streaming path: primary + fallback chain.
  const result = await callLLMWithFallback(messages, primaryConfig, apiKeys, customEndpoints, fallbackChain);
  onChunk(result.text);
  onDone(result);
}
