import { NextRequest } from 'next/server';

export const runtime = 'edge'; // Use Edge runtime to bypass Vercel Hobby 10s timeout for streaming

// ── Provider defaults (used when no config passed) ─────────────────────────────
const DEFAULT_GEMINI_MODEL   = 'gemini-3.1-flash-lite-preview';
const GEMINI_BASE    = 'https://generativelanguage.googleapis.com/v1beta/models';

const DEFAULT_MISTRAL_MODEL  = 'mistral-medium-latest';
const MISTRAL_BASE   = 'https://api.mistral.ai/v1';

// ── Gemini generation config (optimised for analytical, non-hedging output) ──
const GEMINI_GEN_CONFIG = {
  temperature:      0.75,   // conviction without instability
  maxOutputTokens:  8192,   // room for full frameworks without premature truncation
  topP:             0.92,
  topK:             40,
};

// ── Mistral generation config ──────────────────────────────────────────────
const MISTRAL_GEN_CONFIG = {
  temperature:        0.75,
  max_tokens:         1800,  // room for 3–4 full paragraphs without truncation
  top_p:              0.9,
  frequency_penalty:  0.3,  // diverse vocabulary across parallel framework calls
  presence_penalty:   0.2,
};

// ── Helper: is this a quota / rate-limit error? ────────────────────────────
function isQuotaError(status: number): boolean {
  return status === 429 || status === 503;
}

// ── Concurrency Queue to prevent 503s on burst parallel calls ────────────────
class ConcurrencyQueue {
  private active = 0;
  private queue: (() => void)[] = [];
  
  constructor(private maxConcurrent: number, private delayMs: number = 0) {}
  
  async acquire(): Promise<() => void> {
    if (this.active >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setTimeout(() => {
        this.active--;
        const next = this.queue.shift();
        if (next) next();
      }, this.delayMs);
    };
  }
}

// Limit Gemini to 2 concurrent requests to prevent burst 503/429 errors
const geminiQueue = new ConcurrencyQueue(2);

let geminiCircuitBrokenUntil = 0;

// Mistral Large often hits rate limits if executed fully parallel. Enforce strict concurrency of 1 and 1000ms delay.
const mistralLargeQueue = new ConcurrencyQueue(1, 1000);

// Mistral Small has moderate rate limit issues.
const mistralSmallQueue = new ConcurrencyQueue(3);

