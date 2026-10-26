import { format, parseISO } from 'date-fns';
import { ChevronLeftIcon, ChevronRightIcon, InfoIcon } from 'lucide-react';
import Link from 'next/link';
import { QueueDatePicker } from '@/components/queue/date-picker';
import { RefreshButton } from '@/components/queue/refresh-button';
import { SyncFreshness } from '@/components/queue/sync-freshness';
import { TechnicianSection } from '@/components/queue/technician-section';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { requireUser } from '@/src/lib/auth/session';
import { hcpConfigured } from '@/src/lib/hcp/deps';
import { addDays, formatApp, isIsoDate, todayAppDate } from '@/src/lib/time';
import { getQueueForDate } from '@/src/server/queries/queue';

export const dynamic = 'force-dynamic';

const SYNC_KIND_LABELS: Record<string, string> = {
  reconcile: 'scheduled sync',
  backfill: 'nightly backfill',
  webhook: 'Housecall Pro webhook',
  manual: 'manual refresh',
  employees: 'employee sync',
};

export default async function QueuePage(props: PageProps<'/queue'>) {
  await requireUser();
  const { date: rawDate, error: rawError } = await props.searchParams;
  const today = todayAppDate();
  const date = typeof rawDate === 'string' && isIsoDate(rawDate) ? rawDate : today;
  const openError = typeof rawError === 'string' ? rawError.slice(0, 200) : null;

  const { groups, lastSync, asOf } = await getQueueForDate(date);

  const longDate = format(parseISO(date), 'EEEE, MMMM d, yyyy');
  const jobs = new Map(groups.flatMap((g) => g.jobs.map((j) => [j.hcpJobId, j] as const)));
  const submitted = [...jobs.values()].filter((j) => j.checklistStatus === 'submitted').length;
  const syncTitle = lastSync
    ? `Last successful sync: ${formatApp(lastSync.finishedAt)} (${SYNC_KIND_LABELS[lastSync.kind] ?? lastSync.kind})`
    : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Call queue</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{longDate}</span>
            {jobs.size > 0 && (
              <>
                {' '}
                · {jobs.size} job{jobs.size === 1 ? '' : 's'}, {submitted} submitted
              </>
            )}
          </p>
        </div>
        {/* Phones: date controls on one line, freshness + Refresh on the next. */}
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous day"
              className="size-10 sm:size-7"
              nativeButton={false}
              render={<Link href={`/queue?date=${addDays(date, -1)}`} />}
            >
              <ChevronLeftIcon />
            </Button>
            <QueueDatePicker date={date} />
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next day"
              className="size-10 sm:size-7"
              nativeButton={false}
              render={<Link href={`/queue?date=${addDays(date, 1)}`} />}
            >
              <ChevronRightIcon />
            </Button>
            <Button
              variant={date === today ? 'secondary' : 'outline'}
              size="sm"
              className="h-10 sm:h-7"
              nativeButton={false}
              render={<Link href="/queue" />}
            >
              Today
            </Button>
          </div>
          <Separator
            orientation="vertical"
            className="mx-1 hidden h-6 sm:block data-vertical:self-center"
          />
          <div className="flex items-center justify-between gap-2 sm:justify-start">
            <SyncFreshness
              finishedAt={lastSync?.finishedAt.toISOString() ?? null}
              serverNow={asOf.getTime()}
              title={syncTitle}
            />
            <RefreshButton date={date} />
          </div>
        </div>
      </div>

      {openError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <InfoIcon className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 break-words">Could not open the checklist: {openError}</span>
        </div>
      )}

      {!hcpConfigured() && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <InfoIcon className="size-4 shrink-0" />
          Housecall Pro is not connected yet. Showing sample data.
        </div>
      )}

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="font-medium">No jobs scheduled for {longDate}.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Jobs appear here after the Housecall Pro sync. Try Refresh, or pick another day.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <TechnicianSection key={group.key} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
