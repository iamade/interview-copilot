// ── Multi-Provider LLM Service ──
// All API calls route through Electron's main process via IPC to bypass CORS.
// The main process makes the actual HTTP requests from Node.js (no CORS restrictions).

export type LLMProvider =
  | 'gateway_ollama'    // routes through OpenClaw gateway → ollama/deepseek-v4-pro:cloud
  | 'featherless'       // routes through OpenClaw gateway → featherless tier
  | 'anthropic'         // Claude (api.anthropic.com)
  | 'minimax'           // MiniMax (api.minimax.io) — direct, OpenAI-compatible
  | 'openai'            // OpenAI (api.openai.com) — OpenAI-compatible
  | 'gemini'            // Google Gemini (generativelanguage.googleapis.com) — native API
  | 'ollama'            // Ollama Cloud (ollama.com) — OpenAI-compatible
  | 'ollama2'           // Ollama Cloud alt key (ollama.com) — OpenAI-compatible
  | 'openclaw'          // OpenClaw (via OpenRouter)
  | 'openrouter'        // OpenRouter direct
  | 'glm'               // GLM via Zhipu (open.bigmodel.cn) — OpenAI-compatible
  | 'zai'               // GLM via Z.AI (api.z.ai) — OpenAI-compatible
  | 'kimi-code'         // Kimi direct (api.kimi.com) — OpenAI-compatible
  | 'piapi'             // PiAPI (api.piapi.ai) — OpenAI-compatible
  | 'qwen'              // Aliyun DashScope / Qwen Token Plan (OpenAI-compatible)
  | 'dashscope'         // Aliyun regular DashScope (BROKEN for sk-sp-... keys) — kept for completeness
  | 'custom';

// OpenClaw gateway (OpenAI-compatible) running locally on the Mac.
export const OPENCLAW_GATEWAY_ENDPOINT = 'http://localhost:18789/v1/chat/completions';

// Qwen (Aliyun DashScope / Token Plan) — OpenAI-compatible chat completions.
// The Token Plan endpoint is the only one that accepts Ade's sk-sp-... PAYG keys;
// the regular DashScope endpoint (dashscope-intl.aliyuncs.com) returns 401 for those.
export const DEFAULT_QWEN_ENDPOINT = 'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1';

// DashScope (regular Aliyun, OpenAI-compatible) — for non-PAYG keys. Returns 401 for sk-sp-... keys.
export const DEFAULT_DASHSCOPE_ENDPOINT = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

// MiniMax — OpenAI-compatible chat completions at api.minimax.io/v1.
// Override with the `minimaxEndpoint` setting if MiniMax ever moves hostnames.
export const MINIMAX_API_ENDPOINT = 'https://api.minimax.io/v1/chat/completions';

// Ollama Cloud (OpenAI-compatible)
export const DEFAULT_OLLAMA_ENDPOINT = 'https://ollama.com/v1';

// Google Gemini (native API, not OpenAI-compatible)
export const DEFAULT_GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';

// GLM via Z.AI (OpenAI-compatible, ZAI's coding endpoint)
export const DEFAULT_ZAI_ENDPOINT = 'https://api.z.ai/api/coding/paas/v4';

// Kimi Code (OpenAI-compatible)
export const DEFAULT_KIMI_ENDPOINT = 'https://api.kimi.com/coding/v1';

