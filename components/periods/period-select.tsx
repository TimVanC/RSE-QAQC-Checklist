'use client';

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export interface PeriodOption {
  start_date: string;
  label: string;
}

export interface PeriodSelectProps {
  /** Page path the selector navigates within, e.g. "/tracker". */
  basePath: string;
  /** Other search params to keep when the period changes (e.g. `technician`). */
  query?: Record<string, string>;
  /** Start date of the selected period. */
  value: string;
  /** Start date of the period containing today; labelled "(current)". */
  currentStart: string;
  options: PeriodOption[];
  prev: PeriodOption;
  next: PeriodOption;
}

export function periodHref(
  basePath: string,
  query: Record<string, string> | undefined,
  start: string,
) {
  const params = new URLSearchParams(query);
  params.set('period', start);
  return `${basePath}?${params.toString()}`;
}

/** Pay period picker: stored periods (plus the computed current one) with previous/next links. */
export function PeriodSelect({
  basePath,
  query,
  value,
  currentStart,
  options,
  prev,
  next,
}: PeriodSelectProps) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={`Previous period: ${prev.label}`}
        title={prev.label}
        nativeButton={false}
        render={<Link href={periodHref(basePath, query, prev.start_date)} />}
      >
        <ChevronLeftIcon />
      </Button>
      <select
        aria-label="Pay period"
        value={value}
        onChange={(e) => router.push(periodHref(basePath, query, e.target.value))}
        className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
      >
        {options.map((o) => (
          <option key={o.start_date} value={o.start_date}>
            {o.start_date === currentStart ? `${o.label} (current)` : o.label}
          </option>
        ))}
      </select>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={`Next period: ${next.label}`}
        title={next.label}
        nativeButton={false}
        render={<Link href={periodHref(basePath, query, next.start_date)} />}
      >
        <ChevronRightIcon />
      </Button>
      <Button
        variant={value === currentStart ? 'secondary' : 'outline'}
        size="sm"
        nativeButton={false}
        render={<Link href={periodHref(basePath, query, currentStart)} />}
      >
        Current
      </Button>
    </div>
  );
}
