import Link from 'next/link';
import { PeriodSelect } from '@/components/periods/period-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requirePageRole } from '@/src/lib/auth/session';
import { formatApp } from '@/src/lib/time';
import { cn } from '@/src/lib/utils';
import { getPeriodNavigation } from '@/src/server/queries/pay-periods';
import {
  getTracker,
  type TrackerCounts,
  type TrackerGroup,
  type TrackerJob,
  type TrackerStatus,
} from '@/src/server/queries/tracker';
import { TechnicianFilter } from './technician-filter';

export const dynamic = 'force-dynamic';

const STATUS: Record<TrackerStatus, { label: string; className: string }> = {
  submitted: {
    label: 'Submitted',
    className:
      'border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-300',
  },
  in_progress: {
    label: 'In progress',
    className:
      'border-transparent bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-300',
  },
  not_reached: {
    label: 'Not reached',
    className:
      'border-transparent bg-rose-100 text-rose-900 dark:bg-rose-400/15 dark:text-rose-300',
  },
  missing: {
    label: 'Missing',
    className: 'border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20',
  },
};

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function CountBadges({ counts }: { counts: TrackerCounts }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline">{plural(counts.jobs, 'job')}</Badge>
      <Badge variant="outline" className={STATUS.submitted.className}>
        {counts.submitted} submitted
      </Badge>
      <Badge
        variant="outline"
        className={counts.inProgress > 0 ? STATUS.in_progress.className : ''}
      >
        {counts.inProgress} in progress
      </Badge>
      <Badge
        variant="outline"
        className={counts.notReached > 0 ? STATUS.not_reached.className : ''}
      >
        {counts.notReached} not reached
      </Badge>
      <Badge variant={counts.missing > 0 ? 'destructive' : 'outline'}>
        {counts.missing} missing
      </Badge>
    </div>
  );
}

function StatusChip({ job }: { job: TrackerJob }) {
  const style = STATUS[job.status];
  const title =
    job.status === 'missing'
      ? job.checklistId
        ? 'Checklist opened but not started'
        : 'No checklist yet'
      : job.status === 'not_reached' && job.lastCall
        ? `${job.callAttempts} call${job.callAttempts === 1 ? '' : 's'}; last ${formatApp(job.lastCall.at, 'MMM d, h:mm a')}${job.lastCall.note ? ` · ${job.lastCall.note}` : ''}`
        : undefined;
  return (
    <Badge variant="outline" className={style.className} title={title}>
      {style.label}
    </Badge>
  );
}

function OpenButton({ job, className }: { job: TrackerJob; className?: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      nativeButton={false}
      render={<Link href={`/checklists/job/${encodeURIComponent(job.hcpJobId)}`} />}
    >
      Open
    </Button>
  );
}

function ChecklistCell({ job }: { job: TrackerJob }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <StatusChip job={job} />
      {job.failures.length > 0 && (
        <Badge variant="destructive" title="Failure flags on this checklist (workbook Red)">
          Failed: {job.failures.join(', ')}
        </Badge>
      )}
      {job.callbackCount > 0 && (
        <span className="text-xs text-muted-foreground">
          + {plural(job.callbackCount, 'call back')}
        </span>
      )}
    </div>
  );
}

/** Phones: one small card per job instead of a sideways-scrolling table. */
function JobCards({ jobs }: { jobs: TrackerJob[] }) {
  return (
    <ul className="divide-y rounded-lg border md:hidden">
      {jobs.map((job) => (
        <li
          key={job.hcpJobId}
          className={cn('space-y-1.5 px-3 py-3', job.status === 'missing' && 'bg-destructive/5')}
        >
          <div className="text-sm font-medium tabular-nums">
            {formatApp(job.scheduledStart, 'EEE MMM d, h:mm a')}
          </div>
          <div className="min-w-0">
            <div className="font-semibold break-words">
              {job.customerName || '—'}
              {job.invoiceNumber && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  #{job.invoiceNumber}
                </span>
              )}
            </div>
            {job.jobTypeName && (
              <div className="text-xs break-words text-muted-foreground">{job.jobTypeName}</div>
            )}
          </div>
          <ChecklistCell job={job} />
          <OpenButton job={job} className="mt-1 h-10 w-full" />
        </li>
      ))}
    </ul>
  );
}

