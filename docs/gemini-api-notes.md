# Gemini API notes (verified against official docs on 2026-11-21)

Sources (all under https://ai.google.dev): `/gemini-api/docs/models`,
`/gemini-api/docs/structured-output`, `/gemini-api/docs/interactions`,
`/api/interactions-api`, `/gemini-api/docs/pricing`, `/gemini-api/docs/rate-limits`.
Model names change often. Re-check the models page before changing `.env`.

## Models seen on the models page
- Flash tier: `gemini-3.8-flash` (stable), `gemini-3.6-flash` (stable).
  The models page calls 3.8 Flash "previous-generation"; the pricing page calls it
  "our most intelligent Flash model". The docs disagree with each other.
- Flash-Lite tier: `gemini-3.5-flash-lite` (stable), `gemini-3.1-flash-lite` (stable).
- New Gemini 4 family has no Flash tier: `gemini-4-carbon`, `gemini-4-neon`,
  `gemini-4-hydrogen` (speed and efficiency), `gemini-4-argon`.
- Pricing page lists "Free of charge" on the free tier for `gemini-3.8-flash`,
  `gemini-4-hydrogen` and `gemini-3.5-flash-lite`.
- Per-model free-tier limits (RPM, TPM, RPD) are NOT in the docs. They are shown
  in Google AI Studio only. Forum figures (for example 20 requests/day on Flash)
  are unverified.

## Two APIs
- Interactions API (`POST /v1beta/interactions`): GA, "recommended for all new
  projects". Needs header `Api-Revision: 2026-05-20` in the docs' examples.
- `generateContent`: now called legacy, "remains fully supported".

## Interactions API facts we depend on
- Auth header: `x-goog-api-key`.
- Request: `model`, `input`, `system_instruction`, `response_format`,
  `generation_config` (`max_output_tokens`, `thinking_level`, `seed`, ...), `store`.
  No `temperature` field is listed under `generation_config`.
- Structured output: `response_format: { type: "text", mime_type: "application/json", schema: <JSON Schema> }`.
- Response: `steps[]` with `type: "model_output"` and `content[].text`; usage in
  `usage.total_input_tokens`, `total_output_tokens`, `total_thought_tokens`.
- **Storage: `store` defaults to true. Free tier keeps interactions for 1 day.
  We must send `store: false` on every request** to honour "store nothing".
- JSON Schema subset: `minLength`, `maxLength`, `uniqueItems` etc. are ignored by
  the server, `minItems`/`maxItems` are enforced. Complex schemas can be rejected
  with `400 INVALID_ARGUMENT`. Always validate output in our own code.
- Rate-limit errors are `429 RESOURCE_EXHAUSTED`.
- The docs' REST example for structured output has a stray closing brace, so
  do not copy it verbatim.
