"use client";

import { useRef, useState } from "react";
import type { AnalyzeResponse, SampleResponse } from "@/lib/api/types";
import { analyzeFile, ApiClientError, checkFile, loadSample } from "@/lib/ui/client";
import { Landing } from "./Landing";
import { Workspace } from "./Workspace";

type Phase =
  | { kind: "idle"; error?: { message: string; rateLimited: boolean } }
  | { kind: "loading"; what: string }
  | {
      kind: "ready";
      data: AnalyzeResponse;
      name: string;
      /** Saved answers for the sample, so suggested questions need no live call. */
      saved: SampleResponse["qa"] | null;
    };

export function App() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // Lets us ignore a slow response if the person has started something else.
  const latest = useRef(0);

  function fail(id: number, err: unknown) {
    if (id !== latest.current) return;
    const message = err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.";
    setPhase({ kind: "idle", error: { message, rateLimited: err instanceof ApiClientError && err.code === "RATE_LIMITED" } });
  }

  async function onFile(file: File) {
    const problem = checkFile(file);
    if (problem) {
      setPhase({ kind: "idle", error: { message: problem, rateLimited: false } });
      return;
    }
    const id = ++latest.current;
    setPhase({ kind: "loading", what: file.name });
    try {
      const data = await analyzeFile(file);
      if (id === latest.current) setPhase({ kind: "ready", data, name: file.name, saved: null });
    } catch (err) {
      fail(id, err);
    }
  }

  async function onSample() {
    const id = ++latest.current;
    setPhase({ kind: "loading", what: "the sample contract" });
    try {
      const sample = await loadSample();
      if (id === latest.current) {
        setPhase({ kind: "ready", data: sample.analysis, name: "Sample contract", saved: sample.qa });
      }
    } catch (err) {
      fail(id, err);
    }
  }

  function reset() {
    latest.current++;
    setPhase({ kind: "idle" });
  }

  return (
    <div className="app">
      <header className="bar">
        <span className="bar__name">Contract Explainer</span>
        {phase.kind === "ready" && (
          <span className="bar__file" title={phase.name}>
            {phase.saved ? "Sample contract (saved result)" : phase.name}
          </span>
        )}
        <span className="bar__note">Explains and flags. Not legal advice.</span>
        {phase.kind === "ready" && (
          <button type="button" className="btn btn--quiet" onClick={reset}>
            Start over
          </button>
        )}
      </header>

      {phase.kind === "ready" ? (
        <Workspace key={phase.name} data={phase.data} saved={phase.saved} />
      ) : (
        <Landing
          loading={phase.kind === "loading" ? phase.what : null}
          error={phase.kind === "idle" ? (phase.error ?? null) : null}
          onFile={onFile}
          onSample={onSample}
        />
      )}
    </div>
  );
}
