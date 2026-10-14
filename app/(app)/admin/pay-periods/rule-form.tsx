'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { savePayPeriodRule } from '@/src/server/actions/pay-periods';

const CADENCE_OPTIONS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly (every two weeks)' },
  { value: 'monthly', label: 'Monthly (calendar month)' },
];

export function PayPeriodRuleForm(props: { cadence: string; anchor: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cadence, setCadence] = useState(props.cadence);
  const [anchor, setAnchor] = useState(props.anchor);
  const dirty = cadence !== props.cadence || anchor !== props.anchor;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await savePayPeriodRule({ cadence, anchor });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Pay period rule saved.');
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div className="space-y-1.5">
        <Label htmlFor="pp-cadence">Cadence</Label>
        <select
          id="pp-cadence"
          value={cadence}
          onChange={(e) => setCadence(e.target.value)}
          className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
        >
          {CADENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pp-anchor">Anchor (first day of a period)</Label>
        <Input
          id="pp-anchor"
          type="date"
          required
          value={anchor}
          onChange={(e) => setAnchor(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={pending || !dirty || !anchor}>
        {pending ? 'Saving…' : 'Save rule'}
      </Button>
      {cadence === 'monthly' && (
        <p className="text-xs text-muted-foreground sm:col-span-3">
          Monthly periods always run from the 1st to the last day of the month; the anchor is
          ignored.
        </p>
      )}
    </form>
  );
}
