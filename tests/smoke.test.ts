import { describe, expect, it } from 'vitest';

import { cn } from '@/src/lib/utils';

describe('smoke', () => {
  it('runs the test suite', () => {
    expect(1 + 1).toBe(2);
  });

  it('resolves the @ alias to the repo root', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
});
