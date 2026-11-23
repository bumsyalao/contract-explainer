"use client";

import { useId, useState } from "react";
import { MAX_UPLOAD_MB } from "@/lib/ui/client";

type Props = {
  loading: string | null;
  error: { message: string; rateLimited: boolean } | null;
  onFile: (file: File) => void;
  onSample: () => void;
};

export function Landing({ loading, error, onFile, onSample }: Props) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);

  return (
    <main className="landing">
      <div className="landing__copy">
        <h1 className="landing__title">Understand a contract before you sign it</h1>
        <p className="landing__lede">
          Upload a PDF to see its key terms and the clauses that could work against you. Every point quotes the
          contract and links to the page it came from.
        </p>

        {loading ? (
          <div className="working" role="status" aria-live="polite">
            <p className="working__title">Reading {loading}</p>
            <p className="working__hint">The free AI model usually takes 10 to 30 seconds. If it is busy, this can take longer.</p>
            <div className="working__bar" aria-hidden="true" />
          </div>
        ) : (
          <>
            {error && (
              <div className="alert" role="alert">
                <p>{error.message}</p>
                {error.rateLimited && <p>You can still explore the sample contract while you wait.</p>}
              </div>
            )}

            <div className="actions">
              <button type="button" className="btn btn--primary" onClick={onSample}>
                Try the sample contract
              </button>
            </div>

            <div
              className={`drop${dragging ? " drop--over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files[0];
                if (file) onFile(file);
              }}
            >
              <input
                id={inputId}
                className="drop__input"
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) onFile(file);
                }}
              />
              <label htmlFor={inputId} className="btn btn--secondary">
                Choose a PDF
              </label>
              <p className="drop__hint">
                or drop one here. Text-based PDFs only, up to {MAX_UPLOAD_MB} MB. Scanned documents are not supported yet.
              </p>
            </div>

            <p className="warning">
              <strong>Use made-up or sample contracts only.</strong> This public demo sends your file to a free AI
              service. Do not upload a real contract or anything with personal details.
            </p>
          </>
        )}
      </div>

      <aside className="landing__sheet" aria-label="Example of a highlighted clause">
        <div className="sheet sheet--demo">
          <p className="sheet__page">Page 1</p>
          <div className="clause clause--demo">
            <span className="clause__label">Clause 2</span>
            <p className="clause__text">
              This Agreement starts on 1 March 2026 and continues for an initial term of 12 months. After the initial
              term{" "}
              <mark className="marker">it renews automatically for successive 12 month terms</mark> unless either
              party gives written notice of non-renewal at least 90 days before the end of the then-current term.
            </p>
          </div>
        </div>
        <p className="landing__caption">
          Each flag highlights the exact words it is based on, and shows which clause and page they are on.
        </p>
      </aside>
    </main>
  );
}
