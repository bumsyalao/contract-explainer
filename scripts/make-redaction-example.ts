/**
 * Builds public/samples/redaction-example.pdf: a made-up contract packed with made-up personal
 * details (from the test fixtures), so the redaction tool can be tried without a real document.
 *   npx tsx scripts/make-redaction-example.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { FAKE } from "../src/lib/redact/fixtures";
import { buildPdf } from "./make-sample-pdf";

export const EXAMPLE_PAGES: string[][] = [
  [
    "FREELANCE SERVICES AGREEMENT (REDACTION EXAMPLE)",
    "SYNTHETIC EXAMPLE DOCUMENT. All names and details are invented. Not a real contract.",
    `This agreement is made on 2 April 2026 between ${FAKE.company}, a fictional company (the "Client"), and ${FAKE.person}, a fictional freelance designer (the "Contractor").`,
    `1. PARTIES AND CONTACT. The Client's office is at ${FAKE.street}, London ${FAKE.ukPostcode}. The Contractor lives at ${FAKE.street2}, Springfield, IL ${FAKE.zip}. Notices go to ${FAKE.email} or by phone to ${FAKE.phoneIntl}.`,
    "2. FEES. The Client will pay a fixed fee of USD 18,000 in six monthly instalments of USD 3,000. Each invoice is payable within 75 days of receipt.",
    `3. BANK DETAILS. Payment goes to IBAN ${FAKE.iban}. Account number: ${FAKE.account}, sort code ${FAKE.sortCode}.`,
  ],
  [
    "4. TERM. This Agreement starts on 4 May 2026 for an initial term of 12 months and then renews automatically for further 12 month terms unless either party gives written notice at least 90 days before the end of the current term.",
    "5. ENDING THE AGREEMENT. The Client may end this Agreement at any time, for any reason, by giving 24 hours notice. The Contractor may end it only if the Client commits an uncured serious breach, by giving 60 days notice.",
    `6. IDENTIFICATION. The Contractor was born on ${FAKE.dob} and holds tax number SSN ${FAKE.ssn}.`,
    `SIGNED: Signed by: ${FAKE.person}   Witness: ${FAKE.titled}`,
  ],
];

async function main() {
  const out = path.join(process.cwd(), "public/samples/redaction-example.pdf");
  await mkdir(path.dirname(out), { recursive: true });
  const bytes = await buildPdf(EXAMPLE_PAGES);
  await writeFile(out, bytes);
  console.log(`wrote ${out} (${bytes.length} bytes)`);
}

if (process.argv[1]?.endsWith("make-redaction-example.ts")) main();
