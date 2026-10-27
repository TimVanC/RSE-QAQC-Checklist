import { describe, expect, it } from 'vitest';
import { formatPhone, phoneDigits, telHref, whatsappHref } from '@/src/lib/contact';

describe('contact helpers', () => {
  it('normalises the formats Housecall Pro sends', () => {
    expect(phoneDigits('2015550101')).toBe('12015550101');
    expect(phoneDigits('+1 (201) 555-0101')).toBe('12015550101');
    expect(phoneDigits('12015550101')).toBe('12015550101');
    expect(phoneDigits('+63 917 123 4567')).toBe('639171234567');
  });

  it('rejects empty or too-short values', () => {
    expect(phoneDigits(null)).toBeNull();
    expect(phoneDigits('')).toBeNull();
    expect(phoneDigits('555-0101')).toBeNull();
    expect(formatPhone('n/a')).toBeNull();
    expect(telHref(undefined)).toBeNull();
  });

  it('formats US numbers and links to tel: and WhatsApp', () => {
    expect(formatPhone('2015550101')).toBe('(201) 555-0101');
    expect(formatPhone('639171234567')).toBe('+639171234567');
    expect(telHref('2015550101')).toBe('tel:+12015550101');
    expect(whatsappHref('(201) 555-0101')).toBe('https://wa.me/12015550101');
  });
});
