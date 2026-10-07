# Ask Quantinum — embedded AI analyst

Quantinum intelligence, as a chat: a floating **Ask Quantinum** button on every
signed-in page (bottom-right; above the dock on phones) opens a side sheet, and
**Analyze with Quantinum** on NEXUS setup detail, the ticker page, flow print
rows, GEX key levels, 0DTE rows/cards and journal trades opens it pre-filled
with that object.

## Enable

| Env | Values | Default |
|---|---|---|
| `QUANTINUM_AI` | `admin` (super-admins + desk admins) · `all` · `off` | `admin` |
| `QUANTINUM_AI_DAILY_USD` | global spend cap per ET day, USD | `5` |
| `GROQ_API_KEY` / `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | provider keys (server only) | — |

A provider with no key is skipped. Desk admins count only when `DESK_ADMINS=true`.

## Grounding

The server builds a **context pack** from our data only (`server/quantinum-ai-context.ts`):
setup plan + NEXUS grade breakdown + lifecycle, live quote with source and age,
level map, GEX walls, flow-tape summary (no inferred sentiment), sector/rotation
layer, engine layers, and the canonical verified record with `n`. Each field has a
key; the model must cite keys (`[[quote.last]]`) — they render as source chips.
Missing sources are listed and the model must say "not in the data".

Rows sent by the page are identifiers + displayed numbers only (strict schema in
`shared/quantinum-ai.ts › parseAskTarget`); journal notes never leave.

## Guardrails

- System prompt is fixed server-side; member text is wrapped as data, our tags are
  neutralised, client "system" turns become user turns, rules are restated after the question.
- No buy/sell/hold instructions; output that slips is tagged with a no-advice note.
  Every answer carries "Educational, not investment advice."
- Optional lookups: the model may request `quote`, `levels` or `dossier` for a
  symbol (one `LOOKUP {...}` line, max 2). Anything else is refused and never run.
- Emails / phone numbers are redacted from member text; no name, email or user id is sent to a provider.

## Providers

Defaults (`DEFAULT_QUANTINUM_AI_CONFIG`): **Quick** → Groq `llama-3.3-70b-versatile` →
Gemini `gemini-2.5-flash` → Claude `claude-haiku-4-5`. **Deep analyze** → Claude
`claude-haiku-4-5` → Gemini → Groq. Any error, 429, empty answer or refusal falls
through to the next step (a partial answer is cleared). Admin › System › Ask
Quantinum edits the order/models (stored in `.cache/quantinum-ai/config.json`, shared
by both pm2 apps; Reset returns to the defaults).

## Limits + usage

Per-user questions per ET day: free 5 · advanced 50 · pro 200 · admin / desk admin 200.
Before each call the worst case (priciest step × full output × (1 + lookups)) must fit
under the daily cap; in-flight questions hold their slot and spend. Usage is one JSONL
line per question in `.cache/quantinum-ai/usage.jsonl` — counts, tokens, cost,
provider, latency; never the question or answer. Admin view: `/admin/system`.

## API

`GET /api/quantinum/ai/status` · `POST /api/quantinum/ai/ask` (SSE: `meta`, `delta`,
`reset`, `lookup`, `done`, `error`) · `GET /api/admin/quantinum-ai` ·
`PUT|DELETE /api/admin/quantinum-ai/config` (admin JWT).

Tests: `npm run test:quantinum-ai`.
