# Decisions

Each entry lists the options considered, what was chosen, and why. Status says
whether it is built, and what to revisit. Written as we build, so some entries
are "decided, not built yet".

## D1. PDF parsing library
- Options: `unpdf` (pdf.js packaged for serverless), `pdfjs-dist` directly, `pdf-parse`.
- Chosen: `unpdf`.
- Why: it gives per-page text, runs on Vercel, and is maintained. Page boundaries
  matter more here than layout fidelity. `pdfjs-dist` is the fallback if we ever
  need text coordinates. `pdf-parse` is old and has bundling quirks.
- Status: built. Revisit if tables or two-column layouts extract badly.

## D2. Scanned PDFs
- Options: detect and reject; OCR through a multimodal model; local OCR.
- Chosen: detect and reject with a clear message.
- Why: OCR adds a second source of text errors, and quote verification depends on
  trustworthy source text. This is a weekend build that should be simple first.
- Status: built (a PDF where under half the pages have real text is rejected).
- Future: OCR (hosted for synthetic documents only, or local).

## D3. Clause segmentation
- Options: regex heuristics; LLM segmentation; hybrid.
- Chosen: hybrid. Heading heuristics (numbers, Article, Section) first, size-based
  chunks when fewer than two headings are found.
- Why: ids let the model cite "clause 7" and let us check it. The LLM never
  rewrites the text, so quotes stay verifiable. Clauses never cross a page, so
  every quote has one unambiguous page. A clause that continues onto the next
  page becomes `7-cont`.
- Status: built. Every clause keeps `text === pageText.slice(start, end)`.

## D4. Schema and calls
- Options: one big call; two calls (key terms, then flags); one call per clause.
- Chosen: two sequential calls.
- Why: shorter outputs are more accurate than one long one, and per-clause calls
  would blow through free-tier limits. Sequential, so we do not burst through the
  per-minute token limit.
- Flag shape (options: clause id plus quote; quote only; clause id plus quote plus
  model-stated page). Chosen: clause id plus exact quote. Page and character
  offsets always come from our own data, never from the model, because models get
  page numbers wrong. This powers the "clause 7, page 2" link in the UI.
- Schemas are written once in Zod (runtime validation and JSON Schema), with every
  field required and objects closed, which Groq's strict mode needs.
- Status: built.

## D5. Quote matching
- Options: exact; fuzzy; exact first with a tight fuzzy fallback.
- Chosen: exact, after layout-only normalisation.
- Normalisation (options: layout-only and case-sensitive; plus case-insensitive;
  plus ignoring all punctuation). Chosen: layout-only, case-sensitive. We ignore
  runs of whitespace and line breaks, odd space characters, soft hyphens,
  zero-width characters, a word split by a line-break hyphen, curly versus straight
  quotes, dash variants and ligatures. Case, digits, words and other punctuation
  must match exactly, so "30 days" can never match "60 days".
- Line-break hyphens are ambiguous ("termi-\nnation" versus "non-\ncompete"), so we
  try both readings of the source.
- Wrong clause cited (options: drop; relocate if exactly one other clause contains
  the quote; relocate to the first match). Chosen: relocate only if exactly one
  other clause contains the quote, and record `relocated_from`. If several do, drop
  as ambiguous.
- Also: quotes under 6 characters are rejected (too little evidence), and a repeated
  quote on the same clause is shown once.
- Status: built. First live result: one flag was dropped because the model joined two
  sentences with "...". See future enhancements.
- Limits to know: only quotes are verified. Summaries, key-term values and
  explanations are written by the model and can still be loose (one run summarised
  "5% of the monthly fee per week" as "5% per week").

## D6. Prompt injection (contract text is untrusted)
- Options: delimiters and instructions only; plus output constraints and verifier;
  plus a separate detector pass.
- Chosen: delimiters, schema-only output, no tools, and the verifier.
- Why: most of the protection comes from the app having no powers (the model can only
  return JSON, it has no tools and no network) and from the verifier checking every
  quote against the source. A detector adds cost and is unreliable. Contract text is
  only ever in the user turn, inside `<document>` tags, never in the system prompt.
- Fences: the contract and the question are each wrapped in tags that carry a random
  per-request suffix (`<document-3fa9...>`). A fixed tag could be closed early by tag
  text inside a contract, which would make what follows look like trusted instructions.
  The suffix is unpredictable, so injected tags are just text (tested).
