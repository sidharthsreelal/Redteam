# Red Team

A parallel AI analysis tool that stress-tests ideas by running them through multiple adversarial analytical frameworks simultaneously.

## Why it exists

Most people seek validation when sharing an idea. This tool does the opposite: it fires multiple independent AI agents at your idea in parallel, each trained to find a different class of weakness. The output is a structured attack surface, not encouragement. The synthesis step then tells you what to actually do with it.

## What it does

Submit an idea or decision to one of seven modes — Stress Test, First Principles, OODA Loop, Temporal Lens, Inversion, Second Order, Brainstorm, or Chat. Each mode runs 4-7 analytical frameworks in parallel, streaming results into a React Flow canvas. When all frameworks complete, a synthesis agent reads across all outputs and produces a prioritized verdict.

Additional features:

- **Continuation rounds** — follow up on any completed session using the same canvas, with full context from the previous round injected automatically
- **Session Memory** — after each round, a background call writes a structured memory of the session that persists across continuations
- **User Memory** — a persistent free-text field in the sidebar that gets injected into every call, useful for standing context about you or your project
- **@-mention references** — in continuation inputs, type `@` to reference specific framework outputs from the prior round, injecting them verbatim into the next round's context
- **Document grounding (RAG)** — upload PDF, DOCX, or text files; parsed content is injected as grounding material into all framework calls for that session
- **Web Search** — toggle on the input screen to enable Gemini's native `google_search` tool for real-time grounding
- **Provider fallback** — Gemini is primary for web search; Mistral is primary otherwise. Either falls back to the other on quota or network errors, with a 30s circuit breaker on Gemini

The canvas persists up to 20 sessions in localStorage. Sessions can be pinned, restored, and exported.

## Getting started

**Prerequisites:** Node.js 18+, a Mistral API key, a Gemini API key.

```bash
git clone <repo-url>
cd redteam
npm install
```

Copy the example env file and fill in your keys:

```bash
cp .env.example .env.local
```

`.env.local` requires:

```
GEMINI_API_KEY=...
MISTRAL_API_KEY=...
AUTH_USERNAME=...
AUTH_PASSWORD=...
```

`AUTH_USERNAME` and `AUTH_PASSWORD` control the login screen. There is no registration flow — credentials are set at deploy time.

Run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You will land on the login screen.

## Configuration

The API panel (top bar, "API" button) lets you swap the primary provider and select specific models at runtime. Config is persisted to localStorage under `redteam_api_config`. The `user101` account is restricted to `mistral-medium-latest` and `codestral`; this restriction is enforced server-side in `src/lib/store.tsx`.

Available Gemini models: gemini-2.5-flash-preview, gemini-2.0-flash, gemini-2.0-flash-lite, gemma-4-27b-it, gemini-3.1-flash-lite-preview.

Available Mistral models: mistral-large-latest, mistral-medium-latest, magistral-medium-2506, mistral-small-latest, codestral-latest.

Mistral Large and Magistral are rate-limited at 1 concurrent request with 1s delay between releases. Mistral Small is capped at 3 concurrent. Mistral Medium runs fully parallel.

## Deploying to Vercel

Both API routes use Edge runtime to avoid Vercel Hobby's 10s serverless timeout. Set all four environment variables in the Vercel dashboard before deploying.

```bash
vercel --prod
```

## Known issues

The session memory writer fires a background Mistral call 2 seconds after round completion. If the user navigates away or closes the tab during that window, the memory write is lost silently. There is no retry.

`user101` access control is enforced in the store and route layers but not at the middleware level, so a determined user could bypass it by crafting API requests directly.

The `ADD_API_LOG` and `LOAD_API_LOGS` reducer cases appear after the `default` case in `store.tsx`, making them unreachable. The API log panel still works because the `ADD_API_LOG` dispatch goes through the provider event path rather than the main reducer — but this is a latent bug worth fixing before adding any new log-related actions.

## License

MIT
