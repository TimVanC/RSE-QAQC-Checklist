'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { generatePayPeriods } from '@/src/server/actions/pay-periods';

export function GeneratePeriods() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [months, setMonths] = useState('12');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await generatePayPeriods({ months: Number(months) });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { added, skipped } = result.data;
      if (added === 0) {
        toast.success('Nothing to add: every period in range is already stored.');
      } else {
        const note = skipped > 0 ? ` ${skipped} already covered.` : '';
        toast.success(`Added ${added} period${added === 1 ? '' : 's'}.${note}`);
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="pp-months">Months ahead</Label>
        <Input
          id="pp-months"
          type="number"
          min={1}
          max={36}
          step={1}
          required
          value={months}
          onChange={(e) => setMonths(e.target.value)}
          className="w-24"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? 'Generating…' : 'Generate periods'}
      </Button>
    </form>
  );
}
