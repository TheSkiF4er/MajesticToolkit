# MajesticToolkit 1.9.1 — AI Connection & Privacy Core

## Delivered

- **Workspace → AI Connection**: a new, working opt-in AI chat page with a typed-message preview, per-request consent, streaming output, cancel control, authenticated health check and session-only transcript.
- **Local self-hosted Node 22 gateway** (`ai-gateway/server.mjs`) binds to `127.0.0.1:32187`, proxies actual OpenAI `POST /v1/responses` with `stream:true`, `store:false`, enforced token and extension-origin access, input limits, rate limits and real SSE processing.
- API credentials remain on the **server side**. Users enter only their separate gateway bearer token in the extension; it is held in memory, not saved to `storage.local`, exported backups, diagnostic logs or committed files. The settings store persists only a per-profile `enabled` flag (default `false`).
- Optional loopback host permission is requested via a user gesture. No connection occurs when AI is disabled or before sending the explicitly displayed text. No automatic record, file, complaint, rules or profile transmission. All existing local search/assistant capabilities remain unchanged.
- Supports OpenAI API failures, 401/429, streaming interruptions, timeouts and cancellation. Token and answers are cleared on profile switch or by explicit user action.
- Complete node integration tests against an HTTP gateway and mocked upstream plus Chromium DOM test for enabling, preview, consent, response streaming and isolation. Four platform package builds remain supported.

## Installation

1. Apply the 1.9.1 **changed-files patch** to the **full 1.9.0** source tree.
2. `npm run verify`, then `npm run test:browser`.
3. Set up **your own** provider key and gateway token, start the optional server with `npm run ai:gateway` (details in `ai-gateway/README.md`).
4. Install the rebuilt extension; opt-in at **Workspace → AI Connection**. Your gateway token is **not** your OpenAI API key.

## Limitations

- The 1.9.1 release delivers basic text questions, not yet source-grounded rule answers or automated complaint analysis (scheduled for 1.9.2–1.9.3).
- The optional gateway is **localhost-only** and **single-operator**. There is no shared hosted service, user account or built-in OpenAI key; live API calls require separate credentials and internet access.
- Actual OpenAI billing and provider-side processing are subject to OpenAI API policies. `store:false` is requested, but it is not an absolute no-retention guarantee.
- The gateway's in-memory rate limit is not persistent and not a monetary cost cap. No cloud request or historical conversation is initiated automatically.
- Browser E2E exercises a deterministic network fixture, not a live paid OpenAI response. Real authorized forum pages, Firefox Android and Safari on devices require separate acceptance testing.
