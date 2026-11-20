// SYNTHETIC SAMPLE. All names, amounts and terms are invented.
// Each inner array is one PDF page; each string is one paragraph.
export const SAMPLE_TITLE = "Freelance Services Agreement (synthetic sample)";

export const SAMPLE_PAGES: string[][] = [
  [
    "FREELANCE SERVICES AGREEMENT",
    "SYNTHETIC SAMPLE DOCUMENT. Fictional parties. Not a real contract.",
    "This Agreement is made on 1 March 2026 between Northwind Digital Ltd, a fictional company (the \"Client\"), and Jordan Example, a fictional freelance designer (the \"Contractor\").",
    "1. SERVICES. The Contractor will provide brand design and website design services as described in Schedule A (the \"Services\"). The Client may change the scope of the Services at any time by email, and the Contractor must complete the changed scope without additional charge.",
    "2. TERM. This Agreement starts on 1 March 2026 and continues for an initial term of 12 months. After the initial term it renews automatically for successive 12 month terms unless either party gives written notice of non-renewal at least 90 days before the end of the then-current term.",
    "3. FEES. The Client will pay the Contractor a fixed fee of USD 24,000 for the Services, payable in twelve equal monthly instalments of USD 2,000. The Contractor is responsible for all of their own taxes and expenses.",
  ],
  [
    "4. PAYMENT TERMS. The Contractor will invoice monthly. The Client will pay each invoice within 75 days of receipt. If the Contractor delivers any work late, a late fee of 5% of the monthly fee is deducted for each week of delay. The Client may withhold payment of any invoice it disputes in good faith, without limit of time.",
    "5. INTELLECTUAL PROPERTY. All work product, including any pre-existing materials, tools, templates and ideas the Contractor uses or mentions in connection with the Services, becomes the sole property of the Client on creation. The Contractor assigns all rights worldwide and waives all moral rights. The Contractor may not show the work in a portfolio without written consent.",
    "6. CONFIDENTIALITY. The Contractor must keep all information about the Client confidential during the term and for 10 years after the Agreement ends.",
    "7. NON-COMPETE. During the term and for 24 months after it ends, the Contractor will not provide design services to any business that operates in the same industry as the Client or any of its affiliates, anywhere in the world.",
  ],
  [
    "8. TERMINATION. The Client may terminate this Agreement at any time, for any reason or no reason, with 24 hours written notice. The Contractor may terminate only for the Client's uncured material breach, with 60 days written notice. On termination by the Client, the Client owes fees only for Services accepted before the termination date.",
    "9. LIABILITY. The Contractor is liable for all losses, damages and costs of any kind arising from the Services, with no cap. The Client's total liability to the Contractor will not exceed the fees paid in the previous one month.",
    "10. INDEMNITY. The Contractor will indemnify the Client against all claims, including claims arising from the Client's own instructions or negligence.",
    "11. INDEPENDENT CONTRACTOR. The Contractor is an independent contractor and not an employee. The Contractor must work the hours set by the Client and use equipment specified by the Client.",
    "12. GOVERNING LAW AND DISPUTES. This Agreement is governed by the laws of the fictional Republic of Examplia. Disputes will be resolved by binding arbitration in Examplia City, with the Contractor paying all arbitration costs.",
    "SIGNED: Northwind Digital Ltd (Client) ____________   Jordan Example (Contractor) ____________",
  ],
];

// Which clause numbers we deliberately made risky, for sanity checks and evals.
export const SAMPLE_EXPECTED_RISKY_CLAUSES = ["2", "4", "5", "7", "8", "9", "10", "11", "12"];
