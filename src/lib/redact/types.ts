export type Kind =
  | "PERSON"
  | "COMPANY"
  | "EMAIL"
  | "PHONE"
  | "URL"
  | "IBAN"
  | "CARD"
  | "ID"
  | "ADDRESS"
  | "POSTCODE"
  | "ACCOUNT"
  | "DOB"
  | "OTHER";

export const KIND_LABELS: Record<Kind, string> = {
  PERSON: "Person",
  COMPANY: "Company",
  EMAIL: "Email address",
  PHONE: "Phone number",
  URL: "Web address",
  IBAN: "Bank account (IBAN)",
  CARD: "Payment card number",
  ID: "ID or tax number",
  ADDRESS: "Street address",
  POSTCODE: "Postcode",
  ACCOUNT: "Account or sort code",
  DOB: "Date of birth",
  OTHER: "Other",
};

/** A place in one page's text. Offsets index into that page's original text. */
export type Occurrence = { page: number; start: number; end: number };

export type Confidence = "high" | "medium";

/** A span found by a detector on a single page's text, before grouping. */
export type RawSpan = {
  start: number;
  end: number;
  kind: Kind;
  confidence: Confidence;
  reason: string;
  /** Higher wins when two spans overlap. */
  priority: number;
};

export type Source = "detected" | "contract" | "custom";

/** One distinct detail, with every place it occurs. Redacting it replaces all of them. */
export type Suggestion = {
  /** Stable within one analysis of one document. */
  id: string;
  kind: Kind;
  /** The text as first found. */
  value: string;
  occurrences: Occurrence[];
  source: Source;
  confidence: Confidence;
  reason: string;
  /** Higher wins when two details overlap. */
  priority: number;
};
