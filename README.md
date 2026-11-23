# Contract Explainer

I built this over a weekend to learn how to build products on top of language models.
You give it a contract (a lease, a freelance agreement, a software licence) and it tells
you, in plain language, what the key terms are and which clauses could work against you.

The rule I cared about most: **every point has to quote the exact words from the contract
and show the page they came from.** If the model says something and I cannot find its
quote in the document, the app throws that point away instead of showing it to you.

It explains and flags. **It is not legal advice.** Please do not sign or refuse to sign
anything because of what a tool like this says.

## Live demo

LIVE_DEMO_LINK

The hosted demo is for the sample contract and other made-up contracts only. It sends
files to a free AI service, so please do not upload a real contract or anything with
personal details.

## What you get

- A short summary of what the agreement is and who is involved.
- **Risks**: clauses that look one-sided or unusual (automatic renewal, ending the deal at
  24 hours notice, uncapped liability, giving away all your work, and so on), worst first.
- **Key terms**: dates, amounts, notice periods, renewal and penalties.
- **Ask a question**: answers that come only from the document, with the quote they rely on.
- Click any "Clause 7, page 2" link and the exact words are highlighted in the contract.

## How it works

1. **Read the PDF** page by page (`unpdf`). Scanned PDFs are turned away with a clear
   message, because I cannot trust text that came from guessing at pixels.
2. **Split it into clauses.** I look for numbered headings first and fall back to chunks
   of text when there are none. Every clause keeps its page and its exact position.
3. **Ask the model twice**: once for key terms, once for risks. It has to answer in a strict
   JSON shape and cite a clause and a quote for everything.
4. **Check every quote.** A quote must appear word for word in the clause it cites, after
   ignoring only layout differences (line breaks, curly quotes, a word split with a hyphen
   at the end of a line). Capital letters, numbers and words must match exactly, so "30 days"
   can never pass as "60 days". Page numbers and highlight positions come from my own data,
   never from the model.
5. **Answer questions the same way.** If none of an answer's quotes check out, the answer is
   not shown and you are told the document does not say.

The contract text is treated as untrusted. It could say "ignore your instructions", so it
only ever goes in a fenced block with a random label that the contract cannot guess, the model
has no tools, and the app shows everything as plain text.

The full list of choices, with the options I weighed and why I picked each, is in
[DECISIONS.md](DECISIONS.md).

## How well does it work?

I wrote 10 invented contracts with 38 planted risks (including two clean ones, a contract
that tries to hijack the model, and one with messy line breaks) and ran three free models
over them. Method and caveats are in [evals/README.md](evals/README.md).

EVAL_RESULTS

## What it cannot do (yet)

- **Long documents.** The free AI tier allows about 8,000 tokens a minute, so I cap
  documents at roughly 7 pages and 4 MB. Longer ones get a clear message.
- **Scanned PDFs.** No OCR yet.
- **Real contracts.** I wanted a local mode for private documents, but the models I would
  run locally do not fit on my machine. So the hosted version is for made-up contracts only.
  Redaction of personal details is not built, and I note it as something to improve.
- **Being right.** Quotes are verified. Summaries and explanations are written by the model
  and can still be loose. In my first test one model turned "5% of the monthly fee per week"
  into "5% per week". Subtle problems get missed too: in the sample, every model missed a
  clause that calls someone an independent contractor while telling them when and where to work.
- **Busy times.** Everyone shares one free quota, so you may see a "busy" message.

## Run it yourself

You need Node 22 or newer and a free Groq key from [console.groq.com](https://console.groq.com)
(no card needed).

```bash
npm install
cp .env.example .env.local     # then paste your key into .env.local
npm run dev                    # http://localhost:3000
```

The sample contract works without a key. Your key stays on the server and is never sent to
the browser. Nothing is stored: files are read in memory and forgotten when the request ends.

```bash
npm test                       # unit tests, no network
npm run typecheck && npm run lint
```

## Deploying to Vercel

1. Import the repository in Vercel.
2. Add these environment variables: `GROQ_API_KEY`, and the model names from `.env.example`
   (`GROQ_MODEL_LARGE`, `GROQ_MODEL_SMALL`, `GROQ_MODEL_COMPARE`).
3. To keep the public demo from using up your free quota, set `LIVE_ANALYSIS=off`. Visitors
   then get the saved sample only, with no model calls. Turn it on when you want live uploads.
4. In the Groq console, switch on zero data retention under Data Controls.

## Privacy

The app stores nothing. When live analysis is on, the file's text is sent to Groq. Groq says
it does not keep inference requests by default, though it may log them for up to 30 days to
troubleshoot or investigate abuse, and zero data retention switches that off. That is why
the hosted demo is for made-up contracts only.

## Project map

| Path | What is there |
|---|---|
| `src/lib/pdf`, `src/lib/segment` | PDF text and clause splitting |
| `src/lib/analysis` | prompts, schemas and the two-call pipeline |
| `src/lib/verify` | quote matching and the verification step |
| `src/lib/qa` | the question box |
| `src/lib/llm` | model wrapper (Groq, plus an optional Gemini adapter) |
| `src/app/api`, `src/lib/api` | the routes, errors and the sample |
| `src/components` | the two-pane interface |
| `evals` | the synthetic contracts, scorer and results |
| `scripts` | sample builder and the checklist to run before going public |

## License

MIT, see [LICENSE](LICENSE).
