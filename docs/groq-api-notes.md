# Groq API notes (verified against official docs on 2026-11-23)

Sources (all under https://console.groq.com/docs): `structured-outputs`,
`rate-limits`, `models`, `your-data`, `billing-faqs`, `api-reference`.
Model names and limits change often. Re-check before editing `.env`.

## Why Groq
- A free tier exists. A payment method is only needed to upgrade to the
  Developer plan (billing FAQ).
- Chosen because the owner cannot run models locally and does not want to enter
  card details. Gemini stays supported in code if a key is ever available.

## Endpoint and shape
- `POST https://api.groq.com/openai/v1/chat/completions`, header
  `Authorization: Bearer <key>`.
- Structured output: `response_format: { type: "json_schema", json_schema: { name, strict, schema } }`.
- Response text: `choices[0].message.content`. Usage: `usage.prompt_tokens`,
  `usage.completion_tokens`. Truncation shows as `finish_reason: "length"`.
- `429` includes a `retry-after` header in seconds. `retry-after` is only set
  on a 429.

## Structured output modes
- `strict: true` uses constrained decoding (always valid, schema-conformant).
  Needs every property in `required` and `additionalProperties: false` on every
  object. Optional values use a type array with "null".
  Models: `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `qwen/qwen3.8-27b`,
  `meta-models/muse-spark-open`.
- `strict: false` is best effort and can return HTTP 400
  "Generated JSON does not match the expected schema".
- Streaming and tool use are not supported with structured outputs.
- The docs say output is schema-compliant, not semantically correct. We still
  verify every quote against the source.
- `src/lib/llm/strict-schema.ts` checks our schemas against these rules.

## Free-tier limits (docs table, base limits, may differ per account)
| Model | RPM | RPD | TPM | TPD |
|---|---|---|---|---|
| openai/gpt-oss-120b | 30 | 1K | 8K | 200K |
| openai/gpt-oss-20b | 30 | 1K | 8K | 200K |
| qwen/qwen3.8-27b | 30 | 1K | 8K | 200K |

The 8K tokens per minute limit is the one that bites: a long contract plus the
prompt plus the answer must fit, so long documents may get a 413 or 429. Exact
limits for the account are on the console Limits page.
`muse-spark-open` is listed as enterprise (contact sales), so we skip it.

## Data handling
- "By default, Groq does not retain customer data for inference requests."
- Inputs and outputs may be logged for up to 30 days only to troubleshoot
  failures or investigate abuse. Zero Data Retention can be enabled by any
  customer in Data Controls settings (do this in the console).
- Data that is retained lives in US GCP buckets.
- The docs do not say whether free-tier prompts are used for training.
  Keep the hosted path synthetic-only anyway, as planned.

## Observed on first live calls (2026-11-23, one synthetic clause, 3 requests)
- Key works. Strict structured output returned valid JSON on all three models.
- All three quoted the source text verbatim.
- Strict schema does not mean correct: for "5% of the monthly fee is deducted
  for each week of delay", `gpt-oss-120b` summarised the late fee as
  "5% per week", dropping "of the monthly fee". Explanations and key terms need
  care, and the verifier only protects quotes, not summaries.
- Token use for a ~270 token prompt: `gpt-oss-120b` 567 output tokens,
  `gpt-oss-20b` 514, `qwen3.8-27b` 75. The gpt-oss models spend most of their
  output on reasoning, which counts against the 8K tokens per minute and 200K
  per day limits. A full contract run (two calls) may use a few thousand tokens.
  Check the docs for a way to lower reasoning effort before relying on a
  multi-contract eval run.
- Latency: 120b 1.9 s, 20b 0.8 s, qwen 6.3 s for this tiny request.

## Running code in the cloud session
The key is injected by the session proxy and no variable holds it. Scripts that
read `GROQ_API_KEY` need a placeholder value, and Node needs the proxy turned on:
`GROQ_API_KEY=proxy-injected NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`.
For Vercel, the real key must be added in the project's environment variables.
