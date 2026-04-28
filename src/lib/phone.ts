/**
 * Format a phone number as ###-###-####.
 * Strips non-digits, drops a leading "1" country code, and falls back to the
 * original string if it doesn't look like a US number.
 */
export function formatPhone(input?: string | null): string {
  if (!input) return "";
  const digits = input.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return input;
  return `${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/** Returns just digits suitable for a tel: href. */
export function phoneHref(input?: string | null): string {
  if (!input) return "";
  const digits = input.replace(/\D/g, "");
  return digits ? `tel:${digits}` : "";
}
