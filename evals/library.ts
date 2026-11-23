/**
 * Clause library for the synthetic eval contracts. Everything here is invented.
 *
 * Each entry is one clause. `risk` is the gold label: the clause is genuinely
 * risky or one-sided for the person signing, and `anchor` is a phrase from the
 * clause text that the scorer uses to find it (so scoring never depends on
 * clause numbers, and works on documents with no numbering).
 * `arguable` marks clauses a reasonable reviewer might flag. Flagging those is
 * neither rewarded nor penalised.
 * `facts` are strings a good key-terms answer should contain.
 */
import type { FLAG_CATEGORIES } from "../src/lib/analysis/schemas";
import type { Severity } from "../src/lib/ui/labels";

export type FlagCategory = (typeof FLAG_CATEGORIES)[number];

export type Entry = {
  heading: string;
  text: string;
  risk?: { category: FlagCategory; severity: Severity; anchor: string };
  arguable?: string;
  facts?: string[];
};

const r = (category: FlagCategory, severity: Severity, anchor: string) => ({ category, severity, anchor });

export const LIBRARY = {
  // ---------------------------------------------------------------- freelance
  "fl.services": {
    heading: "SERVICES",
    text: "The Contractor will provide the design services described in Schedule A. Changes to the scope must be agreed in writing by both parties and priced before work on them begins.",
  },
  "fl.services.openscope": {
    heading: "SERVICES",
    text: "The Contractor will provide the design services described in Schedule A. The Client may change or add to the scope at any time by email, and the Contractor must complete the changed scope at no extra charge.",
    risk: r("one_sided_terms", "medium", "at no extra charge"),
  },
  "fl.term.fixed": {
    heading: "TERM",
    text: "This Agreement starts on 4 May 2026 and ends on 3 November 2026. Either party may end it earlier by giving 30 days written notice.",
    facts: ["4 May 2026", "30 days"],
  },
  "fl.term.autorenew": {
    heading: "TERM",
    text: "This Agreement starts on 4 May 2026 for an initial term of 12 months. It then renews automatically for further 12 month terms unless either party gives written notice at least 90 days before the end of the current term.",
    risk: r("auto_renewal", "medium", "renews automatically for further 12 month terms"),
    facts: ["4 May 2026", "90 days"],
  },
  "fl.fees.fixed": {
    heading: "FEES",
    text: "The Client will pay the Contractor a fixed fee of USD 18,000, in six monthly instalments of USD 3,000.",
    facts: ["18,000", "3,000"],
  },
  "fl.pay.net30": {
    heading: "PAYMENT",
    text: "The Contractor will invoice monthly and the Client will pay each invoice within 30 days of receiving it. Late payments carry interest at 1% per month.",
    facts: ["30 days"],
  },
  "fl.pay.net75": {
    heading: "PAYMENT",
    text: "The Contractor will invoice monthly. The Client will pay each invoice within 75 days of receiving it, and may withhold payment of any invoice it disputes for as long as it likes.",
    risk: r("payment_terms", "medium", "within 75 days of receiving it"),
    facts: ["75 days"],
  },
  "fl.pay.latefee": {
    heading: "DELIVERY",
    text: "If the Contractor delivers any milestone late, the Client may deduct 10% of the total fee for each week of delay, with no upper limit.",
    risk: r("penalty", "high", "deduct 10% of the total fee for each week of delay"),
    facts: ["10%"],
  },
  "fl.ip.fair": {
    heading: "OWNERSHIP OF WORK",
    text: "When the Client has paid in full, it owns the final deliverables. The Contractor keeps ownership of its own tools, templates and pre-existing materials, and may show the finished work in its portfolio.",
  },
  "fl.ip.grab": {
    heading: "OWNERSHIP OF WORK",
    text: "Everything the Contractor creates, uses or mentions in connection with the services, including tools, templates and pre-existing materials, becomes the sole property of the Client when it is created, whether or not the Client has paid. The Contractor may not show any of it in a portfolio.",
    risk: r("ip_assignment", "high", "becomes the sole property of the Client when it is created"),
  },
  "fl.conf.short": {
    heading: "CONFIDENTIALITY",
    text: "Each party will keep the other's confidential information private during the term and for 2 years afterwards.",
    facts: ["2 years"],
  },
  "fl.noncompete": {
    heading: "EXCLUSIVITY",
    text: "While this Agreement runs and for 24 months afterwards, the Contractor will not work for any business in the same industry as the Client or any of its affiliates, anywhere in the world.",
    risk: r("non_compete", "high", "for 24 months afterwards"),
    facts: ["24 months"],
  },
  "fl.term.fairend": {
    heading: "ENDING THE AGREEMENT",
    text: "Either party may end this Agreement if the other commits a serious breach and does not fix it within 14 days of written notice. Fees for work already accepted remain payable.",
  },
  "fl.term.oneside": {
    heading: "ENDING THE AGREEMENT",
    text: "The Client may end this Agreement at any time, for any reason, by giving 24 hours notice. The Contractor may end it only if the Client commits an uncured serious breach, by giving 60 days notice. On an ending by the Client, fees are owed only for work the Client has accepted.",
    risk: r("unilateral_termination", "high", "by giving 24 hours notice"),
    facts: ["24 hours", "60 days"],
  },
  "fl.liab.capped": {
    heading: "LIABILITY",
    text: "Each party's total liability under this Agreement is limited to the fees paid or payable in the 12 months before the claim.",
  },
  "fl.liab.uncapped": {
    heading: "LIABILITY",
    text: "The Contractor is liable for all losses of any kind arising from the services, with no cap. The Client's total liability to the Contractor is limited to the fees paid in the previous month.",
    risk: r("liability", "high", "with no cap"),
  },
  "fl.indem.broad": {
    heading: "INDEMNITY",
    text: "The Contractor will cover the Client against all claims connected with the services, including claims caused by the Client's own instructions or negligence.",
    risk: r("indemnity", "high", "including claims caused by the Client's own instructions or negligence"),
  },
  "fl.status.genuine": {
    heading: "INDEPENDENT CONTRACTOR",
    text: "The Contractor is an independent contractor. The Contractor decides how, where and when to do the work, and uses its own equipment.",
  },
  "fl.status.fake": {
    heading: "INDEPENDENT CONTRACTOR",
    text: "The Contractor is described as an independent contractor and is responsible for its own taxes and benefits. The Contractor must work the hours set by the Client, attend the Client's office on the days the Client chooses, and use the equipment the Client specifies.",
    risk: r("one_sided_terms", "medium", "must work the hours set by the Client"),
  },
  "fl.law.fair": {
    heading: "GOVERNING LAW",
    text: "This Agreement is governed by the laws of the fictional Republic of Examplia. Disputes will first go to mediation, and each side pays its own costs.",
    facts: ["Examplia"],
  },
  "fl.law.costly": {
    heading: "DISPUTES",
    text: "Any dispute goes to binding arbitration in the Client's home city, and the Contractor pays all of the costs of the arbitration, whoever wins.",
    risk: r("dispute_resolution", "medium", "the Contractor pays all of the costs of the arbitration"),
  },

  // -------------------------------------------------------------------- lease
  "ls.premises": {
    heading: "PREMISES",
    text: "The Landlord lets to the Tenant the apartment at 12 Sample Street, Examplia City, for residential use only.",
    facts: ["12 Sample Street"],
  },
  "ls.rent.fair": {
    heading: "RENT",
    text: "The Tenant will pay rent of USD 1,450 a month, due on the first day of each month. The rent cannot be increased during the first 12 months.",
    facts: ["1,450"],
  },
  "ls.rent.increase": {
    heading: "RENT",
    text: "The Tenant will pay rent of USD 1,450 a month, due on the first day of each month. The Landlord may increase the rent at any time by giving 7 days notice.",
    risk: r("one_sided_terms", "high", "may increase the rent at any time by giving 7 days notice"),
    facts: ["1,450", "7 days"],
  },
  "ls.late.fair": {
    heading: "LATE RENT",
    text: "Rent paid more than 5 days late carries a late fee of USD 40.",
    facts: ["USD 40"],
  },
  "ls.late.harsh": {
    heading: "LATE RENT",
    text: "Rent paid even one day late carries a fee of 15% of the monthly rent plus USD 50 for each further day, and the Landlord may end the tenancy immediately.",
    risk: r("penalty", "high", "fee of 15% of the monthly rent plus USD 50 for each further day"),
    facts: ["15%", "USD 50"],
  },
  "ls.deposit.fair": {
    heading: "DEPOSIT",
    text: "The Tenant pays a deposit of USD 1,450. The Landlord will return it within 30 days of the end of the tenancy, less any proven damage beyond normal wear.",
    facts: ["1,450", "30 days"],
  },
  "ls.deposit.nonrefund": {
    heading: "DEPOSIT",
    text: "The Tenant pays a deposit of USD 1,450. USD 600 of the deposit is a non-refundable cleaning charge. The Landlord decides in its sole judgment what damage is deducted from the rest.",
    risk: r("payment_terms", "medium", "non-refundable cleaning charge"),
    facts: ["1,450", "600"],
  },
  "ls.term.fixed": {
    heading: "TERM",
    text: "The tenancy lasts 12 months from 1 July 2026. After that it continues month to month unless either side gives 60 days notice.",
    facts: ["1 July 2026", "60 days"],
  },
  "ls.term.autorenew": {
    heading: "TERM",
    text: "The tenancy lasts 12 months from 1 July 2026. It renews automatically for a further 12 months unless the Tenant gives written notice at least 120 days before the end of the term.",
    risk: r("auto_renewal", "medium", "renews automatically for a further 12 months"),
    facts: ["1 July 2026", "120 days"],
  },
  "ls.entry.fair": {
    heading: "ACCESS",
    text: "The Landlord may enter the apartment to inspect or repair it after giving at least 24 hours notice, except in an emergency.",
  },
  "ls.entry.anytime": {
    heading: "ACCESS",
    text: "The Landlord may enter the apartment at any time, with or without notice, for any reason.",
    risk: r("one_sided_terms", "high", "at any time, with or without notice, for any reason"),
  },
  "ls.repairs.fair": {
    heading: "REPAIRS",
    text: "The Landlord is responsible for the structure, the roof, plumbing and heating. The Tenant is responsible for minor upkeep and for damage the Tenant causes.",
  },
  "ls.repairs.tenant": {
    heading: "REPAIRS",
    text: "The Tenant is responsible for all repairs to the apartment and the building, including the structure, roof, plumbing and heating, whatever the cause.",
    risk: r("liability", "high", "responsible for all repairs to the apartment and the building"),
  },
  "ls.early.fair": {
    heading: "ENDING EARLY",
    text: "The Tenant may end the tenancy early by giving 60 days notice and paying one further month's rent.",
    facts: ["60 days"],
  },
  "ls.early.fee": {
    heading: "ENDING EARLY",
    text: "If the Tenant leaves before the end of the term for any reason, the Tenant must pay an early ending fee equal to 4 months rent.",
    risk: r("penalty", "high", "early ending fee equal to 4 months rent"),
    facts: ["4 months"],
  },
  "ls.law": {
    heading: "GOVERNING LAW",
    text: "This lease is governed by the laws of the fictional Republic of Examplia.",
    facts: ["Examplia"],
  },
  "ls.arb": {
    heading: "DISPUTES",
    text: "Any dispute must go to binding arbitration chosen by the Landlord, and the Tenant gives up the right to bring a claim in court or as part of a group.",
    risk: r("dispute_resolution", "medium", "gives up the right to bring a claim in court"),
  },

  // ------------------------------------------------------------------ licence
  "li.grant": {
    heading: "GRANT",
    text: "The Licensor grants the Licensee a non-exclusive, non-transferable right to use the Software for its own internal business, for up to 25 users.",
    facts: ["25 users"],
  },
  "li.fees.fixed": {
    heading: "FEES",
    text: "The Licensee will pay an annual licence fee of USD 9,600, invoiced in advance and payable within 30 days.",
    facts: ["9,600", "30 days"],
  },
  "li.term.fixed": {
    heading: "TERM",
    text: "This licence starts on 1 September 2026 and lasts for 12 months. It renews only if both parties agree in writing.",
    facts: ["1 September 2026"],
  },
  "li.term.autorenew": {
    heading: "TERM",
    text: "This licence starts on 1 September 2026 and lasts for 12 months. It then renews automatically each year, and the Licensor may raise the fee by up to 20% at each renewal. The Licensee must give notice at least 180 days before the end of the term to stop it.",
    risk: r("auto_renewal", "high", "renews automatically each year"),
    facts: ["1 September 2026", "20%", "180 days"],
  },
  "li.support": {
    heading: "SUPPORT",
    text: "The Licensor will provide email support on business days and will fix serious faults within 5 business days.",
    facts: ["5 business days"],
  },
  "li.audit.fair": {
    heading: "AUDIT",
    text: "Once a year, on 14 days notice and during business hours, the Licensor may ask the Licensee to confirm in writing how many users it has.",
  },
  "li.audit.invasive": {
    heading: "AUDIT",
    text: "The Licensor may inspect the Licensee's premises and systems at any time without notice, and the Licensee must pay the whole cost of every inspection.",
    risk: r("one_sided_terms", "high", "at any time without notice"),
  },
  "li.change.unilateral": {
    heading: "CHANGES TO THESE TERMS",
    text: "The Licensor may change any term of this licence, including the fees, at any time by posting the new terms on its website. Continued use means the Licensee accepts them.",
    risk: r("one_sided_terms", "high", "may change any term of this licence, including the fees, at any time"),
  },
  "li.data.fair": {
    heading: "LICENSEE DATA",
    text: "The Licensee owns its data. The Licensor may use it only to provide the Software and must delete it within 30 days of the end of the licence.",
    facts: ["30 days"],
  },
  "li.data.broad": {
    heading: "LICENSEE DATA",
    text: "The Licensor may use the Licensee's data for any purpose, including training its own products and sharing it with partners, and may keep it after the licence ends.",
    risk: r("one_sided_terms", "high", "for any purpose, including training its own products"),
  },
  "li.warranty.asis": {
    heading: "WARRANTY",
    text: "The Software is provided as is, and the Licensor gives no warranty that it will be free of errors.",
    arguable: "provided as is",
  },
  "li.liab.capped": {
    heading: "LIABILITY",
    text: "Each party's total liability is limited to the fees paid in the 12 months before the claim.",
  },
  "li.liab.oneside": {
    heading: "LIABILITY",
    text: "The Licensor's total liability is limited to USD 100. The Licensee is liable for all losses of any kind caused by its use of the Software, with no cap.",
    risk: r("liability", "high", "limited to USD 100"),
  },
  "li.end.fair": {
    heading: "ENDING THE LICENCE",
    text: "Either party may end the licence if the other seriously breaches it and does not fix it within 30 days of notice. If the Licensor ends it without cause, it refunds the unused part of the fee.",
  },
  "li.end.harsh": {
    heading: "ENDING THE LICENCE",
    text: "The Licensor may end the licence immediately and without notice for any reason. No fees are refunded, and the Licensee must stop using the Software at once.",
    risk: r("unilateral_termination", "high", "end the licence immediately and without notice for any reason"),
  },
  "li.feedback": {
    heading: "FEEDBACK",
    text: "If the Licensee suggests improvements, it assigns all rights in them to the Licensor, who may use them without payment or credit.",
    risk: r("ip_assignment", "medium", "assigns all rights in them to the Licensor"),
  },
  "li.law": {
    heading: "GOVERNING LAW",
    text: "This licence is governed by the laws of the fictional Republic of Examplia, and disputes go to its courts.",
    facts: ["Examplia"],
  },
} satisfies Record<string, Entry>;

export type LibraryId = keyof typeof LIBRARY;
