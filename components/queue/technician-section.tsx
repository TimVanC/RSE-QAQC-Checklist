import { ClipboardCheckIcon, ClipboardListIcon } from 'lucide-react';
import Link from 'next/link';
import { Fragment } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type {
  ChecklistDisplayStatus,
  JobWorkState,
  QueueGroup,
  QueueJob,
} from '@/src/server/queries/queue';
import { formatApp } from '@/src/lib/time';
import { cn } from '@/src/lib/utils';

// Time | Customer | Job | Job status | Checklist | action
// Every track has a fixed or fr width so the header row and the job rows line up exactly
// (an `auto` last track would collapse in the header, where it is empty, and shift the labels).
const ROW_GRID =
  'lg:grid-cols-[8.5rem_minmax(0,1.4fr)_minmax(0,1fr)_7rem_minmax(0,12rem)_8.5rem] lg:items-center lg:gap-x-4';

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
};

function timeRange(job: QueueJob): string {
  const start = formatApp(job.scheduledStart, 'h:mm a');
  const end = formatApp(job.scheduledEnd, 'h:mm a');
  return end ? `${start} – ${end}` : start;
}

function JobRow({ job }: { job: QueueJob }) {
  const work = WORK_STATUS[job.workState];
  const checklist = CHECKLIST_STATUS[job.checklistStatus];
  const ChecklistIcon =
    job.checklistStatus === 'submitted' ? ClipboardCheckIcon : ClipboardListIcon;
  const meta = [
    job.jobTypeName,
    job.totalAmountCents ? usd.format(job.totalAmountCents / 100) : null,
  ].filter(Boolean);

  return (
    <div className={cn('grid gap-x-4 gap-y-1.5 px-4 py-2.5', ROW_GRID)}>
      <div
        className={cn(
          'text-sm tabular-nums',
          job.workState === 'canceled' && 'text-muted-foreground line-through',
        )}
      >
        {timeRange(job)}
      </div>
      <div className={cn('min-w-0', job.workState === 'canceled' && 'opacity-60')}>
        <div className="truncate font-medium">{job.customerName || 'Unknown customer'}</div>
        {job.addressFormatted && (
          <div className="truncate text-xs text-muted-foreground" title={job.addressFormatted}>
            {job.addressFormatted}
          </div>
        )}
      </div>
      <div className={cn('min-w-0', job.workState === 'canceled' && 'opacity-60')}>
        <div className="truncate font-medium tabular-nums">{job.invoiceNumber ? `#${job.invoiceNumber}` : 'No job number'}</div>
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
      <div>
        <Badge
          variant="outline"
          className={work.className}
          title={`Housecall Pro: ${job.workStatus || 'unknown'}`}
        >
          {work.label}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Badge variant="outline" className={checklist.className} title="Checklist status">
          <ChecklistIcon data-icon="inline-start" />
          {checklist.label}
        </Badge>
        {job.failures.length > 0 && (
          <Badge variant="destructive" title="Failure flags on this checklist (workbook Red)">
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
      <div className="lg:justify-self-end">
        <Button
          variant="outline"
          size="sm"
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
export function TechnicianSection({ group }: { group: QueueGroup }) {
  const color = group.technician?.colorHex;
  return (
    <Card size="sm" className="gap-0 pb-0">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
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
            {group.canceledCount > 0 && ` · ${group.canceledCount} canceled`}
          </span>
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
          <span>Time (NJ)</span>
          <span>Customer</span>
          <span>Job</span>
          <span>Job status</span>
          <span>Checklist</span>
          <span className="sr-only">Action</span>
        </div>
        {group.jobs.map((job, i) => (
          <Fragment key={job.hcpJobId}>
            {i > 0 && <Separator />}
            <JobRow job={job} />
          </Fragment>
        ))}
      </CardContent>
    </Card>
  );
}