// ─────────────────────────────────────────────────────────────────────────────
// Gemini streaming: POST …/gemini-2.0-flash-lite:streamGenerateContent?alt=sse
// Emits chunks as: data: {"candidates":[{"content":{"parts":[{"text":"…"}]}}]}
// ─────────────────────────────────────────────────────────────────────────────
async function streamGemini(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  model: string,
): Promise<{ ok: boolean; quota: boolean; error?: string }> {
  const url = `${GEMINI_BASE}/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const isGemma = model.startsWith('gemma');

  // Gemma models don't support `system_instruction` or `safetySettings` via the standard Google AI API endpoint.
  // We prepend the config inline for Gemma.
  const finalPrompt = isGemma ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;

  const body: any = {
    contents: [
      { role: 'user', parts: [{ text: finalPrompt }] },
    ],
    generationConfig: GEMINI_GEN_CONFIG,
  };

  if (!isGemma) {
    body.system_instruction = {
      parts: [{ text: systemPrompt }],
    };
    body.safetySettings = [
      // Disable safety thresholds entirely so analytical critique isn't blocked mid-sentence
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ];
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, quota: false, error: e instanceof Error ? e.message : 'Unknown network error' };
  }

  if (isQuotaError(res.status)) {
    console.error(`[Gemini] Quota/rate-limit error — HTTP ${res.status} (model: ${model})`);
    return { ok: false, quota: true };
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => res.status.toString());
    console.error(`[Gemini] Error HTTP ${res.status} (model: ${model}): ${errBody.slice(0, 300)}`);
    return { ok: false, quota: false, error: `Gemini error ${res.status}: ${errBody.slice(0, 150)}` };
  }

  const reader = res.body?.getReader();
  if (!reader) return { ok: false, quota: false, error: 'No reader from Gemini response' };

  const decoder = new TextDecoder();
  let buf = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          continue;
        }

        try {
          const parsed = JSON.parse(data);
          // Gemini: candidates[0].content.parts[0].text
          const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`)
            );
          }

          // Check for finish reason (end of stream)
          const finishReason = parsed?.candidates?.[0]?.finishReason;
          if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
            // e.g. SAFETY block — surface it but don't hard-fail
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ info: `Gemini stopped: ${finishReason}` })}\n\n`)
            );
          }
        } catch { /* malformed chunk — skip */ }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { ok: true, quota: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mistral streaming: POST …/chat/completions (OpenAI-compatible SSE)
// Emits chunks as: data: {"choices":[{"delta":{"content":"…"}}]}
// ─────────────────────────────────────────────────────────────────────────────
async function streamMistral(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  model: string,
): Promise<{ ok: boolean; error?: string }> {
  let res: Response;
  try {
    res = await fetch(`${MISTRAL_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        ...MISTRAL_GEN_CONFIG,
        stream: true,
      }),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Mistral network error' };
  }

  if (res.status === 429) {
    return { ok: false, error: 'Mistral rate-limited.' };
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => res.status.toString());
    return { ok: false, error: `Mistral error ${res.status}: ${errBody.slice(0, 150)}` };
  }

  const reader = res.body?.getReader();
  if (!reader) {
    return { ok: false, error: 'No response body from Mistral' };
  }

  const decoder = new TextDecoder();
  let buf = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          continue;
        }

        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            const errMsg = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
            return { ok: false, error: errMsg };
          }
          const content = parsed.choices?.[0]?.delta?.content;
          if (typeof content === 'string' && content.length > 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
          }
        } catch { /* skip malformed */ }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { systemPrompt, userPrompt } = body;

  // Read per-request API config passed from client
  const apiConfig = body.apiConfig as {
    primary?: 'gemini' | 'mistral';
    geminiModel?: string;
    mistralModel?: string;
  } | undefined;

  const primaryProvider  = apiConfig?.primary ?? 'gemini';
  const geminiModel  = apiConfig?.geminiModel  ?? DEFAULT_GEMINI_MODEL;
  const mistralModel = apiConfig?.mistralModel ?? DEFAULT_MISTRAL_MODEL;

  const geminiKey  = process.env.GEMINI_API_KEY;
  const mistralKey = process.env.MISTRAL_API_KEY;

  if (!geminiKey && !mistralKey) {
    return new Response(
      JSON.stringify({ error: 'No API keys configured.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let usedProvider: 'gemini' | 'mistral' | 'none' = 'none';

      let lastError = '';

      if (primaryProvider === 'gemini') {
        // ── Try Gemini first ──
        if (geminiKey && Date.now() > geminiCircuitBrokenUntil) {
          const releaseLock = await geminiQueue.acquire();
          try {
            if (Date.now() > geminiCircuitBrokenUntil) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ provider: 'gemini', model: geminiModel })}\n\n`)
              );
              const result = await streamGemini(systemPrompt, userPrompt, geminiKey, controller, encoder, geminiModel);
              if (result.ok) {
                usedProvider = 'gemini';
              } else if (result.quota) {
                console.warn(`[Route] Gemini quota exceeded — tripping circuit breaker for 30s`);
                geminiCircuitBrokenUntil = Date.now() + 30_000;
              } else if (result.error) {
                console.warn(`[Route] Gemini failed: ${result.error}`);
                lastError = result.error;
              }
            }
          } finally {
            releaseLock();
          }
        }

        // ── Fall back to Mistral ──
        if (usedProvider === 'none' && mistralKey) {
          console.warn(`[Route] Falling back to Mistral (model: ${mistralModel})`);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ provider: 'mistral', model: mistralModel, fallback: true })}\n\n`)
          );

          let releaseLock: (() => void) | undefined;
          if (mistralModel.includes('mistral-large')) {
            releaseLock = await mistralLargeQueue.acquire();
          } else if (mistralModel.includes('mistral-small') || mistralModel.includes('ministral')) {
            releaseLock = await mistralSmallQueue.acquire();
          }

          try {
            const result = await streamMistral(systemPrompt, userPrompt, mistralKey, controller, encoder, mistralModel);
            if (result.ok) {
              usedProvider = 'mistral';
            } else {
              lastError = result.error || 'Fallback failed';
            }
          } finally {
            if (releaseLock) releaseLock();
          }
        }
      } else {
        // ── Mistral is primary ──
        if (mistralKey) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ provider: 'mistral', model: mistralModel })}\n\n`)
          );

          let releaseLock: (() => void) | undefined;
          if (mistralModel.includes('mistral-large')) {
            releaseLock = await mistralLargeQueue.acquire();
          } else if (mistralModel.includes('mistral-small') || mistralModel.includes('ministral')) {
            releaseLock = await mistralSmallQueue.acquire();
          }

          try {
            const result = await streamMistral(systemPrompt, userPrompt, mistralKey, controller, encoder, mistralModel);
            if (result.ok) {
              usedProvider = 'mistral';
            } else {
              lastError = result.error || 'Mistral primary failed';
            }
          } finally {
            if (releaseLock) releaseLock();
          }
        }

        // ── Fall back to Gemini ──
        if (usedProvider === 'none' && geminiKey && Date.now() > geminiCircuitBrokenUntil) {
          const releaseLock = await geminiQueue.acquire();
          try {
            if (Date.now() > geminiCircuitBrokenUntil) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ provider: 'gemini', model: geminiModel, fallback: true })}\n\n`)
              );
              const result = await streamGemini(systemPrompt, userPrompt, geminiKey, controller, encoder, geminiModel);
              if (result.ok) {
                usedProvider = 'gemini';
              } else if (result.quota) {
                geminiCircuitBrokenUntil = Date.now() + 60000;
              } else if (result.error) {
                lastError = result.error;
              }
            }
          } finally {
            releaseLock();
          }
        }
      }

      if (usedProvider === 'none') {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: lastError || 'All providers unavailable. Please try again shortly.' })}\n\n`)
        );
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  });
}