// PiAPI (OpenAI-compatible)
export const DEFAULT_PIAPI_ENDPOINT = 'https://api.piapi.ai/v1';

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
  gateway_ollama: {
    label: 'Ollama Cloud + MiniMax (default · via OpenClaw)',
    // All ids MUST carry the :cloud suffix — bare names route to a local Ollama daemon.
    // MiniMax models use native MiniMax API (not Ollama relay).
    models: [
      { id: 'minimax/MiniMax-M3', name: 'MiniMax M3 (1M context · frontier)' },
      { id: 'minimax/MiniMax-M2.7-highspeed', name: 'MiniMax M2.7 Highspeed (fast)' },
      { id: 'minimax/MiniMax-M2.7', name: 'MiniMax M2.7 (reasoning)' },
      { id: 'ollama/deepseek-v4-pro:cloud', name: 'DeepSeek V4 Pro (cloud)' },
      { id: 'ollama/qwen3.5:397b-cloud', name: 'Qwen 3.5 397B (cloud)' },
      { id: 'ollama/minimax-m3:cloud', name: 'MiniMax M3 (Ollama relay)' },
      { id: 'ollama/kimi-k2.6:cloud', name: 'Kimi K2.6 (cloud)' },
    ],
  },
  featherless: {
    label: 'Featherless (via OpenClaw)',
    models: [
      { id: 'featherless/zai-org/GLM-5.1-FP8', name: 'GLM 5.1 FP8' },
      { id: 'featherless/meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B' },
    ],
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    models: [
      { id: 'claude-fable-5', name: 'Claude Fable 5 (Frontier)' },
      // Claude Opus 5 — released 2026-07-24, current flagship workhorse at $5/$25.
      { id: 'claude-opus-5', name: 'Claude Opus 5 (Latest · 1M ctx · flagship)' },
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8' },
      { id: 'claude-opus-4-7', name: 'Claude Opus 4.7' },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
      { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5' },
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5 (Fast)' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5 (Fastest)' },
    ],
  },
  minimax: {
    label: 'MiniMax (direct · OpenAI-compatible)',
    // Direct hits to api.minimax.io — no gateway needed.
    // MiniMax-M3 is the frontier 1M-context model; M2.7-highspeed is the fast tier.
    models: [
      { id: 'MiniMax-M3', name: 'MiniMax M3 (1M context · frontier)' },
      { id: 'MiniMax-M2.7-highspeed', name: 'MiniMax M2.7 Highspeed' },
      { id: 'MiniMax-M2.7', name: 'MiniMax M2.7 (reasoning)' },
      { id: 'MiniMax-M2.1-highspeed', name: 'MiniMax M2.1 Highspeed' },
      { id: 'MiniMax-M2.1', name: 'MiniMax M2.1' },
      { id: 'MiniMax-M2', name: 'MiniMax M2' },
    ],
  },
  openai: {
    label: 'OpenAI',
    models: [
      { id: 'gpt-5.4', name: 'GPT-5.4 Codex (Latest)' },
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'o3', name: 'o3 (Reasoning)' },
    ],
  },
  gemini: {
    label: 'Google Gemini',
    // Verified live against Tobi's GOOGLE_API_KEY (2026-08-11 21:00 MDT).
    // All 5 models from Tobi's google provider in ~/.openclaw/openclaw.json.
    models: [
      { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview' },
      { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite' },
      { id: 'gemini-3.1-flash-image-preview', name: 'Nano Banana 2 (Flash Image)' },
      { id: 'gemini-3-pro-image-preview', name: 'Nano Banana Pro' },
    ],
  },
  ollama: {
    label: 'Ollama Cloud (free · OLLAMA_API_KEY from tobi .env)',
    // 11 models from Tobi's ollama provider — all free, OpenAI-compatible at https://ollama.com/v1.
    // Default endpoint in DEFAULT_OLLAMA_ENDPOINT below.
    models: [
      { id: 'qwen2.5vl:7b', name: 'Qwen 2.5 VL 7B' },
      { id: 'qwen3-vl:235b-cloud', name: 'Qwen3 VL 235B Cloud' },
      { id: 'glm-5.1:cloud', name: 'GLM 5.1 Cloud' },
      { id: 'glm-5.2:cloud', name: 'GLM 5.2 Cloud' },
      { id: 'deepseek-v4-pro:cloud', name: 'DeepSeek V4 Pro Cloud (1M ctx)' },
      { id: 'qwen3.5:397b-cloud', name: 'Qwen 3.5 397B Cloud' },
      { id: 'kimi-k2.6:cloud', name: 'Kimi K2.6 Cloud' },
      { id: 'kimi-k2.7-code:cloud', name: 'Kimi K2.7 Code Cloud' },
      { id: 'kimi-k3:cloud', name: 'Kimi K3 Cloud' },
      { id: 'nemotron-3-ultra:cloud', name: 'Nemotron 3 Ultra Cloud' },
      { id: 'minimax-m3:cloud', name: 'MiniMax M3 Cloud' },
    ],
  },
  ollama2: {
    label: 'Ollama Cloud (alt key · OLLAMA_OPENCLAW_AGENTS_API_KEY_2)',
    // Same 11 models as ollama, but using the second key from Tobi's .env.
    // Useful for parallel requests, key rotation, or splitting quota.
    models: [
      { id: 'qwen2.5vl:7b', name: 'Qwen 2.5 VL 7B' },
      { id: 'qwen3-vl:235b-cloud', name: 'Qwen3 VL 235B Cloud' },
      { id: 'glm-5.1:cloud', name: 'GLM 5.1 Cloud' },
      { id: 'glm-5.2:cloud', name: 'GLM 5.2 Cloud' },
      { id: 'deepseek-v4-pro:cloud', name: 'DeepSeek V4 Pro Cloud (1M ctx)' },
      { id: 'qwen3.5:397b-cloud', name: 'Qwen 3.5 397B Cloud' },
      { id: 'kimi-k2.6:cloud', name: 'Kimi K2.6 Cloud' },
      { id: 'kimi-k2.7-code:cloud', name: 'Kimi K2.7 Code Cloud' },
      { id: 'kimi-k3:cloud', name: 'Kimi K3 Cloud' },
      { id: 'nemotron-3-ultra:cloud', name: 'Nemotron 3 Ultra Cloud' },
      { id: 'minimax-m3:cloud', name: 'MiniMax M3 Cloud' },
    ],
  },
  zai: {
    label: 'Z.AI (GLM coding endpoint · ZAI_API_KEY)',
    // 4 models from Tobi's zai provider — OpenAI-compatible at https://api.z.ai/api/coding/paas/v4.
    // Default endpoint in DEFAULT_ZAI_ENDPOINT below.
    models: [
      { id: 'glm-5.2', name: 'GLM 5.2 (ZAI)' },
      { id: 'glm-5.1', name: 'GLM 5.1 (ZAI)' },
      { id: 'glm-5v-turbo', name: 'GLM 5V Turbo (vision · ZAI)' },
      { id: 'glm-4.6v-flash', name: 'GLM 4.6V Flash (vision · ZAI)' },
    ],
  },
  'kimi-code': {
    label: 'Kimi Code direct (KIMI_API_KEY_MAC_OPENCLAW)',
    // 2 models from Tobi's kimi-code provider — OpenAI-compatible at https://api.kimi.com/coding/v1.
    // Default endpoint in DEFAULT_KIMI_ENDPOINT below.
    models: [
      { id: 'k3', name: 'Kimi K3 (Allegretto · 1M ctx)' },
      { id: 'kimi-for-coding-highspeed', name: 'Kimi Code HighSpeed' },
    ],
  },
  piapi: {
    label: 'PiAPI (PIAPI_KEY_FOR_TOBI)',
    // 5 models from Tobi's piapi provider — OpenAI-compatible at https://api.piapi.ai/v1.
    // PAYG; has per-model cost ($2.25-$18.75/M). Default endpoint in DEFAULT_PIAPI_ENDPOINT.
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (PiAPI · $2.25/$11.25)' },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6 (PiAPI · $3.75/$18.75)' },
      { id: 'gpt-5.2', name: 'GPT 5.2 (PiAPI)' },
      { id: 'gpt-4.1', name: 'GPT 4.1 (PiAPI)' },
      { id: 'gpt-4o-mini', name: 'GPT 4o Mini (PiAPI)' },
    ],
  },
  glm: {
    label: 'GLM (Zhipu AI · direct)',
    models: [
      { id: 'glm-5.1', name: 'GLM 5.1' },
      { id: 'glm-4-plus', name: 'GLM 4 Plus' },
    ],
  },
  qwen: {
    label: 'Qwen (Aliyun DashScope · Token Plan)',
    // 10 models from Tobi's qwen provider — OpenAI-compatible at the Token Plan endpoint.
    // Model names use dots (qwen3.8-max, qwen3.7-max) — verified live 2026-08-11 20:50 MDT
    // against Ade's sk-sp-... PAYG key. Default endpoint in DEFAULT_QWEN_ENDPOINT.
    models: [
      { id: 'qwen3.8-max', name: 'Qwen 3.8 Max (frontier · 1M ctx)' },
      { id: 'qwen3.7-max', name: 'Qwen 3.7 Max' },
      { id: 'qwen3.7-plus', name: 'Qwen 3.7 Plus' },
      { id: 'qwen3.7-flash', name: 'Qwen 3.7 Flash' },
      { id: 'qwen-coder-plus', name: 'Qwen Coder Plus' },
      { id: 'glm-5.2', name: 'GLM 5.2 (QwenCloud)' },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro (QwenCloud)' },
      { id: 'deepseek-v4-flash-0731', name: 'DeepSeek V4 Flash (QwenCloud)' },
    ],
  },
  dashscope: {
    label: 'DashScope (regular · BROKEN for sk-sp-... keys)',
    // Kept for completeness. The regular DashScope endpoint returns 401 for Ade's
    // sk-sp-... PAYG keys — use the 'qwen' provider (Token Plan) instead.
    // Default endpoint in DEFAULT_DASHSCOPE_ENDPOINT below.
    models: [
      { id: 'qwen3.7-max', name: 'Qwen 3.7 Max (DashScope)' },
      { id: 'qwen3.7-plus', name: 'Qwen 3.7 Plus (DashScope)' },
      { id: 'qwen3.6-flash', name: 'Qwen 3.6 Flash (DashScope)' },
    ],
  },
  openclaw: {
    label: 'OpenClaw (via OpenRouter)',
    models: [
      { id: 'auto', name: 'OpenRouter Auto (Smart Routing)' },
      { id: 'openrouter/hunter-alpha', name: 'Hunter Alpha (Reasoning)' },
      { id: 'openrouter/healer-alpha', name: 'Healer Alpha (Vision)' },
    ],
  },
  openrouter: {
    label: 'OpenRouter',
    models: [
      { id: 'auto', name: 'Auto (Smart Routing)' },
      { id: 'anthropic/claude-opus-4-6', name: 'Claude Opus 4.6' },
      { id: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'openai/gpt-4o', name: 'GPT-4o' },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1' },
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
    ],
  },
  custom: {
    label: 'Custom Endpoint',
    models: [
      { id: 'custom', name: 'Custom Model' },
    ],
  },
};

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
  return {
    text: data.message?.content || '',
    provider: 'ollama',
    model: config.model,
    tokensUsed: data.eval_count,
  };
}

