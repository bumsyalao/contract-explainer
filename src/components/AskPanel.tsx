"use client";

import { useRef, useState, type FormEvent } from "react";
import type { AnalyzeResponse, AskResponse, SampleResponse } from "@/lib/api/types";
import { MAX_QUESTION_CHARS } from "@/lib/qa/limits";
import { askQuestion, ApiClientError } from "@/lib/ui/client";
import type { Selection } from "@/lib/ui/highlight";
import { JumpLink } from "./JumpLink";

type Item = {
  id: number;
  question: string;
  state:
    | { kind: "loading" }
    | { kind: "done"; result: AskResponse; saved: boolean }
    | { kind: "error"; message: string };
};

type Props = {
  data: AnalyzeResponse;
  saved: SampleResponse["qa"] | null;
  liveEnabled: boolean;
  activeKey: string | null;
  onShow: (key: string, sel: Selection) => void;
};

const GENERIC_SUGGESTIONS = [
  "How can I end this contract?",
  "What happens if a payment is late?",
  "Who owns the work I produce?",
];

export function AskPanel({ data, saved, liveEnabled, activeKey, onShow }: Props) {
  const [text, setText] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const nextId = useRef(1);
  const busy = items.some((i) => i.state.kind === "loading");
  const suggestions = saved ? saved.map((s) => s.question) : GENERIC_SUGGESTIONS;

  function patch(id: number, state: Item["state"]) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, state } : i)));
  }

  async function ask(raw: string) {
    const question = raw.trim();
    if (!question || busy) return;
    const id = nextId.current++;
    setText("");

    // The sample's suggested questions have saved answers, so they need no live call.
    const hit = saved?.find((s) => s.question === question);
    if (hit) {
      setItems((prev) => [{ id, question, state: { kind: "done", result: hit.result, saved: true } }, ...prev]);
      return;
    }

    setItems((prev) => [{ id, question, state: { kind: "loading" } }, ...prev]);
    try {
      const result = await askQuestion(question, data.clauses);
      patch(id, { kind: "done", result, saved: false });
    } catch (err) {
      patch(id, {
        kind: "error",
        message: err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.",
      });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(text);
  }

  return (
    <div className="ask">
      {liveEnabled ? (
      <form className="ask__form" onSubmit={onSubmit}>
          <label className="ask__label" htmlFor="question">
            Ask about this contract
          </label>
          <p className="ask__hint">Answers come only from the document and quote the words they rely on.</p>
          <div className="ask__row">
            <input
              id="question"
              className="ask__input"
              type="text"
              value={text}
              maxLength={MAX_QUESTION_CHARS}
              placeholder="For example: Can I end this early?"
              onChange={(e) => setText(e.target.value)}
              autoComplete="off"
            />
            <button type="submit" className="btn btn--primary" disabled={busy || text.trim() === ""}>
              Ask
            </button>
          </div>
        </form>
      ) : (
        <div className="ask__form">
          <p className="ask__label">Ask about this contract</p>
          <p className="ask__hint">Custom questions are switched off on this demo. Pick one of the saved questions below.</p>
        </div>
      )}

      <div className="chips" aria-label="Suggested questions">
        {suggestions.map((s) => (
          <button key={s} type="button" className="chip" disabled={busy} onClick={() => void ask(s)}>
            {s}
          </button>
        ))}
      </div>

      <div aria-live="polite">
        {items.length === 0 && <p className="empty">Ask a question, or pick one above.</p>}
        <ul className="list">
          {items.map((item) => (
            <li key={item.id} className="answer">
              <h3 className="answer__q">{item.question}</h3>
              {item.state.kind === "loading" && <p className="answer__wait">Looking in the contract…</p>}
              {item.state.kind === "error" && <p className="answer__error">{item.state.message}</p>}
              {item.state.kind === "done" && (
                <Result
                  result={item.state.result}
                  saved={item.state.saved}
                  itemId={item.id}
                  activeKey={activeKey}
                  onShow={onShow}
                />
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Result({
  result,
  saved,
  itemId,
  activeKey,
  onShow,
}: {
  result: AskResponse;
  saved: boolean;
  itemId: number;
  activeKey: string | null;
  onShow: (key: string, sel: Selection) => void;
}) {
  if (result.status === "not_found") {
    return (
      <>
        <p className="answer__none">The contract does not say.</p>
        {result.reason === "no_verified_citation" && (
          <p className="answer__note">
            The AI gave an answer, but it could not point to a quote in the contract, so it was left out.
          </p>
        )}
      </>
    );
  }
  return (
    <>
      <p className="answer__text">{result.answer}</p>
      <ul className="cites">
        {result.citations.map((c, i) => {
          const key = `cite:${itemId}:${i}`;
          const show = () => onShow(key, { page: c.page, start: c.start, end: c.end });
          return (
            <li key={key} className="cite" data-active={activeKey === key}>
              <blockquote className="quote">{c.quote}</blockquote>
              <JumpLink clauseId={c.clause_id} page={c.page} onClick={show} />
            </li>
          );
        })}
      </ul>
      {result.unverified_citations > 0 && (
        <p className="answer__note">
          {result.unverified_citations} other {result.unverified_citations === 1 ? "quote" : "quotes"} the AI gave could
          not be found in the contract and {result.unverified_citations === 1 ? "was" : "were"} left out.
        </p>
      )}
      {saved && <p className="answer__note">Saved answer from the sample, no live call.</p>}
    </>
  );
}
