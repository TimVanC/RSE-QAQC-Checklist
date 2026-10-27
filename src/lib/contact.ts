/**
 * Phone number helpers for the technician contact links (tap-to-call and WhatsApp).
 * Housecall Pro sends mobile numbers as bare digits ("2015550101"); some have a +1 or punctuation.
 * Pure, no imports, unit tested in tests/lib/contact.test.ts.
 */

/** Digits only, with a leading US country code added for 10-digit numbers. Null when unusable. */
export function phoneDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 10) digits = `1${digits}`;
  if (digits.length < 11 || digits.length > 15) return null;
  return digits;
}

/** "(201) 555-0101" for US numbers, otherwise "+<digits>". Null when unusable. */
export function formatPhone(raw: string | null | undefined): string | null {
  const digits = phoneDigits(raw);
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return `+${digits}`;
}

export function telHref(raw: string | null | undefined): string | null {
  const digits = phoneDigits(raw);
  return digits ? `tel:+${digits}` : null;
}

/** WhatsApp "click to chat" link; opens the app on a phone and WhatsApp Web on a laptop. */
export function whatsappHref(raw: string | null | undefined): string | null {
  const digits = phoneDigits(raw);
  return digits ? `https://wa.me/${digits}` : null;
}
