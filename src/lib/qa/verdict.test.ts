import { describe, expect, it } from "vitest";
import { isVerdictQuestion, VERDICT_DECLINE_MESSAGE } from "./verdict";

describe("isVerdictQuestion: asks for a judgement of the whole contract, so it is declined", () => {
  it.each([
    "Is this contract completely safe to sign?",
    "is this safe to sign",
    "Is it OK to sign this?",
    "Is it okay to sign?",
    "Is it worth signing?",
    "Is it a good idea to sign this agreement?",
    "Should I sign this?",
    "should we accept this lease",
    "Should I agree to these terms?",
    "Would you sign this contract?",
    "Do you recommend this agreement?",
    "Can I trust this contract?",
    "Is this agreement fair?",
    "Is this lease reasonable overall?",
    "Is the contract legit?",
    "Is this a good deal?",
    "Is this a good contract?",
    "Is this a scam?",
    "Is this contract risky?",
    "Is my agreement standard?",
    "What do you think of this contract?",
    "Are there any red flags?",
    "Any red flags here?",
    "Is there anything wrong with this agreement?",
    "Is there anything unusual in it?",
    "Is there anything I should worry about?",
    "Any dealbreakers?",
    "IS THIS CONTRACT SAFE???",
    "is  this\ncontract   really   fair?",
  ])("declines %j", (q) => {
    expect(isVerdictQuestion(q)).toBe(true);
  });
});

describe("isVerdictQuestion: ordinary questions are answered, never declined", () => {
  it.each([
    // The case the owner cares about: a direct factual answer.
    "Is there a late fee?",
    "Is there a late payment fee, and how much is it?",
    "Are there any penalties for leaving early?",
    "Does the contract mention a late fee?",
    "What happens if I pay late?",
    "How much notice do I need to give?",
    "What is the notice period?",
    "Can I show this work in my portfolio?",
    "Is the deposit refundable?",
    "When does the deposit have to be returned?",
    "Is parking included in the rent?",
    "Is the Client allowed to end the contract early?",
    "Can the landlord enter without telling me?",
    "Can I sign this electronically?",
    "Is it ok to sign electronically?",
    "Do I have to sign in front of a witness?",
    "Who owns the work I produce?",
    "Does the agreement renew automatically?",
    "Is the late fee fair?",
    "Is the non-compete too long?",
    "Is the liability capped?",
    "Is the contract governed by Examplia law?",
    "Is this document a lease or a licence?",
    "Who signs for the Client?",
    "When does the agreement start?",
    "How long does the confidentiality duty last?",
    "Can I terminate for convenience?",
    "Are there any fees for cancelling?",
    "What risks does the Contractor carry for damage?",
    "Is there a probation period?",
    "Does this contract say it is safe?",
    "Which court hears disputes?",
    "Should I give notice in writing?",
    "Should I pay by the first of the month?",
    "Do I need to accept the terms of the schedule?",
  ])("answers %j", (q) => {
    expect(isVerdictQuestion(q)).toBe(false);
  });

  it("says plainly what it will and will not do", () => {
    expect(VERDICT_DECLINE_MESSAGE).toContain("not give legal advice");
    expect(VERDICT_DECLINE_MESSAGE).toContain("Risks tab");
    expect(VERDICT_DECLINE_MESSAGE).not.toContain("—");
  });
});
