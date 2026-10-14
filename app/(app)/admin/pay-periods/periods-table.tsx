'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { deletePayPeriod } from '@/src/server/actions/pay-periods';

export interface PeriodRowData {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  current: boolean;
}

export function PeriodsTable({ periods }: { periods: PeriodRowData[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function remove(period: PeriodRowData) {
    startTransition(async () => {
      const result = await deletePayPeriod(period.id);
      setConfirmId(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Deleted ${period.label}.`);
      router.refresh();
    });
  }

  if (periods.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        No pay periods stored yet. Use Generate periods above. Until then the tracker and production
        pages compute periods from the rule.
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Period</TableHead>
            <TableHead>Start</TableHead>
            <TableHead>End</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {periods.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">
                {p.label}
                {p.current && (
                  <Badge variant="secondary" className="ml-2">
                    Current
                  </Badge>
                )}
              </TableCell>
              <TableCell className="tabular-nums">{p.startDate}</TableCell>
              <TableCell className="tabular-nums">{p.endDate}</TableCell>
              <TableCell className="text-right">
                {confirmId === p.id ? (
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-xs text-muted-foreground">Delete this period?</span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => setConfirmId(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={pending}
                      onClick={() => remove(p)}
                    >
                      {pending ? 'Deleting…' : 'Delete'}
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    aria-label={`Delete ${p.label}`}
                    onClick={() => setConfirmId(p.id)}
                  >
                    Delete
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
