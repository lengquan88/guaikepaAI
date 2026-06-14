import { z } from 'zod';

// Minimal env type for Cloudflare Pages Functions
interface PagesEnv {
  ALLOWED_ORIGINS?: string;
  REQUIRED_API_KEY?: string;
  BASE_URL?: string;
  API_KEY?: string;
  MODEL?: string;
  NODE_ENV?: string;
  [key: string]: unknown;
}

declare global {
  const AI: {
    chatCompletions: (...args: unknown[]) => Promise<ReadableStream<Uint8Array> | Record<string, unknown>>;
  };
}

const messageItemSchema = z
  .object({
    role: z.enum(['user', 'assistant', 'system', 'tool', 'function']),
    content: z.string().nullable().optional(),
  })
  .passthrough();

const messageSchema = z
  .object({
    messages: z.array(messageItemSchema),
    model: z.string().optional(),
    stream: z.boolean().optional(),
    tools: z.any().optional(),
    tool_choice: z.any().optional(),
    functions: z.any().optional(),
    function_call: z.any().optional(),
    temperature: z.number().optional(),
    top_p: z.number().optional(),
    max_tokens: z.number().optional(),
    presence_penalty: z.number().optional(),
    frequency_penalty: z.number().optional(),
    stop: z.union([z.string(), z.array(z.string())]).optional(),
    response_format: z.any().optional(),
    seed: z.number().optional(),
    user: z.string().optional(),
    n: z.number().int().optional(),
    logit_bias: z.record(z.string(), z.number()).optional(),
    parallel_tool_calls: z.boolean().optional(),
    stream_options: z.any().optional(),
  })
  .passthrough();

const ALLOWED_MODELS = ['@tx/deepseek-ai/deepseek-v4'] as const;
const MAX_PROMPT_LENGTH = 12000;

function getAllowedOrigin(env: PagesEnv | undefined, origin: string | null): string {
  if (!origin) return '';
  const configured = env?.ALLOWED_ORIGINS;
  if (configured) {
    const list = String(configured)
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);
    if (list.includes(origin)) return origin;
    return list[0] || '';
  }
  return '';
}

function corsHeaders(env: PagesEnv | undefined, origin: string | null): Record<string, string> {
  const allowed = getAllowedOrigin(env, origin);
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/**
 * Create standardized response with restrictive CORS headers
 */
function createResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
  env: PagesEnv | undefined = undefined,
  origin: string | null = null,
): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(env, origin),
    ...extraHeaders,
  };

  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Handle OPTIONS request for CORS preflight
 */
function handleOptionsRequest(env: PagesEnv, origin: string | null): Response {
  return new Response(null, { status: 204, headers: corsHeaders(env, origin) });
}

function verifyApiKey(request: Request, env: PagesEnv): { ok: boolean; error?: string } {
  const requiredKey = env?.REQUIRED_API_KEY;
  if (!requiredKey) {
    return { ok: true }; // Dev fallback: no key configured → skip check
  }
  const auth = request.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  const provided = match ? match[1].trim() : '';
  if (!provided || provided !== String(requiredKey)) {
    return { ok: false, error: 'Unauthorized: valid API key required' };
  }
  return { ok: true };
}

