// ── Multi-Provider LLM Service ──
// All API calls route through Electron's main process via IPC to bypass CORS.
// The main process makes the actual HTTP requests from Node.js (no CORS restrictions).

export type LLMProvider =
  | 'gateway_ollama'    // NEW default — routes through OpenClaw gateway → ollama/deepseek-v4-pro:cloud
  | 'featherless'       // NEW alternative — routes through OpenClaw gateway → featherless tier
  | 'anthropic'         // Claude (api.anthropic.com)
  | 'minimax'           // MiniMax (api.minimax.io) — direct, OpenAI-compatible
  | 'openai'
  | 'gemini'
  | 'ollama'
  | 'openclaw'
  | 'openrouter'
  | 'glm'
  | 'custom';

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
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    ],
  },
  ollama: {
    label: 'Ollama Cloud (free · deepseek-v4-pro)',
    // Verified live on api.ollama.com with the key seeded from .env.
    models: [
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro (default)' },
      { id: 'glm-5.1', name: 'GLM 5.1' },
      { id: 'glm-5', name: 'GLM 5' },
      { id: 'gpt-oss:120b', name: 'GPT-OSS 120B' },
      { id: 'qwen3.5:397b', name: 'Qwen 3.5 397B' },
      { id: 'kimi-k2.6', name: 'Kimi K2.6' },
      { id: 'deepseek-v3.2', name: 'DeepSeek V3.2' },
    ],
  },
  glm: {
    label: 'GLM (Zhipu AI)',
    models: [
      { id: 'glm-5.1', name: 'GLM 5.1' },
      { id: 'glm-4-plus', name: 'GLM 4 Plus' },
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
  return {
    text: data.message?.content || '',
    provider: 'ollama',
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
    case 'glm':
      return callGLM(messages, config);
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
  needsKey: 'minimax' | 'ollama' | 'anthropic' | 'openai' | 'openrouter' | 'gateway' | 'featherless' | 'none';
  /** Custom endpoint override. For 'ollama' defaults to https://api.ollama.com. */
  endpoint?: string;
}

export const DEFAULT_FALLBACK_CHAIN: FallbackStep[] = [
  { provider: 'minimax', model: 'MiniMax-M3', needsKey: 'minimax' },
  { provider: 'ollama', model: 'deepseek-v4-pro', needsKey: 'none', endpoint: 'https://api.ollama.com' },
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
