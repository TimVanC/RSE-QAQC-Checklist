import { ClipboardCheckIcon, ClipboardListIcon, PhoneMissedIcon } from 'lucide-react';
import Link from 'next/link';
import { Fragment } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { LogCallDialog } from '@/components/calls/log-call-dialog';
import { TechContact } from '@/components/app/tech-contact';
import type {
  ChecklistDisplayStatus,
  JobWorkState,
  QueueGroup,
  QueueJob,
} from '@/src/server/queries/queue';
import { CALL_OUTCOME_LABELS } from '@/src/lib/calls';
import { formatApp, type IsoDate } from '@/src/lib/time';
import { cn } from '@/src/lib/utils';

// Time | Customer | Job | Job status | Checklist | action
// Every track has a fixed or fr width so the header row and the job rows line up exactly
// (an `auto` last track would collapse in the header, where it is empty, and shift the labels).
const ROW_GRID =
  'lg:grid-cols-[8.5rem_minmax(0,1.4fr)_minmax(0,1fr)_7rem_minmax(0,12rem)_14rem] lg:items-center lg:gap-x-4';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const WORK_STATUS: Record<JobWorkState, { label: string; className: string }> = {
  scheduled: { label: 'Scheduled', className: 'border-border text-foreground' },
  in_progress: {
    label: 'In progress',
    className: 'border-transparent bg-secondary text-secondary-foreground',
  },
  completed: {
    label: 'Completed',
    className: 'border-transparent bg-secondary text-secondary-foreground',
  },
  canceled: { label: 'Canceled', className: 'border-dashed border-border text-muted-foreground' },
};

const CHECKLIST_STATUS: Record<ChecklistDisplayStatus, { label: string; className: string }> = {
  not_started: { label: 'Not started', className: 'border-border text-foreground' },
  in_progress: {
    label: 'In progress',
    className:
      'border-transparent bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-300',
  },
  submitted: {
    label: 'Submitted',
    className:
      'border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-300',
  },
  not_reached: {
    label: 'Not reached',
    className:
      'border-transparent bg-rose-100 text-rose-900 dark:bg-rose-400/15 dark:text-rose-300',
  },
};

function timeRange(job: QueueJob): string {
  const start = formatApp(job.scheduledStart, 'h:mm a');
  const end = formatApp(job.scheduledEnd, 'h:mm a');
  return end ? `${start} – ${end}` : start;
}