export async function onRequest({ request, env }: { request: Request; env: PagesEnv }) {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return handleOptionsRequest(env, origin);
  }

  const authCheck = verifyApiKey(request, env);
  if (!authCheck.ok) {
    return createResponse({ error: authCheck.error }, 401, {}, env, origin);
  }

  request.headers.delete('accept-encoding');

  try {
    // Read body with a size guard to avoid DoS on oversized JSON
    const raw = await request.clone().arrayBuffer();
    if (raw.byteLength > 128 * 1024) {
      return createResponse({ error: 'Request body too large' }, 413, {}, env, origin);
    }
    let json: unknown;
    try {
      json = JSON.parse(new TextDecoder('utf-8').decode(raw));
    } catch {
      return createResponse({ error: 'Invalid JSON body' }, 400, {}, env, origin);
    }

    const parseResult = messageSchema.safeParse(json);

    if (!parseResult.success) {
      return createResponse({ error: 'Invalid request payload' }, 400, {}, env, origin);
    }

    const { messages, model, stream, ...extraParams } = parseResult.data;

    const userMessages = messages.filter((message) => message.role === 'user');
    if (!userMessages.length) {
      return createResponse({ error: 'No user message provided' }, 400, {}, env, origin);
    }

    if (
      userMessages.some((message) => typeof message.content !== 'string')
    ) {
      return createResponse({ error: 'User message content must be a string' }, 400, {}, env, origin);
    }

    if (
      userMessages.some(
        (message) => (message.content as string).length > MAX_PROMPT_LENGTH,
      )
    ) {
      return createResponse(
        { error: `User message exceeds maximum length of ${MAX_PROMPT_LENGTH}` },
        413,
        {},
        env,
        origin,
      );
    }

    try {
      // Check if custom OpenAI-compatible API is configured
      const BASE_URL = env.BASE_URL;
      const API_KEY = env.API_KEY;
      const MODEL = env.MODEL;

      if (BASE_URL && API_KEY && MODEL) {
        // SSRF defense: reject non-https / loopback / private-network targets
        let parsedUrl: URL;
        try {
          parsedUrl = new URL('chat/completions', BASE_URL);
        } catch {
          return createResponse({ error: 'Invalid upstream configuration' }, 500, {}, env, origin);
        }
        const host = parsedUrl.hostname.toLowerCase();
        const isPrivateHost =
          host === 'localhost' ||
          host.endsWith('.localhost') ||
          host.endsWith('.internal') ||
          host.endsWith('.local') ||
          host.endsWith('.arpa');
        // IPv4 check: 127.x.x.x, 10.x.x.x, 192.168.x.x, 172.16-31.x.x
        const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
        const ipv4Match = host.match(ipv4Regex);
        const isPrivateIpv4 = ipv4Match
          ? (() => {
              const [a, b, c] = ipv4Match.slice(1).map(Number);
              // Reject octal-encoded segments like 0177
              if (ipv4Match.slice(1).some((seg) => seg.length > 1 && seg.startsWith('0'))) return true;
              if (a === 127) return true;
              if (a === 10) return true;
              if (a === 192 && b === 168) return true;
              if (a === 172 && b >= 16 && b <= 31) return true;
              // Link-local
              if (a === 169 && b === 254) return true;
              // All zeros / broadcast-ish
              if (a === 0) return true;
              return false;
            })()
          : false;
        const isIpv6Loopback = host === '::1' || host.startsWith('[::1]');
        if (parsedUrl.protocol !== 'https:' || isPrivateHost || isPrivateIpv4 || isIpv6Loopback) {
          return createResponse({ error: 'Invalid upstream configuration' }, 500, {}, env, origin);
        }

        const isStream = stream ?? true;
        const response = await fetch(parsedUrl.toString(), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...extraParams,
            model: MODEL,
            messages,
            stream: isStream,
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (!isStream) {
          const data = await response.json();
          return createResponse(data, response.status, {}, env, origin);
        }

        // Guard: only stream if the upstream actually returned an SSE payload
        const upstreamContentType = response.headers.get('content-type') || '';
        if (!response.ok || !upstreamContentType.includes('text/event-stream')) {
          const fallback = await response.text().catch(() => '');
          return createResponse(
            { error: 'Upstream service returned an unexpected response' },
            response.status >= 400 && response.status < 600 ? response.status : 502,
            {},
            env,
            origin,
          );
        }

        return new Response(response.body, {
          status: response.status,
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            ...corsHeaders(env, origin),
          },
        });
      }

      // Fall back to Edge AI — use the module-level allowed list
      const requestedModel = (model || ALLOWED_MODELS[0]) as string;

      if (!ALLOWED_MODELS.includes(requestedModel as (typeof ALLOWED_MODELS)[number])) {
        return createResponse({ error: 'Invalid model' }, 400, {}, env, origin);
      }

      const isStream = stream ?? true;
      // @ts-ignore-next-line
      const aiResponse = await AI.chatCompletions({
        ...extraParams,
        model: requestedModel,
        messages,
        stream: isStream,
      });

      if (!isStream) {
        return createResponse(aiResponse, 200, {}, env, origin);
      }

      return new Response(aiResponse as ReadableStream<Uint8Array>, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          ...corsHeaders(env, origin),
        },
      });
    } catch (error) {
      const isDev = env?.NODE_ENV === 'development';
      const errMsg = error instanceof Error ? error.message : 'Upstream request failed';
      return createResponse(
        { error: isDev ? errMsg : 'Upstream request failed' },
        502,
        {},
        env,
        origin,
      );
    }
  } catch (error) {
    const isDev = env?.NODE_ENV === 'development';
    const errMsg = error instanceof Error ? error.message : 'Request processing failed';
    return createResponse(
      {
        error: isDev ? errMsg : 'Request processing failed',
        ...(isDev ? { details: errMsg } : {}),
      },
      500,
      {},
      env,
      origin,
    );
  }
}