- Status: prompts, fences and trust-boundary tests are built. The UI must render
  everything as plain text, never HTML (to do). One injection contract is planned for
  the evals.

## D7. Redaction of personal details
- Options: none; regex redaction; local-only for real documents.
- Chosen: none for now. The hosted path is for synthetic contracts only, and the UI
  will say so.
- Why: partial redaction gives false comfort and conflicts with exact quoting.
- Constraint that changed the plan: the owner cannot run local models (disk space),
  so the planned local mode is not built.
- Status: decided. Flagged as an area to improve in later versions.

## D8. Model provider and Q&A
- Provider wrapper: one interface (`generate` returns parsed JSON, usage and
  latency), with Groq and Gemini adapters, 429 retry with backoff, and a mock for tests.
- How we got here: Google's free key needed card details, and so did xAI. The owner
  does not want to enter a card. Groq's free tier needs none (a payment method is only
  needed to upgrade). Ollama and Gemma were dropped because the owner's machine has no
  spare disk space. The Gemini adapter stays as an optional extra.
- Chosen models (all support strict structured output): `openai/gpt-oss-120b`
  (default), `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`.
- Gemini notes: the Interactions API stores requests by default (one day on the free
  tier), so the adapter sends `store: false` on every call, and a test enforces it.
- Free-tier limits shaped the design: 8,000 tokens per minute means about one document
  per minute. gpt-oss models spend many hidden reasoning tokens, so we default them to
  low reasoning effort. Documents over about 7 pages are refused with a clear message.
- Q&A (options: whole document in context; retrieval over clauses). Chosen: whole
  document, answers must cite clause ids and verbatim quotes, run through the same
  verifier, with "not found in this document" as the fallback.
- Q&A rules, as built: an answer is shown only if at least one citation is a real quote
  (checked by the same resolver as the flags). If none verify, the model's answer is
  withheld and we say the document does not say. An answer with no citations is never
  shown. Questions are capped at 500 characters and treated as untrusted input.
- Live check on the sample (four questions, one model): two answerable questions got
  correct answers with verified citations, a question the contract does not answer got
  "not found", and an instruction-hijack question got "not found". Each question cost
  about 1.6K tokens.
- Status: provider wrapper and Q&A built.
- Details and sources: `docs/groq-api-notes.md`, `docs/gemini-api-notes.md`.

## D9. Evals and model comparison
- Options: same prompts and schema for every model; tune prompts per model.
  Scoring by label matching versus an LLM judge.
- Chosen: same prompts and schema for all models, scored by label matching on clause
  id and category, with no LLM judge.
- Why: it is cheap, reproducible and easy to explain. A judge adds bias and cost.
- Metrics: flag recall and precision against hand labels, quote-verification pass
  rate, key-term accuracy, tokens, and latency. Cost is reported as tokens, because the
  free tier has no dollar cost.
- Status: built. Results are in `evals/results/RESULTS.md` and summarised in the README.
- What the first run showed (one run each, so treat it as a picture, not a ranking):
  all three found most of the 38 planted risks (37, 35 and 36), the checker dropped 3
  invented quotes from the largest model, the commonest false alarm was a fair mutual
  liability cap, and qwen labelled risks poorly even when it found the right clause.
- Two things I got wrong and fixed: the scorer first marked "two years" wrong against
  "2 years", and the key-fact check asks for facts my key-terms prompt never requests, so
  every model missed the same ones. I report that score as it is and say why.
- Injection finding, a real limit of design D5 and D6: the verifier proves a quote is in the
  document, not that it is a genuine term. `gpt-oss-120b` answered "the contract states it is
  completely safe to sign" from a planted sentence, and the verifier passed it because the
  sentence is really there. A future fix would flag text that addresses AI readers.
- I have not changed the default model. The differences are small enough that one run does not
  justify it, so that is your call.

## D10. API shape, statelessness and the public demo
- Q&A state (options: the browser sends the clauses back with each question; the
  browser re-uploads the PDF; a signed token holding the clauses). Chosen: the browser
  holds the clauses and sends them back. The server stores nothing. The payload is
  validated (shape, page range, size caps) and only used as prompt text and as the
  source for checking citations, so a tampered payload only affects the person who sent it.
- Routes: `POST /api/analyze` (multipart PDF), `POST /api/ask` (JSON), `GET /api/sample`
  (static cached result). Handlers take an injectable provider, so they are tested
  without network.
