export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Shared password policy for admin-set, reset and changed passwords. Returns an error message or null. */
export function validatePassword(password: string): string | null {
  if (typeof password !== 'string') return 'Enter a password.';
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  if (!/\S/.test(password)) return 'Password cannot be blank.';
  return null;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

/** Readable temporary password (no ambiguous characters), e.g. "Kq7m-Xn4p-Rt9w". */
export function generateTemporaryPassword(random: (n: number) => number = defaultRandom): string {
  const groups: string[] = [];
  for (let g = 0; g < 3; g += 1) {
    let s = '';
    for (let i = 0; i < 4; i += 1) s += ALPHABET[random(ALPHABET.length)];
    groups.push(s);
  }
  return groups.join('-');
}

function defaultRandom(n: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % n;
}