function JobRow({ job, date }: { job: QueueJob; date: IsoDate }) {
  const work = WORK_STATUS[job.workState];
  const checklist = CHECKLIST_STATUS[job.checklistStatus];
  const ChecklistIcon =
    job.checklistStatus === 'submitted'
      ? ClipboardCheckIcon
      : job.checklistStatus === 'not_reached'
        ? PhoneMissedIcon
        : ClipboardListIcon;
  const lastCallTitle = job.lastCall
    ? `Last call: ${CALL_OUTCOME_LABELS[job.lastCall.outcome]} · ${formatApp(job.lastCall.at, 'MMM d, h:mm a')}${job.lastCall.byName ? ` by ${job.lastCall.byName}` : ''}${job.lastCall.note ? ` · ${job.lastCall.note}` : ''}`
    : undefined;
  const meta = [
    job.jobTypeName,
    job.totalAmountCents ? usd.format(job.totalAmountCents / 100) : null,
  ].filter(Boolean);

  return (
    // Below lg each job is a small card: time + job status, customer and address, job number,
    // checklist badges, then a full-width Open button. From lg up it is one row of ROW_GRID.
    <div
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 px-4 py-3 lg:py-2.5',
        ROW_GRID,
      )}
    >
      <div
        className={cn(
          'self-center text-sm font-medium tabular-nums lg:font-normal',
          job.workState === 'canceled' && 'text-muted-foreground line-through',
        )}
      >
        {timeRange(job)}
        {job.dayPosition && (
          <Badge
            variant="outline"
            className="ml-2 h-4.5 px-1.5 text-[0.7rem] font-medium text-muted-foreground lg:mt-0.5 lg:ml-0 lg:block lg:w-fit"
            title="Multi-day job: runs on more than one day"
          >
            Day {job.dayPosition.index} of {job.dayPosition.count}
          </Badge>
        )}
      </div>
      <div
        className={cn(
          'col-span-2 min-w-0 lg:col-span-1',
          job.workState === 'canceled' && 'opacity-60',
        )}
      >
        <div className="font-semibold break-words lg:truncate lg:font-medium">
          {job.customerName || 'Unknown customer'}
        </div>
        {job.addressFormatted && (
          <div
            className="text-xs break-words text-muted-foreground lg:truncate"
            title={job.addressFormatted}
          >
            {job.addressFormatted}
          </div>
        )}
      </div>
      <div
        className={cn(
          'col-span-2 min-w-0 lg:col-span-1',
          job.workState === 'canceled' && 'opacity-60',
        )}
      >
        <div className="truncate font-medium tabular-nums">
          {job.invoiceNumber ? `#${job.invoiceNumber}` : 'No job number'}
        </div>
        {(meta.length > 0 || job.tags.length > 0) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {meta.length > 0 && (
              <span className="mr-1 text-xs text-muted-foreground">{meta.join(' · ')}</span>
            )}
            {job.tags.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="h-4.5 px-1.5 text-[0.7rem] text-muted-foreground"
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <div className="col-start-2 row-start-1 self-center justify-self-end lg:col-auto lg:row-auto lg:justify-self-auto">
        <Badge
          variant="outline"
          className={work.className}
          title={`Housecall Pro: ${job.workStatus || 'unknown'}`}
        >
          {work.label}
        </Badge>
      </div>
      <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-1 lg:col-span-1">
        <Badge
          variant="outline"
          className={checklist.className}
          title={lastCallTitle ?? 'Checklist status'}
        >
          <ChecklistIcon data-icon="inline-start" />
          {checklist.label}
        </Badge>
        {job.callAttempts > 0 && (
          <Badge variant="outline" className="text-muted-foreground" title={lastCallTitle}>
            {job.callAttempts} call{job.callAttempts === 1 ? '' : 's'}
          </Badge>
        )}
        {job.failures.length > 0 && (
          <Badge
            variant="destructive"
            className="h-auto min-h-5 max-w-full whitespace-normal"
            title="Failure flags on this checklist (workbook Red)"
          >
            Failed: {job.failures.join(', ')}
          </Badge>
        )}
        {job.callbackCount > 0 && (
          <Badge
            variant="outline"
            className="text-muted-foreground"
            title="Callback checklists for this job"
          >
            {job.callbackCount} callback{job.callbackCount === 1 ? '' : 's'}
          </Badge>
        )}
      </div>
      <div className="col-span-2 flex flex-col gap-1.5 pt-1 sm:flex-row sm:justify-end lg:col-span-1 lg:justify-self-end lg:pt-0">
        {job.checklistStatus !== 'submitted' && job.workState !== 'canceled' && (
          <LogCallDialog
            hcpJobId={job.hcpJobId}
            callDate={date}
            customerName={job.customerName || 'this job'}
            trigger={
              <Button variant="ghost" size="sm" className="h-10 w-full sm:w-auto lg:h-7">
                <PhoneMissedIcon data-icon="inline-start" />
                Not reached
              </Button>
            }
          />
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-10 w-full sm:w-auto lg:h-7"
          nativeButton={false}
          render={<Link href={`/checklists/job/${encodeURIComponent(job.hcpJobId)}`} />}
        >
          Open checklist
        </Button>
      </div>
    </div>
  );
}

/** One technician (or the Unassigned bucket) with that day's jobs. */
export function TechnicianSection({ group, date }: { group: QueueGroup; date: IsoDate }) {
  const color = group.technician?.colorHex;
  return (
    <Card size="sm" className="gap-0 pb-0">
      <CardHeader className="border-b">
        <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span
            aria-hidden
            className={cn(
              'size-2.5 shrink-0 rounded-full',
              !color && 'border border-dashed border-muted-foreground',
            )}
            style={color ? { backgroundColor: color } : undefined}
          />
          <h2>{group.name}</h2>
          <span className="text-xs font-normal text-muted-foreground">
            {group.jobs.length} job{group.jobs.length === 1 ? '' : 's'} · {group.submittedCount}{' '}
            submitted
            {group.notReachedCount > 0 && ` · ${group.notReachedCount} not reached`}
            {group.canceledCount > 0 && ` · ${group.canceledCount} canceled`}
          </span>
          {group.technician && (
            <TechContact
              name={group.name}
              mobile={group.technician.mobile}
              email={group.technician.email}
              className="basis-full sm:ml-auto sm:basis-auto"
            />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <div
          className={cn(
            'hidden px-4 pt-2 pb-1 text-xs font-medium text-muted-foreground lg:grid',
            ROW_GRID,
          )}
          aria-hidden
        >
          <span>Time</span>
          <span>Customer</span>
          <span>Job</span>
          <span>Job status</span>
          <span>Checklist</span>
          <span className="sr-only">Action</span>
        </div>
        {group.jobs.map((job, i) => (
          <Fragment key={job.hcpJobId}>
            {i > 0 && <Separator />}
            <JobRow job={job} date={date} />
          </Fragment>
        ))}
      </CardContent>
    </Card>
  );
}
