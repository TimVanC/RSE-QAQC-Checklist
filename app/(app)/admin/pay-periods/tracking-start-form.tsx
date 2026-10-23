'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveTrackingStartDate } from '@/src/server/actions/pay-periods';

export function TrackingStartForm({ date }: { date: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(date ?? '');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveTrackingStartDate({ date: value || null });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(value ? `Tracking starts on ${value}.` : 'Tracking start cleared; every job counts.');
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="tracking-start">Tracking starts on (NJ date)</Label>
        <Input id="tracking-start" type="date" value={value} onChange={(e) => setValue(e.target.value)} className="w-44" />
      </div>
      <Button type="submit" disabled={pending || (value || null) === date}>
        {pending ? 'Saving…' : 'Save'}
      </Button>
      {date && (
        <Button type="button" variant="ghost" disabled={pending} onClick={() => setValue('')}>
          Clear
        </Button>
      )}
    </form>
  );
}
