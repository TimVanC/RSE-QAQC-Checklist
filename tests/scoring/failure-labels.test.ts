import { describe, expect, it } from 'vitest';
import { failureLabels } from '@/src/lib/scoring/failure-labels';

describe('failureLabels', () => {
  it('names the set flags in workbook order and nothing else', () => {
    expect(failureLabels({ failOpsCheck: 1, failQaqc: 0, failToolControl: 1, failCallback: 0 })).toEqual([
      'Ops check failed',
      'Tools not gathered',
    ]);
    expect(failureLabels({ failOpsCheck: 0, failQaqc: 0, failToolControl: 0, failCallback: 0 })).toEqual([]);
    expect(failureLabels({ failOpsCheck: 1, failQaqc: 1, failToolControl: 1, failCallback: 1 })).toHaveLength(4);
  });

  it('treats a missing score as clean', () => {
    expect(failureLabels(null)).toEqual([]);
    expect(failureLabels(undefined)).toEqual([]);
  });
});
