import { describe, expect, it } from 'vitest';
import { checkCronAuth } from '@/src/lib/cron-auth';

describe('checkCronAuth', () => {
  const secret = 's3cret-value';

  it('accepts the Vercel bearer header', () => {
    expect(checkCronAuth(new Headers({ authorization: `Bearer ${secret}` }), secret)).toBe('ok');
  });

  it('accepts the x-cron-secret header for external pingers', () => {
    expect(checkCronAuth(new Headers({ 'x-cron-secret': secret }), secret)).toBe('ok');
  });

  it('rejects wrong or missing credentials', () => {
    expect(checkCronAuth(new Headers({ authorization: 'Bearer nope' }), secret)).toBe('unauthorized');
    expect(checkCronAuth(new Headers(), secret)).toBe('unauthorized');
    expect(checkCronAuth(new Headers({ authorization: `Bearer ${secret}x` }), secret)).toBe('unauthorized');
  });

  it('reports an unconfigured secret', () => {
    expect(checkCronAuth(new Headers({ authorization: 'Bearer x' }), undefined)).toBe('unconfigured');
  });
});