/** Sticky first column so the date stays visible while the table scrolls sideways. */
const STICKY_CELL = 'sticky left-0 z-10 bg-card shadow-[inset_-1px_0_0_var(--border)]';

function TechnicianCard({ group }: { group: TrackerGroup }) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          {group.technician.colorHex && (
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ backgroundColor: group.technician.colorHex }}
            />
          )}
          {group.technician.name}
        </CardTitle>
        <CountBadges counts={group.counts} />
      </CardHeader>
      <CardContent>
        <JobCards jobs={group.jobs} />
        <Table className="hidden md:table">
          <TableHeader>
            <TableRow>
              <TableHead className={cn('w-44', STICKY_CELL)}>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Job type</TableHead>
              <TableHead className="w-48">Checklist</TableHead>
              <TableHead className="w-20 text-right">
                <span className="sr-only">Open</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.jobs.map((job) => (
              <TableRow
                key={job.hcpJobId}
                className={cn(job.status === 'missing' && 'bg-destructive/5')}
              >
                <TableCell
                  className={cn(
                    'tabular-nums',
                    STICKY_CELL,
                    job.status === 'missing' &&
                      'bg-[color-mix(in_oklch,var(--destructive)_5%,var(--card))]',
                  )}
                >
                  {formatApp(job.scheduledStart, 'EEE MMM d, h:mm a')}
                </TableCell>
                <TableCell className="font-medium">
                  {job.customerName || '—'}
                  {job.invoiceNumber && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      #{job.invoiceNumber}
                    </span>
                  )}
                </TableCell>
                <TableCell>{job.jobTypeName ?? '—'}</TableCell>
                <TableCell>
                  <ChecklistCell job={job} />
                </TableCell>
                <TableCell className="text-right">
                  <OpenButton job={job} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default async function TrackerPage(props: PageProps<'/tracker'>) {
  await requirePageRole('manager');
  const { period: rawPeriod, technician: rawTechnician } = await props.searchParams;
  const nav = await getPeriodNavigation(typeof rawPeriod === 'string' ? rawPeriod : undefined);
  const { period } = nav;
  const tracker = await getTracker(
    period,
    typeof rawTechnician === 'string' ? rawTechnician : null,
  );
  const technicianId = tracker.technicianId ?? '';

  const withJobs = tracker.groups.filter((g) => g.jobs.length > 0);
  const withoutJobs = tracker.groups.filter((g) => g.jobs.length === 0);
  const { totals } = tracker;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Completion tracker</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{period.label}</span> · jobs scheduled in
            the pay period
            {!period.id && ' · computed from the pay period rule'}
          </p>
          {tracker.trackingStartApplied && tracker.trackingStartDate && (
            <p className="text-sm text-muted-foreground">
              Counting from{' '}
              <span className="font-medium text-foreground">{tracker.trackingStartDate}</span>, when
              checklist tracking started in this app. Earlier jobs in this period are not shown as
              missing.
            </p>
          )}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <PeriodSelect
            basePath="/tracker"
            query={technicianId ? { technician: technicianId } : undefined}
            value={period.start_date}
            currentStart={nav.currentStart}
            options={nav.options}
            prev={nav.prev}
            next={nav.next}
          />
          <TechnicianFilter
            technicians={tracker.technicians.map((t) => ({ id: t.id, name: t.name }))}
            value={technicianId}
            period={period.start_date}
          />
        </div>
      </div>

      {totals.jobs === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="font-medium">No jobs scheduled in {period.label}.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {technicianId
                ? 'This technician has no jobs in this period. Pick another technician or period.'
                : 'Jobs appear here after the Housecall Pro sync. Pick another period to see earlier work.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-muted/40 px-4 py-2.5 text-sm">
            <span className="font-medium">{technicianId ? 'Totals' : 'All technicians'}</span>
            <CountBadges counts={totals} />
            {!technicianId && (
              <span className="text-xs text-muted-foreground">
                A job shared by two technicians counts once.
              </span>
            )}
          </div>
          <div className="space-y-4">
            {withJobs.map((group) => (
              <TechnicianCard key={group.technician.id} group={group} />
            ))}
          </div>
          {withoutJobs.length > 0 && (
            <p className="text-sm text-muted-foreground">
              No jobs this period: {withoutJobs.map((g) => g.technician.name).join(', ')}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
