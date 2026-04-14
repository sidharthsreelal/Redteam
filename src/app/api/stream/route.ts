import { NextRequest } from 'next/server';

const MODEL = 'mistral-small-latest';
const MISTRAL_BASE = 'https://api.mistral.ai/v1';

export async function POST(req: NextRequest) {
  const { systemPrompt, userPrompt } = await req.json();

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'MISTRAL_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const res = await fetch(`${MISTRAL_BASE}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.72,
            max_tokens: 400,
            stream: true,
          }),
        });

        if (res.status === 429) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: 'Rate limited — try again in 60 seconds.' })}\n\n`)
          );
          controller.close();
          return;
        }

        if (!res.ok) {
          const body = await res.text().catch(() => res.status.toString());
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: `API error ${res.status}: ${body.slice(0, 120)}` })}\n\n`)
          );
          controller.close();
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'No response body' })}\n\n`));
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;

            const data = trimmed.slice(6);
            if (data === '[DONE]') {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                );
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: err instanceof Error ? err.message : 'Network error' })}\n\n`
          )
        );
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
