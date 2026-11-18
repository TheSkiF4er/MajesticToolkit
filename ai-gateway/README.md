# MajesticToolkit 1.9.2 — OpenAI Gateway

A real **optional** local-only OpenAI Responses API proxy for the **Workspace → AI Connection** tab. Requires Node.js 22+. It has no external npm dependencies.

## Start locally

Set environment variables in the terminal **where the gateway runs**, not in the extension, browser storage, `.env` tracked by Git, or a bundled JavaScript file.

**PowerShell (Windows)**

```powershell
$env:OPENAI_API_KEY = "sk-...your-own-key..."
$env:MT_AI_GATEWAY_TOKEN = "a-random-secret-with-at-least-32-characters"
$env:OPENAI_MODEL = "gpt-6-luna" # or another Responses-compatible model available to your API project
npm run ai:gateway
```

**Linux/macOS**

```bash
export OPENAI_API_KEY='sk-...your-own-key...'
export MT_AI_GATEWAY_TOKEN='a-random-secret-with-at-least-32-characters'
export OPENAI_MODEL='gpt-6-luna'
npm run ai:gateway
```

Use an independently generated high-entropy gateway token. The example text is **not** secure; do not reuse it. Gateway listens only on `127.0.0.1:32187`. On startup it refuses to run without a provider key and sufficiently long gateway token. You can override `MT_AI_PORT` for standalone testing, but the **browser extension only connects to port 32187**.

In the browser, open **Workspace → AI Connection**. Turn on cloud AI; the browser asks for the **optional** `http://127.0.0.1/*` permission. Enter `MT_AI_GATEWAY_TOKEN` (never your OpenAI key), click **Проверить соединение**, type a question, inspect the preview and tick explicit consent. Click **Отправить запрос**. The answer streams into the workspace; **Отменить** aborts in-flight calls.

## Security and behavior

- The OpenAI key stays in the **Node process environment** and is never sent to browser clients or included in extension backups. The gateway token lives **only in the currently open extension page memory**. It must be re-entered after reload or profile switch.
- The gateway accepts only extension-origin requests with the correct bearer token. It binds to loopback and cannot be exposed as a public multi-user service without adding TLS, user authentication, persistent accounting and deployment controls. **Do not reverse proxy or expose this server on the Internet.**
- Generic chat forwards only the typed question. **Rules & Knowledge AI** additionally forwards only up to five user-selected snippets of locally stored rules or articles, including exact revision identifiers and source URLs, after showing the full request payload and requesting separate consent. No automatic complaints, documents, files, cookies, profile data, other rules, or diagnostic data. No tools, no network lookup of source URLs, no remote file uploads or automatic forum actions.
- OpenAI `POST /v1/responses` uses `stream: true`, `store: false` and at most 700 output tokens; actual remote processing and billing still follow the provider's policies. Text responses are not saved by the gateway. Browser transcript is session-only.
- Gateway limits: 5000 characters per question, 4 requests per minute, 30 per rolling 24-hour process lifetime by default (set `MT_AI_DAILY_LIMIT=1..1000`), up to 2 concurrent requests, 60-second upstream timeout, maximum 60,000 response characters. **Rate limits reset when the gateway restarts and are not a monetary spending cap.** Set hard API project spend limits in your OpenAI account.
- Handles HTTP failures, interrupted SSE, model errors and user cancellation without storing conversation contents. Gateway health is authenticated and discloses only model, limits and remaining requests.
- Requires internet connectivity from the host running the gateway. There is **no** provider key bundled with this repository, so a real paid API call cannot be completed without your own OpenAI API account.

## Source-grounded questions (1.9.2)

Open **Workspace → AI Connection → Rules & Knowledge AI** or use **Спросить AI** in a rule/article card. Search locally, review the source snapshots and enable desired candidates (up to five), verify the full JSON shown under **Точный предпросмотр передачи**, check the per-request consent and submit. The gateway accepts `POST /v1/chat` with `mode: "rules"`, a question and a strictly bounded `sources` list, and sends them to the OpenAI Responses API. The gateway adds untrusted-source-aware instructions, requires numbered citations, disables model tools, and never fetches URLs itself. The UI renders original source hyperlinks from local records only; generated numeric citations are **not** independently proof of correctness. Review the exact primary documents and sanctions before using any result.

Source retrieval and previews do not trigger network requests. Historical revisions and unreviewed materials are opt-in; imported sources have a manual **reviewed** flag, which is not official authentication. The gateway is unaware of other local records. No AI chat transcript, raw provider secret, or selected source text is written to extension storage or backups.

## Tests

Run `node --test tests/ai-connection-191.test.mjs`. The tests exercise real HTTP request/response handling against a deterministic mocked OpenAI upstream, not a billable external API call. Run `npm run verify` and `npm run test:browser` for the complete extension regression suite.