// ── Ollama Cloud (alt key · ollama2) ──
// Same protocol as ollama, but uses the OLLAMA_OPENCLAW_AGENTS_API_KEY_2
// (Tobi's second key) for parallel/rotation use cases.
async function callOllama2(messages: Message[], config: LLMConfig): Promise<LLMResponse> {
  const endpoint = config.endpoint || DEFAULT_OLLAMA_ENDPOINT;
  const result = await callOllama(messages, { ...config, endpoint });
  return { ...result, provider: 'ollama2' };
}

// ── Google Gemini (native API, not OpenAI-compatible) ──
// Endpoint: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}
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
    `${DEFAULT_GEMINI_ENDPOINT}/models/${config.model}:generateContent?key=${config.apiKey}`,
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

  if (data.error) throw new Error(`Gemini: ${data.error.message || data.error}`);
  return {
    text: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
    provider: 'gemini',
    model: config.model,
    tokensUsed: data.usageMetadata?.candidatesTokenCount,
  };
}

// ── GLM via Z.AI (OpenAI-compatible) ──
// Endpoint: https://api.z.ai/api/coding/paas/v4/chat/completions
async function callZAI(messages: Message[], config: LLMConfig): Promise<LLMResponse> {
  const endpoint = config.endpoint || DEFAULT_ZAI_ENDPOINT;
  const data = await corsFetch(`${endpoint}/chat/completions`, {
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

  if (data.error) throw new Error(`Z.AI: ${data.error.message || JSON.stringify(data.error)}`);
  return {
    text: data.choices?.[0]?.message?.content || '',
    provider: 'zai',
    model: config.model,
    tokensUsed: data.usage?.completion_tokens,
  };
}

// ── Kimi Code direct (OpenAI-compatible) ──
// Endpoint: https://api.kimi.com/coding/v1/chat/completions
async function callKimiCode(messages: Message[], config: LLMConfig): Promise<LLMResponse> {
  const endpoint = config.endpoint || DEFAULT_KIMI_ENDPOINT;
  const data = await corsFetch(`${endpoint}/chat/completions`, {
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

  if (data.error) throw new Error(`Kimi: ${data.error.message || JSON.stringify(data.error)}`);
  return {
    text: data.choices?.[0]?.message?.content || '',
    provider: 'kimi-code',
    model: config.model,
    tokensUsed: data.usage?.completion_tokens,
  };
}

// ── PiAPI (OpenAI-compatible, PAYG) ──
// Endpoint: https://api.piapi.ai/v1/chat/completions
async function callPiAPI(messages: Message[], config: LLMConfig): Promise<LLMResponse> {
  const endpoint = config.endpoint || DEFAULT_PIAPI_ENDPOINT;
  const data = await corsFetch(`${endpoint}/chat/completions`, {
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

  if (data.error) throw new Error(`PiAPI: ${data.error.message || JSON.stringify(data.error)}`);
  return {
    text: data.choices?.[0]?.message?.content || '',
    provider: 'piapi',
    model: config.model,
    tokensUsed: data.usage?.completion_tokens,
  };
}

// ── DashScope (regular Aliyun, OpenAI-compatible) ──
// BROKEN for sk-sp-... PAYG keys (returns 401). Kept for completeness —
// use the 'qwen' provider (Token Plan endpoint) instead.
// Endpoint: https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions
async function callDashScope(messages: Message[], config: LLMConfig): Promise<LLMResponse> {
  const endpoint = config.endpoint || DEFAULT_DASHSCOPE_ENDPOINT;
  const data = await corsFetch(`${endpoint}/chat/completions`, {
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

  if (data.error) throw new Error(`DashScope: ${data.error.message || JSON.stringify(data.error)}`);
  return {
    text: data.choices?.[0]?.message?.content || '',
    provider: 'dashscope',
    model: config.model,
    tokensUsed: data.usage?.completion_tokens,
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

// ── Qwen (Aliyun DashScope / Token Plan, OpenAI-compatible) ──
// Ade's sk-sp-... PAYG key only works against the Token Plan endpoint
// (token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1).
// The regular DashScope endpoint (dashscope-intl.aliyuncs.com) returns 401
// for those keys — the baseUrl fix per Tobi 00:47 MDT Aug 11 is the only path.
async function callQwen(messages: Message[], config: LLMConfig): Promise<LLMResponse> {
  const endpoint = config.endpoint || DEFAULT_QWEN_ENDPOINT;

  if (!config.apiKey) {
    throw new Error('Qwen: API key is required (set QWEN_API_KEY in .env, or it auto-loads from DIRECT_QWEN_MAC_VPS_OPENCLAW_KEY in ~/.openclaw/.env)');
  }

  const data = await corsFetch(`${endpoint}/chat/completions`, {
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
      temperature: config.temperature ?? 0.3,
      stream: false,
    }),
  });

  if (data.error) {
    const msg = data.error?.message || data.error || JSON.stringify(data.error);
    throw new Error(`Qwen: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }

  return {
    text: data.choices?.[0]?.message?.content || '',
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
    provider: 'openclaw',
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
  switch (config.provider) {
    case 'gateway_ollama':
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
    case 'ollama':
      return callOllama(messages, config);
    case 'ollama2':
      return callOllama2(messages, config);
    case 'glm':
      return callGLM(messages, config);
    case 'zai':
      return callZAI(messages, config);
    case 'kimi-code':
      return callKimiCode(messages, config);
    case 'piapi':
      return callPiAPI(messages, config);
    case 'qwen':
      return callQwen(messages, config);
    case 'dashscope':
      return callDashScope(messages, config);
    case 'openclaw':
      return callOpenClaw(messages, config);
    case 'openrouter':
      return callOpenRouter(messages, config);
    case 'custom':
      return callCustomEndpoint(messages, config);
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

// ── Streaming support ──
// Per Ade 21:27 MDT Aug 11: latency P0 — extend streaming to ALL OpenAI-
// compatible providers, not just Anthropic. Without this, every non-
// Anthropic call (qwen, MiniMax, Ollama, ZAI, Kimi, Gemini-compatible,
// OpenAI, OpenRouter, PiAPI, etc.) blocked the UI for 1-3 minutes waiting
// on a single JSON response. With streaming, the user sees the first
// token in <1s and the answer fills in word-by-word, just like the Anthropic
// path. Same `fetch:stream` IPC handles all SSE — the only change is the
// parse loop and the per-provider endpoint/header map.
//
// The fallback chain (`streamLLMWithFallback`) now tries each step with
// streaming. If the primary errors (auth, 429, model-not-found), we move
// to the next step WITHOUT abandoning the partial stream — the user
// still gets a streamed answer, just from a different provider. Last
// resort is non-streaming `callLLMWithFallback` so the user is never
// left without an answer.

// Provider → OpenAI-compatible SSE capability
function isOpenAICompatibleProvider(p: LLMProvider): boolean {
  return [
    'qwen', 'minimax', 'ollama', 'ollama2', 'zai', 'kimi-code', 'piapi',
    'openai', 'openrouter', 'openclaw', 'gateway_ollama', 'featherless',
    'glm', 'dashscope', 'custom',
  ].includes(p);
}

// Provider → (url, headers) for OpenAI-compatible /chat/completions
function buildOpenAIEndpoint(config: LLMConfig): { url: string; headers: Record<string, string> } {
  const url = (ep: string) => ep.replace(/\/$/, '') + '/chat/completions';
  const json = (extra: Record<string, string> = {}): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    ...extra,
  });

  switch (config.provider) {
    case 'qwen':
      return { url: url(config.endpoint || DEFAULT_QWEN_ENDPOINT), headers: json() };
    case 'minimax':
      return { url: url(config.endpoint || MINIMAX_API_ENDPOINT), headers: json() };
    case 'ollama':
    case 'ollama2':
      // Use the OpenAI-compatible /v1/chat/completions at ollama.com (DEFAULT_OLLAMA_ENDPOINT).
      // The native /api/chat path is non-streaming only — for streaming we need the OAI shape.
      return { url: url(config.endpoint || DEFAULT_OLLAMA_ENDPOINT), headers: json() };
    case 'zai':
      return { url: url(config.endpoint || DEFAULT_ZAI_ENDPOINT), headers: json() };
    case 'kimi-code':
      return { url: url(config.endpoint || DEFAULT_KIMI_ENDPOINT), headers: json() };
    case 'piapi':
      return { url: url(config.endpoint || DEFAULT_PIAPI_ENDPOINT), headers: json() };
    case 'openai':
      return { url: 'https://api.openai.com/v1/chat/completions', headers: json() };
    case 'openrouter':
      return {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers: json({ 'HTTP-Referer': 'https://interview-copilot.app', 'X-Title': 'Interview Copilot' }),
      };
    case 'openclaw':
      return {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers: json({ 'HTTP-Referer': 'https://interview-copilot.app', 'X-Title': 'Interview Copilot' }),
      };
    case 'gateway_ollama':
    case 'featherless':
      return { url: (config.endpoint || OPENCLAW_GATEWAY_ENDPOINT).replace(/\/$/, ''), headers: json() };
    case 'glm':
      return { url: url(config.endpoint || 'https://open.bigmodel.cn/api/paas/v4'), headers: json() };
    case 'dashscope':
      return { url: url(config.endpoint || DEFAULT_DASHSCOPE_ENDPOINT), headers: json() };
    case 'custom':
      if (!config.endpoint) throw new Error('Custom provider: endpoint is required');
      return { url: config.endpoint.replace(/\/$/, ''), headers: json() };
    default:
      throw new Error(`No OpenAI-compatible endpoint mapping for provider: ${config.provider}`);
  }
}

// OpenAI-compatible SSE stream parse loop. Each `data: {...}` line carries
// `choices[0].delta.content` (not `message.content` — that key is non-streaming).
// Last meaningful line is `data: [DONE]`. We ignore anything that doesn't
// parse (keep-alive pings, comments, etc.) so a misbehaving provider can't
// crash the stream.
//
// MiniMax-specific: M3 reasoning models emit <think>…</think> blocks as
// part of the streamed content. We strip them IN-FLIGHT so the user never
// sees the chain-of-thought. The stripping is stateful across chunk
// boundaries (`<think>` may open in one chunk and `</think>` in the next).
async function streamOpenAICompatible(
  messages: Message[],
  config: LLMConfig,
  onChunk: (text: string) => void
): Promise<{ fullText: string }> {
  const api = (window as any).electronAPI;
  if (!api?.fetchStream) throw new Error('Streaming IPC unavailable (electronAPI.fetchStream missing)');

  const openaiMessages = messages.map((m) => ({
    role: m.role,
    content:
      typeof m.content === 'string'
        ? m.content
        : (m.content as ContentPart[]).map((p) => p.text || '').join('\n'),
  }));

  const stripThink = (s: string) =>
    s
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<\/?think>/gi, '');

  let fullText = '';
  let insideThink = false; // MiniMax M3 stateful <think>…</think> tracking
  let firstTokenAt: number | null = null;
  const startedAt = Date.now();

  // Strip <think>…</think> blocks across chunk boundaries.
  // Returns the visible text and updates `insideThink` state.
  const filterThink = (raw: string): string => {
    if (config.provider !== 'minimax') return raw;

    let visible = '';
    let i = 0;
    while (i < raw.length) {
      if (insideThink) {
        const close = raw.indexOf('</think>', i);
        if (close === -1) {
          // Still inside think; consume rest of chunk
          i = raw.length;
        } else {
          insideThink = false;
          i = close + '</think>'.length;
        }
      } else {
        const open = raw.indexOf('<think>', i);
        if (open === -1) {
          visible += raw.slice(i);
          i = raw.length;
        } else {
          visible += raw.slice(i, open);
          const close = raw.indexOf('</think>', open);
          if (close === -1) {
            insideThink = true;
            i = raw.length;
          } else {
            i = close + '</think>'.length;
          }
        }
      }
    }
    return visible;
  };

  const removeChunkListener = api.onStreamChunk((chunk: string) => {
    const lines = chunk.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const data = JSON.parse(payload);
        // OpenAI shape: choices[0].delta.content
        // Some providers (Ollama OAI-compat) use message.content on a non-delta chunk
        const delta =
          data.choices?.[0]?.delta?.content ??
          data.choices?.[0]?.message?.content ??
          '';
        if (delta) {
          if (firstTokenAt === null) firstTokenAt = Date.now();
          const visible = filterThink(String(delta));
          if (visible) {
            fullText += visible;
            onChunk(visible);
          }
        }
      } catch {
        // Ignore parse errors (keep-alive, comments, etc.)
      }
    }
  });

  const donePromise = new Promise<void>((resolve) => {
    const removeDoneListener = api.onStreamDone(() => {
      removeDoneListener();
      resolve();
    });
  });

  const { url, headers } = buildOpenAIEndpoint(config);
  const result = await api.fetchStream(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: openaiMessages,
      max_tokens: config.maxTokens || 4096,
      // Anthropic/Claude rejects temperature on Opus 4.7+ / Sonnet 5; OpenAI-compatible
      // providers vary. Default to 0.3 unless the caller set something else.
      ...(config.provider !== 'anthropic' ? { temperature: config.temperature ?? 0.3 } : {}),
      stream: true,
    }),
  });

  if (!result.ok) {
    removeChunkListener();
    const errMsg = result.data?.error?.message || (typeof result.data === 'string' ? result.data : null) || `HTTP ${result.status}`;
    throw new Error(`Stream (${config.provider}/${config.model}): ${errMsg}`);
  }

  await donePromise;
  removeChunkListener();

  const totalMs = Date.now() - startedAt;
  const ttftMs = firstTokenAt ? firstTokenAt - startedAt : null;
  console.log(
    `[LLM] ${config.provider}/${config.model} streamed in ${totalMs}ms ` +
    `(TTFT ${ttftMs !== null ? ttftMs + 'ms' : 'n/a'}, ${fullText.length} chars)`
  );

  return { fullText: fullText.trim() };
}

// Anthropic SSE stream parse loop. Extracted from the original
// `streamLLM` so the dispatch logic is clean.
async function streamAnthropic(
  messages: Message[],
  config: LLMConfig,
  onChunk: (text: string) => void
): Promise<{ fullText: string }> {
  const api = (window as any).electronAPI;
  if (!api?.fetchStream) throw new Error('Streaming IPC unavailable (electronAPI.fetchStream missing)');

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
  let firstTokenAt: number | null = null;
  const startedAt = Date.now();

  const removeChunkListener = api.onStreamChunk((chunk: string) => {
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'content_block_delta' && data.delta?.text) {
            if (firstTokenAt === null) firstTokenAt = Date.now();
            fullText += data.delta.text;
            onChunk(data.delta.text);
          }
        } catch {
          // Ignore parse errors
        }
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

  const totalMs = Date.now() - startedAt;
  const ttftMs = firstTokenAt ? firstTokenAt - startedAt : null;
  console.log(
    `[LLM] anthropic/${config.model} streamed in ${totalMs}ms ` +
    `(TTFT ${ttftMs !== null ? ttftMs + 'ms' : 'n/a'}, ${fullText.length} chars)`
  );

  return { fullText };
}

// ── Public streaming entry point ──
// Tries to stream the request. Throws on failure so the caller (the
// fallback chain) can try the next provider. Falls back to non-streaming
// ONLY if the streaming IPC itself is unavailable — in that case there's
// no point in the chain trying to stream either.
export async function streamLLM(
  messages: Message[],
  config: LLMConfig,
  onChunk: (text: string) => void,
  onDone: (full: LLMResponse) => void
): Promise<void> {
  const api = (window as any).electronAPI;

  if (!api?.fetchStream) {
    // IPC streaming not exposed — fall back to a single-shot non-streaming call.
    const result = await callLLM(messages, config);
    onChunk(result.text);
    onDone(result);
    return;
  }

  if (config.provider === 'anthropic') {
    const { fullText } = await streamAnthropic(messages, config, onChunk);
    onDone({ text: fullText, provider: 'anthropic', model: config.model });
    return;
  }

  if (isOpenAICompatibleProvider(config.provider)) {
    const { fullText } = await streamOpenAICompatible(messages, config, onChunk);
    onDone({ text: fullText, provider: config.provider, model: config.model });
    return;
  }

  // Non-streaming-capable providers (e.g. Gemini native API) — single shot.
  const result = await callLLM(messages, config);
  onChunk(result.text);
  onDone(result);
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
   *  'none' (e.g. ollama when it accepts anon) or a specific key id. */
  needsKey:
    | 'anthropic' | 'minimax' | 'openai' | 'gemini' | 'ollama' | 'ollama2'
    | 'openrouter' | 'openclaw' | 'gateway' | 'featherless'
    | 'qwen' | 'glm' | 'zai' | 'kimi-code' | 'piapi' | 'dashscope'
    | 'none';
  /** Custom endpoint override. Falls back to provider's DEFAULT_*_ENDPOINT. */
  endpoint?: string;
}

// Comprehensive fallback ladder — covers Tobi's full provider set (~50 models).
// Per Ade 21:02 MDT Aug 11: START with qwen (Ade's preferred), THEN minimax.
// Then walk through every provider in Tobi's ladder, ordered roughly by
// reliability/cost. Each step tries the provider's best/fastest model.
// 'ollama' is `needsKey: 'none'` because the OLLAMA_API_KEY is auto-loaded
// from Tobi's .env, and ollama cloud accepts a wide range of free models.
export const DEFAULT_FALLBACK_CHAIN: FallbackStep[] = [
  // 1. Qwen (Ade's preferred start — Token Plan endpoint, works with PAYG keys)
  { provider: 'qwen', model: 'qwen3.8-max', needsKey: 'qwen' },
  // 2. MiniMax (Ade's 2nd preferred — direct, frontier 1M ctx)
  { provider: 'minimax', model: 'MiniMax-M3', needsKey: 'minimax' },
  // 3. Ollama Cloud (free, auto-loaded OLLAMA_API_KEY, 11 models)
  { provider: 'ollama', model: 'deepseek-v4-pro:cloud', needsKey: 'none' },
  // 4. Z.AI (GLM coding endpoint, free-ish)
  { provider: 'zai', model: 'glm-5.2', needsKey: 'zai' },
  // 5. Kimi Code (direct, 1M ctx)
  { provider: 'kimi-code', model: 'k3', needsKey: 'kimi-code' },
  // 6. Google Gemini (GOOGLE_API_KEY auto-loaded)
  { provider: 'gemini', model: 'gemini-3.5-flash', needsKey: 'gemini' },
  // 7. Ollama alt key (parallel/rotation)
  { provider: 'ollama2', model: 'kimi-k3:cloud', needsKey: 'ollama2' },
  // 8. GLM direct (Zhipu AI, smaller scope)
  { provider: 'glm', model: 'glm-5.1', needsKey: 'glm' },
  // 9. Anthropic (last before paid — credit issues)
  { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', needsKey: 'anthropic' },
  // 10. OpenAI (OAuth)
  { provider: 'openai', model: 'gpt-5.5', needsKey: 'openai' },
  // 11. OpenRouter
  { provider: 'openrouter', model: 'auto', needsKey: 'openrouter' },
  // 12. PiAPI (PAYG — last resort, has cost)
  { provider: 'piapi', model: 'gpt-4o-mini', needsKey: 'piapi' },
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
      // Skip if a required key is missing
      if (step.needsKey !== 'none') {
        const key = apiKeys[step.needsKey] || (step.needsKey === 'gateway' ? apiKeys['openclaw'] : '');
        if (!key) {
          console.log(`[LLM] Skipping fallback ${step.provider}/${step.model} — no API key for ${step.needsKey}`);
          continue;
        }
      }
      // Don't retry on the same provider/model as the primary
      if (step.provider === primaryConfig.provider && step.model === primaryConfig.model) continue;

      const fallbackConfig: LLMConfig = {
        provider: step.provider,
        model: step.model,
        apiKey: step.needsKey === 'none' ? '' : (apiKeys[step.needsKey] || (step.needsKey === 'gateway' ? apiKeys['openclaw'] : '')),
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
 * Streaming LLM with fallback. Tries to STREAM the primary first. If the
 * stream errors out (auth, rate limit, model not found, network blip),
 * walks the fallback chain — each step also attempts to stream, so the
 * user still gets a token-by-token answer from the next viable model.
 *
 * Last resort is non-streaming `callLLMWithFallback` so the user is never
 * left without an answer. The user sees the first token in <1s for any
 * provider that supports streaming.
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
  // 1. Try streaming the primary config
  try {
    await streamLLM(messages, primaryConfig, onChunk, onDone);
    return;
  } catch (primaryErr: any) {
    const primaryMsg = primaryErr?.message || String(primaryErr);
    console.warn(
      `[LLM] Primary ${primaryConfig.provider}/${primaryConfig.model} stream failed: ${primaryMsg}. ` +
      `Walking fallback chain (${fallbackChain.length} steps).`
    );
  }

  // 2. Walk the fallback chain with streaming. Each step is best-effort;
  // a single bad step (e.g. 401 on a stale key) should not abort the
  // whole chain — move on to the next viable provider.
  for (const step of fallbackChain) {
    // Don't re-attempt the same provider/model as the primary
    if (step.provider === primaryConfig.provider && step.model === primaryConfig.model) {
      continue;
    }

    // Skip if a required key is missing
    if (step.needsKey !== 'none') {
      const key = apiKeys[step.needsKey] || (step.needsKey === 'gateway' ? apiKeys['openclaw'] : '');
      if (!key) {
        console.log(`[LLM] Skipping fallback ${step.provider}/${step.model} — no API key for ${step.needsKey}`);
        continue;
      }
    }

    const fallbackConfig: LLMConfig = {
      provider: step.provider,
      model: step.model,
      apiKey: step.needsKey === 'none' ? '' : (apiKeys[step.needsKey] || (step.needsKey === 'gateway' ? apiKeys['openclaw'] : '')),
      endpoint: step.endpoint || customEndpoints[step.provider] || undefined,
      temperature: primaryConfig.temperature,
      maxTokens: primaryConfig.maxTokens,
    };

    try {
      await streamLLM(messages, fallbackConfig, onChunk, onDone);
      console.log(`[LLM] Fallback succeeded (streamed): ${step.provider}/${step.model}`);
      return;
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.warn(`[LLM] Fallback ${step.provider}/${step.model} stream failed: ${msg}`);
    }
  }

  // 3. All streaming attempts failed. Last resort: non-streaming
  // callLLMWithFallback so the user is never left without an answer.
  // This blocks the UI for the duration of the slowest call, but it's
  // strictly better than throwing.
  console.warn(
    `[LLM] All ${fallbackChain.length} streaming fallbacks failed. ` +
    `Falling back to non-streaming callLLMWithFallback as last resort.`
  );
  const result = await callLLMWithFallback(messages, primaryConfig, apiKeys, customEndpoints, fallbackChain);
  onChunk(result.text);
  onDone(result);
}
