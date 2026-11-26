/** Checksums and validity rules, so long numbers are only flagged when they really look like what they claim. */

export const digitsOf = (s: string) => s.replace(/\D/g, "");

/** Luhn check, used by payment card numbers. */
export function luhnValid(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  if (/^(\d)\1+$/.test(digits)) return false; // 0000..., 1111...
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** IBAN mod-97 check. Accepts spaces. */
export function ibanValid(raw: string): boolean {
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const v = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of v) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/** US Social Security number shape: area not 000, 666 or 9xx; group not 00; serial not 0000. */
export function ssnValid(raw: string): boolean {
  const m = /^(\d{3})-(\d{2})-(\d{4})$/.exec(raw);
  if (!m) return false;
  const [, area, group, serial] = m;
  if (area === "000" || area === "666" || area[0] === "9") return false;
  return group !== "00" && serial !== "0000";
}

/** A plain calendar-looking number, so it is never taken for a phone number. */
export function looksLikeDate(s: string): boolean {
  return /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(s.trim()) || /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(s.trim());
}
