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

/**
 * Create standardized response with CORS headers
 */
function createResponse(body: any, status = 200, extraHeaders = {}): Response {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...extraHeaders,
  };

  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Handle OPTIONS request for CORS preflight
 */
function handleOptionsRequest(): Response {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function onRequest({ request, env }: any) {
  if (request.method === 'OPTIONS') {
    return handleOptionsRequest();
  }

  request.headers.delete('accept-encoding');

  try {
    const json = await request.clone().json();
    const parseResult = messageSchema.safeParse(json);

    if (!parseResult.success) {
      return createResponse({ error: parseResult.error.message });
    }

    const { messages, model, stream, ...extraParams } = parseResult.data;

    const userMessages = messages.filter((message) => message.role === 'user');
    if (!userMessages.length) {
      return createResponse({ error: 'No input message found' });
    }

    if (
      userMessages.some((message) => typeof message.content !== 'string')
    ) {
      return createResponse({ error: 'Invalid user message content' });
    }

    try {
      // Check if custom OpenAI-compatible API is configured
      const BASE_URL = env.BASE_URL;
      const API_KEY = env.API_KEY;
      const MODEL = env.MODEL;

      if (BASE_URL && API_KEY && MODEL) {
        // Use custom OpenAI-compatible API
        const isStream = stream ?? true;
        const response = await fetch(`${BASE_URL}/chat/completions`, {
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
          return createResponse(data);
        }

        return new Response(response.body, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        });
      }

      // Fall back to Edge AI
      const allowedModels = [
        '@tx/deepseek-ai/deepseek-v4',
      ];

      const requestedModel = model || allowedModels[0];
      const selectedModel = requestedModel;
      const allowedModelList = Array.from(
        new Set([...allowedModels])
      );

      if (!allowedModels.includes(selectedModel)) {
        return createResponse({
          error: `Invalid model: ${requestedModel}. Allowed models: ${allowedModelList.join(
            ', '
          )}`,
        });
      }

      // @ts-ignore-next-line
      const isStream = stream ?? true;
      // @ts-ignore-next-line
      const aiResponse = await AI.chatCompletions({
        ...extraParams,
        model: selectedModel,
        messages,
        stream: isStream,
      });

      if (!isStream) {
        return createResponse(aiResponse);
      }

      return new Response(aiResponse, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    } catch (error: any) {
      return createResponse({ error: error.message });
    }
  } catch (error: any) {
    return createResponse({
      error: 'Request processing failed',
      details: error.message,
    });
  }
}