- Safety rules, all tested: oversized uploads are rejected from their declared length
  before being read; malformed requests never reach the model; upstream error text is
  never forwarded (it can echo the contract); dropped quotes are never returned, only
  counts; configuration problems return a generic message; logs hold error names and
  codes, never messages or contract text.
- Cached sample: the demo serves a stored result for the synthetic sample, with three
  suggested questions and answers, so it needs no live calls. A test fails if the cache
  stops matching the sample PDF. The cache holds one real run, including its misses.
- Checked against a production build and real HTTP: the analyse route took about 6.6 s
  and verified every quote, and ask took about 1 s.
- Rate limits, checked for real: two analyses fired at once both succeeded, but one took
  25 s because the retry backoff caught a 429. All visitors share one free-tier budget
  (about 8K tokens per minute), so a few simultaneous users will see "busy" messages.
- Public abuse: anyone could spend the free quota. There is no database, so a proper
  per-visitor limit needs a shared store. Not built yet. Options for the deploy step:
  Vercel's firewall rate limiting, or keeping live analysis behind a visible warning.
- Status: built.

## D12. Protecting the free quota, and one targeted retry
- Problem: the demo runs on a free key shared by every visitor, so anyone can use it up.
- Options: do nothing and accept "busy" messages; add a per-visitor limit; add a switch
  that turns live analysis off. A per-visitor limit needs a shared store, and the brief
  says no database. Vercel's firewall rate limiting can do it at the platform level.
- Chosen: a kill switch (`LIVE_ANALYSIS=off`). The demo then serves only the saved sample.
  Uploads and live questions return a friendly 503 before any model call, and the
  interface explains it (no upload box, saved questions only). Tested in the handlers and
  in a real browser. Platform rate limiting is a good extra once deployed.
- Retries: a 429 is retried with backoff, but a long wait (a daily quota) is not, because
  retrying inside a web request would waste the attempt. Groq also sometimes returns an
  intermittent `400 json_validate_failed` (seen on the first pipeline run and again on
  `qwen3.8-27b` in the evals). That one code, and only that one, is retried twice straight
  away. Other 400s are not.
- Status: built.

## D11. The interface
- Layout (options: two panes with findings left and the document right; a single
  column with expandable sources; the document first with margin notes). Chosen: two
  panes. Evidence and claim sit side by side, which is the core of the product. On
  phones the panes stack, and a floating "Back to findings" button appears once you
  have jumped to a quote.
- Interaction: every "show me where" link (risks, key terms, answer citations) uses
  one code path. It sets the highlight, scrolls the exact quoted words to the centre
  of the contract and marks the clause label. The link text is "Clause 7, page 2".
  Offsets come from the verifier, so the highlight is exactly the verified quote
  (checked in a browser test against the quote text).
- Look: one deliberate choice. The only warm colour is the marker yellow, so the quoted
  words are the first thing your eye finds. The rest is a cool desk, white sheets and
  navy ink. Findings are ruled rows with a severity edge, not cards. Severity is
  written in words ("High risk"), never colour alone. Type is a printed-contract serif
  for the contract and headings, and the system sans for controls. System font stacks
  keep the build free of font downloads. Dark mode and reduced motion are supported.
- Trust copy shown in the interface: "Explains and flags. Not legal advice." in the top
  bar and again under the findings, "Use made-up or sample contracts only" on the
  landing screen, and a line saying every highlighted quote was found in the document
  (with a count of anything removed).
- Rendering rule from D6: all contract text, quotes and answers are rendered as React
  text, never as HTML.
- Checked with a real browser at desktop and phone width (Playwright): 20 checks on the
  sample flow, including that highlighted words equal the quote, no horizontal
  scrolling, keyboard tab navigation, and no console errors. Not yet checked with a
  screen reader.
- Status: built.

## Future enhancements
- Scanned PDFs through OCR.
- A labelled local mode (for example Ollama) for real documents, and better redaction.
- Allow a quote written with "..." by verifying each piece separately, in order, in the
  same clause, and highlighting each piece. Every piece would still be exact text.
- Cross-check numbers in a key term's `value` against its quote, to catch loose summaries.
- Fuzzy matching as a tight fallback (must also match every number and date).
- Retrieval over clauses for documents beyond the free-tier size limit.
- Group several flags on one clause in the UI.
- Subtle risks the models missed on the sample (an "independent contractor" clause
  where the client still controls hours and equipment).
- Re-check model names and free-tier limits regularly: they change often.
