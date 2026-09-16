/**
 * Phone-only authentication.
 * The user only ever types a phone number + password.
 * Internally the phone is mapped to a stable technical identifier so no
 * email address is ever requested, shown or verified.
 */

const DOMAIN = "sawtak.app";
const STORAGE_KEY = "sawtak.last.phone";

export function normalizePhone(input: string): string {
  const digits = input.replace(/\D+/g, "");
  return digits.replace(/^00/, "");
}

export function isValidPhone(input: string): boolean {
  const digits = normalizePhone(input);
  return digits.length >= 9 && digits.length <= 15;
}

export function phoneToIdentifier(input: string): string {
  return `${normalizePhone(input)}@${DOMAIN}`;
}

export function rememberPhone(phone: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, normalizePhone(phone));
  } catch {
    /* ignore */
  }
}

export function readRememberedPhone(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * Builds the technical identifier from a dial code + local number.
 * The leading zero of the local number is dropped (international format).
 */
export function internationalIdentifier(dial: string, local: string): string {
  const d = dial.replace(/\D+/g, "");
  const n = normalizePhone(local).replace(/^0+/, "");
  return `${d}${n}@${DOMAIN}`;
}

/** Candidate identifiers to try at sign-in (international first, legacy local second). */
export function identifierCandidates(dial: string, local: string): string[] {
  const intl = internationalIdentifier(dial, local);
  const legacy = phoneToIdentifier(local);
  return intl === legacy ? [intl] : [intl, legacy];
}
