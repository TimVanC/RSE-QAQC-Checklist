'use client';

import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Native date input that jumps the queue to the picked New Jersey day. */
export function QueueDatePicker({ date }: { date: string }) {
  const router = useRouter();
  return (
    <Input
      // Remount when the page date changes so the uncontrolled value follows prev/next/today.
      key={date}
      type="date"
      aria-label="Queue date"
      defaultValue={date}
      className="h-10 min-w-0 flex-1 sm:h-8 sm:w-38 sm:flex-none"
      onChange={(e) => {
        const value = e.target.value;
        // Typing a date fires change events with partial values; only navigate on a full date.
        if (ISO_DATE_RE.test(value) && value !== date) router.push(`/queue?date=${value}`);
      }}
    />
  );
}
