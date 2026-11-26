/**
 * Fake personal details for tests. Every value is invented or a published example
 * (documentation IBAN, test card number, reserved 555 and Ofcom drama phone ranges,
 * public landmark postcodes). This is the only file in the repo that holds such data,
 * and the pre-public checklist knows about it.
 */
export const FAKE = {
  email: "jordan.example@example.com",
  email2: "billing+test@example.org",
  phoneIntl: "+44 20 7946 0958",
  phoneUs: "(555) 010-0199",
  phoneUs2: "555-010-0123",
  phoneUk: "020 7946 0958",
  phoneUkMobile: "07700 900123",
  iban: "GB82 WEST 1234 5698 7654 32",
  card: "4111 1111 1111 1111",
  ssn: "123-45-6789",
  nino: "AB 12 34 56 C",
  account: "12345678",
  sortCode: "12-34-56",
  dob: "14 March 1985",
  dobNumeric: "03/14/1985",
  ukPostcode: "SW1A 1AA",
  caPostcode: "K1A 0B1",
  zip: "62704",
  street: "221B Baker Street",
  street2: "12 Sample Street",
  titled: "Mr John Sample",
  titled2: "Dr Ada Example",
  company: "Northwind Digital Ltd",
  company2: "Pemberton Retail LLC",
  person: "Jordan Example",
  url: "https://www.example.com/profile/jordan",
} as const;

/** A short contract-like page packed with the details above. */
export const PII_PAGE = [
  `This agreement is made on 2 April 2026 between ${FAKE.company}, a fictional company (the "Client"), and ${FAKE.person}, a fictional freelance designer (the "Contractor").`,
  `The Contractor lives at ${FAKE.street}, London ${FAKE.ukPostcode}. Contact: ${FAKE.email} or ${FAKE.phoneIntl}.`,
  `Payment goes to IBAN ${FAKE.iban}. Account number: ${FAKE.account}, sort code ${FAKE.sortCode}.`,
  `The Contractor was born on ${FAKE.dob}. Tax details: SSN ${FAKE.ssn}.`,
  `Signed by: ${FAKE.person}   Witness: ${FAKE.titled}`,
].join("\n");

/** Text full of money, dates and numbers that must NOT be flagged. */
export const NUMBERS_PAGE = [
  "The Client will pay a fixed fee of USD 24,000 in twelve instalments of USD 2,000.",
  "Payment is due within 75 days. A late fee of 5% of the monthly fee applies for each week.",
  "The term starts on 1 March 2026 (2026-03-01) and renews for 12 month terms.",
  "See Clause 7, page 2 and Section 3.2 of Schedule A. Version 1.2.3.4567 applies.",
  "A price of 0.000733065 and a total of USD 1,200,000. Reference 123456789012.",
  "The rent is USD 1,450 a month, rising by 7 days notice at most 3 times.",
].join("\n");

/** Look-alikes that must NOT be flagged: they fail a checksum, are money, or are dates. */
export const LOOKALIKE = {
  badIban: "GB82 WEST 1234 5698 7654 33",
  badCard: "4111 1111 1111 1112",
  badSsns: ["000-12-3456", "666-12-3456", "900-12-3456", "123-00-4567", "123-45-0000"],
  moneyThatLooksLikeAPhone: "USD 555 010 0123",
  dollarPhoneLike: "$555-010-0123",
  sixteenDigitReference: "1234567812345678",
  isoDate: "2026-03-01",
  slashDate: "14/03/2026",
} as const;

/** International phone numbers written with brackets, dots and dashes. */
export const PHONE_FORMATS = ["+1 (555) 123-4567", "+44.20.7946.0958", "+49-30-1234567"] as const;
