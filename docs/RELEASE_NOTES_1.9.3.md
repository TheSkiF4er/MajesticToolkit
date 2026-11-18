# MajesticToolkit 1.9.3 — AI Complaint Analysis

Production changes, based on the 1.9.2 local OpenAI gateway and existing complaint/evidence stores.

## What works

- In Workspace → AI / Правила → **AI Complaint Analysis**, select a real complaint from the active profile. The **Анализ с AI** button in a complaint opens the same workspace with that case selected.
- Individually select up to **6 evidence records**, **12 timeline events**, and **5 active rules**. The preview contains **metadata and user-authored descriptions**, not video frames, image bytes, or contents of local attachments. It does not fetch or inspect external URLs.
- Names, evidence URLs, case notes, and existing drafts are **excluded by default** and can only be included using separate unchecked opt-in controls. Review all remaining titles and descriptions for sensitive information before transmission.
- View the exact JSON request, separately consent, and initiate a real Responses API stream through the existing optional, loopback-only gateway. The gateway rejects unexpected keys and invalid/oversized references, applies its rate limits and sends the OpenAI request with `store:false`.
- Receive a bounded structured preliminary report: summary, referenced facts, possible rules, contradictions, missing materials, follow-up questions and an editable proposed draft. All referenced evidence/event/rule IDs are checked against the selected records; invented IDs cause the report to be rejected.
- Explicitly confirm and save the **edited draft** into the specific case. The backend enforces active profile, exact forum project, unchanged case revision, non-completed status, and serialized writes. Previous drafts are not silently overwritten. No auto-send or game sanctions.
- Existing rules AI, offline assistant, Complaint Manager, Moderation Workspace, Evidence Timeline, Backup v17 and the four platform builds stay compatible. AI text and gateway token are not added to backups.

## Usage

1. Start the existing gateway (`OPENAI_API_KEY`, `MT_AI_GATEWAY_TOKEN`, `npm run ai:gateway`). AI must be enabled for the profile.
2. Open a complaint and click **Анализ с AI**, or open **AI / Правила → AI Complaint Analysis**.
3. Check the desired evidence, events and rules; optionally include notes, names or URLs, then select **Подготовить предпросмотр**.
4. Check the JSON and separately consent before **Анализировать с AI**.
5. Review the result against the original material. Edit the draft, click **Сохранить черновик в жалобу**, and independently publish it later through the existing reviewed workflow.

## Limits & safety

- Max question: 2,000 chars; request metadata: 16,000 chars, enforced both client and gateway; file uploads disabled.
- A URL and a timecode do **not** mean the model has watched a video or read the target website. No determination of guilt, official rule interpretation, or automatic sanction.
- Source texts and evidence descriptions are untrusted prompt-injection surfaces. The server applies no tools and asks for JSON with only locally permitted IDs. Output must be manually verified.
- The official OpenAI service and logged-in forums were not exercised without credentials; HTTP transport uses mocked OpenAI SSE, and browser E2E runs in isolated Chromium fixtures. Firefox/Android/Safari receive validated builds, not live device acceptance.
