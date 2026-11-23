/**
 * Questions that ask for a judgement of the WHOLE contract ("is it safe to sign?",
 * "should I sign?") are declined. Two reasons:
 *  - the app explains and flags, it never gives legal advice (the brief's rule), and
 *  - it is the one question a planted sentence in a contract can answer for the model,
 *    whatever wording the plant uses, because declining happens before any model call.
 *
 * It is deliberately narrow. Factual questions ("is there a late fee?", "what is the
 * notice period?", "can I show this in my portfolio?") are NOT declined and get a direct
 * answer from the contract. Pure and client-safe: no server imports.
 */

export const VERDICT_DECLINE_MESSAGE =
  "I can't say whether a contract is safe, fair or worth signing, and this tool does not give legal advice. " +
  "What I can do is show you what it says. The Risks tab lists the clauses that look one-sided, and I can answer " +
  "specific questions, such as the notice period, the fees or who owns the work.";

const GOOD = "(?:safe|ok|okay|alright|fine|good|bad|fair|legit|legitimate|risky|dangerous|trustworthy|reasonable|acceptable|standard|normal|one sided|biased|wise|worth)";
const DOC = "(?:contract|agreement|lease|licen[cs]e|deal|document|paperwork|terms)";

const PATTERNS: RegExp[] = [
  // "should I sign / accept / agree / trust / walk away"
  /\bshould\s+(?:i|we)\s+(?:sign|accept|agree|proceed|go\s+ahead|walk\s+away|refuse|reject|trust)\b/,
  /\bwould\s+you\s+(?:sign|accept|agree|recommend|trust)\b/,
  /\bdo\s+you\s+(?:recommend|advise|suggest)\b/,
  /\bcan\s+i\s+trust\b/,
  // "is it safe / OK / worth ... to sign" (not questions about HOW to sign, such as electronically)
  new RegExp(`\\b${GOOD}\\b(?:(?!\\b(?:electronically|digitally|online|remotely|by email|on behalf|in counterparts)\\b)[^.?!]){0,30}\\b(?:to\\s+sign|signing|to\\s+accept|to\\s+agree|to\\s+proceed)\\b(?!\\s.{0,25}\\b(?:electronically|digitally|online|remotely|by email|on behalf|in counterparts|witness)\\b)`),
  // "is this contract safe / fair / ok / a scam"
  new RegExp(`\\b(?:is|are|was)\\s+(?:this|the|that|my|our)\\s+${DOC}\\s+(?:(?:completely|totally|entirely|really|actually|generally|overall|basically|too|very|pretty|even)\\s+)*(?:${GOOD}|a\\s+scam|a\\s+rip\\s*off|any\\s+good)\\b`),
  new RegExp(`\\bis\\s+(?:this|it)\\s+a\\s+(?:${GOOD}|scam)\\s+(?:${DOC}|idea|thing|choice)\\b`),
  /\bis\s+(?:this|it)\s+a\s+(?:scam|rip\s*off|trap)\b/,
  new RegExp(`\\bwhat\\s+do\\s+you\\s+think\\s+(?:of|about)\\s+(?:this|the)\\s+${DOC}\\b`),
  // overall "anything wrong / red flags"
  /\bred\s+flags?\b/,
  /\b(?:deal\s*breakers?|gotchas?|traps?)\b/,
  /\bis\s+there\s+anything\s+(?:wrong|bad|risky|dangerous|unusual|suspicious|concerning|worrying|to\s+worry|i\s+should\s+(?:worry|watch|know|be\s+(?:careful|worried)))/,
  /\banything\s+(?:i\s+should|to)\s+(?:worry|watch\s+out|be\s+careful)\b/,
];

/** Prepare a question for matching: lower case, layout noise gone, punctuation reduced to spaces. */
function prepare(question: string): string {
  return question
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the question asks for an overall verdict on the contract, which we decline. */
export function isVerdictQuestion(question: string): boolean {
  const q = prepare(question);
  return PATTERNS.some((p) => p.test(q));
}
