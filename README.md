# Redteam

Stress-tests ideas by running them through multiple adversarial AI frameworks in parallel.

Fires independent agents at your idea simultaneously, each looking for a different class of failure, then synthesizes a verdict.

## What it does

Pick a mode (Stress Test, First Principles, OODA Loop, Temporal Lens, Inversion, Second Order, Brainstorm, or Chat). 4-7 frameworks run in parallel, streaming into a React Flow canvas. When done, a synthesis agent reads across all outputs and tells you what to do with them.

- **Continuation rounds** — follow up on any session; prior context is injected automatically
- **Session Memory** — structured memory written after each round, persists across continuations
- **User Memory** — sidebar free-text field injected into every call
- **@-mentions** — reference specific prior outputs inline in continuation prompts
- **Document grounding** — upload PDF, DOCX, or text; content is injected into all framework calls
- **Web Search** — toggle to enable Gemini's native `google_search` for real-time grounding
- **Provider fallback** — Gemini/Mistral fail over to each other on quota or network errors

Sessions (up to 20) persist in localStorage and can be pinned, restored, and exported.

## Setup

**Prerequisites:** Node.js 18+, a Mistral API key, a Gemini API key.

```bash
git clone <repo-url>
cd redteam
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

```
GEMINI_API_KEY=...
MISTRAL_API_KEY=...
AUTH_USERNAME=...
AUTH_PASSWORD=...
```

Credentials are set at deploy time — there is no registration flow.

```bash
npm run dev
# http://localhost:3000
```

## Configuration

The **API** button in the top bar lets you swap providers and models at runtime. Config persists to localStorage.

**Gemini:** gemini-2.5-flash-preview, gemini-2.0-flash, gemini-2.0-flash-lite, gemma-4-27b-it, gemini-3.1-flash-lite-preview

**Mistral:** mistral-large-latest, mistral-medium-latest, magistral-medium-2506, mistral-small-latest, codestral-latest

Large/Magistral: 1 concurrent, 1s release delay. Small: 3 concurrent. Medium: fully parallel.

## Deploy

Both API routes run on Edge runtime to bypass Vercel Hobby's 10s timeout. Set all four env vars in the Vercel dashboard, then:

```bash
vercel --prod
```

## License

Do whatever you want with it.
