import { z } from 'zod';

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

function getAllowedOrigin(env: any, origin: string | null): string {
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

function corsHeaders(env: any, origin: string | null): Record<string, string> {
  const allowed = getAllowedOrigin(env, origin);
  return {
    'Access-Control-Allow-Origin': allowed || 'null',
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
  body: any,
  status = 200,
  extraHeaders: Record<string, string> = {},
  env: any = undefined,
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
function handleOptionsRequest(env: any, origin: string | null): Response {
  return new Response(null, { headers: corsHeaders(env, origin) });
}

function verifyApiKey(request: Request, env: any): { ok: boolean; error?: string } {
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

export async function onRequest({ request, env }: any) {
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
    let json: any;
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

    const userMessages = messages.filter((message: any) => message.role === 'user');
    if (!userMessages.length) {
      return createResponse({ error: 'No user message provided' }, 400, {}, env, origin);
    }

    if (
      userMessages.some((message: any) => typeof message.content !== 'string')
    ) {
      return createResponse({ error: 'User message content must be a string' }, 400, {}, env, origin);
    }

    if (
      userMessages.some(
        (message: any) => (message.content as string).length > MAX_PROMPT_LENGTH,
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
        // SSRF defense: reject non-https / loopback targets
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(`${BASE_URL}/chat/completions`);
        } catch {
          return createResponse({ error: 'Invalid upstream configuration' }, 500, {}, env, origin);
        }
        const host = parsedUrl.hostname.toLowerCase();
        const isLoopback =
          host === 'localhost' ||
          host === '127.0.0.1' ||
          host.startsWith('10.') ||
          host.startsWith('192.168.') ||
          host.endsWith('.internal') ||
          host.endsWith('.local');
        if (parsedUrl.protocol !== 'https:' || isLoopback) {
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
        });

        if (!isStream) {
          const data = await response.json();
          return createResponse(data, response.status, {}, env, origin);
        }

        return new Response(response.body, {
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

      // @ts-ignore-next-line
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

      return new Response(aiResponse, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          ...corsHeaders(env, origin),
        },
      });
    } catch (error: any) {
      const isDev = env?.NODE_ENV === 'development';
      return createResponse(
        { error: isDev ? error.message : 'Upstream request failed' },
        502,
        {},
        env,
        origin,
      );
    }
  } catch (error: any) {
    const isDev = env?.NODE_ENV === 'development';
    return createResponse(
      {
        error: isDev ? error.message : 'Request processing failed',
        ...(isDev && error?.message ? { details: error.message } : {}),
      },
      500,
      {},
      env,
      origin,
    );
  }
}
