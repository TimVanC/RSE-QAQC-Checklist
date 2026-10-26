'use client';

import { ArrowLeftIcon } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PROJECT_TYPES, type ProjectType } from '@/src/config/checklist-steps';
import { formatApp } from '@/src/lib/time';
import { AutosaveInput } from './autosave-input';
import type { FieldName } from './fields';
import type { WorkspaceChecklist, WorkspaceJob } from './types';

export interface HeaderCardProps {
  checklist: WorkspaceChecklist;
  job: WorkspaceJob | null;
  technicianName: string | null;
  assignedTechnicians: string[];
  status: 'in_progress' | 'submitted' | 'not_started';
  submittedByName: string | null;
  submittedAt: string | null;
  reopenedByName: string | null;
  reopenedAt: string | null;
  readOnly: boolean;
  callDate: string;
  saveStatus: ReactNode;
  onSaveField: (field: FieldName, value: string | null) => Promise<boolean>;
  onCallDateSaved: (value: string) => void;
}

/** Header inputs are 40 px tall on phones (touch), the usual 32 px from sm up. */
const FIELD_CLASS = 'h-10 sm:h-8';

function formatMoney(cents: number | null): string {
  if (cents === null || cents === undefined) return '—';
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function humanize(s: string): string {
  const t = s.replace(/_/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '—';
}

function scheduleText(job: WorkspaceJob): string {
  if (!job.scheduledStart) return 'Not scheduled';
  const start = formatApp(job.scheduledStart, 'EEE MMM d, yyyy h:mm a');
  const sameDay =
    job.scheduledEnd &&
    formatApp(job.scheduledEnd, 'yyyy-MM-dd') === formatApp(job.scheduledStart, 'yyyy-MM-dd');
  const end = job.scheduledEnd
    ? formatApp(job.scheduledEnd, sameDay ? 'h:mm a' : 'EEE MMM d, h:mm a')
    : '';
  return `${start}${end ? ` – ${end}` : ''}`;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className="text-sm break-words sm:truncate"
        title={typeof children === 'string' ? children : undefined}
      >
        {children}
      </dd>
    </div>
  );
}

export function HeaderCard({
  checklist,
  job,
  technicianName,
  assignedTechnicians,
  status,
  submittedByName,
  submittedAt,
  reopenedByName,
  reopenedAt,
  readOnly,
  callDate,
  saveStatus,
  onSaveField,
  onCallDateSaved,
}: HeaderCardProps) {
  const [projectType, setProjectType] = useState<ProjectType | null>(checklist.projectType);
  const isCallback = checklist.type === 'callback';
  const id = (name: string) => `hdr-${name}`;

  async function changeProjectType(next: ProjectType | null) {
    const before = projectType;
    setProjectType(next);
    const ok = await onSaveField('project_type', next);
    if (!ok) setProjectType(before);
  }

  return (
    <section className="rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Button
            render={<Link href={`/queue?date=${encodeURIComponent(callDate)}`} />}
            nativeButton={false}
            variant="ghost"
            size="sm"
            className="-ml-2 h-10 sm:h-7"
          >
            <ArrowLeftIcon />
            Back to call queue
          </Button>
          <h1 className="text-xl font-semibold tracking-tight">
            {isCallback
              ? 'Appointment/Service Call Checklist (CALL BACK)'
              : 'Appointment/Service Call Checklist'}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {status === 'submitted' ? (
              <Badge className="bg-emerald-600 text-white">Submitted</Badge>
            ) : (
              <Badge variant="secondary">In progress</Badge>
            )}
            {status === 'submitted' && submittedAt && (
              <span className="text-muted-foreground">
                by {submittedByName ?? 'unknown'} on {formatApp(submittedAt)}
              </span>
            )}
            {reopenedAt && (
              <span className="text-muted-foreground">
                Reopened by {reopenedByName ?? 'unknown'} on {formatApp(reopenedAt)}
              </span>
            )}
          </div>
        </div>
        <div className="text-xs">{saveStatus}</div>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-2 border-t pt-3 sm:grid-cols-3 lg:grid-cols-4">
        {job ? (
          <>
            <Fact label="Customer">{job.customerName || '—'}</Fact>
            <Fact label="Address">{job.addressFormatted || '—'}</Fact>
            <Fact label="Job / invoice no.">
              {job.invoiceNumber ? `#${job.invoiceNumber}` : job.hcpJobId}
            </Fact>
            <Fact label="Scheduled">{scheduleText(job)}</Fact>
            <Fact label="Work status">{humanize(job.workStatus)}</Fact>
            <Fact label="Assigned">
              {assignedTechnicians.length ? assignedTechnicians.join(', ') : '—'}
            </Fact>
            <Fact label="Checklist technician">{technicianName ?? '—'}</Fact>
            <Fact label="Total amount">{formatMoney(job.totalAmountCents)}</Fact>
          </>
        ) : (
          <p className="col-span-full text-sm text-muted-foreground">
            Housecall Pro job details are not available.
          </p>
        )}
      </dl>

      <div className="mt-4 grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={id('project-type')}>Project Type</Label>
          <Select
            value={projectType}
            onValueChange={(v) => void changeProjectType(v)}
            disabled={readOnly}
          >
            <SelectTrigger id={id('project-type')} className="w-full max-sm:h-10!">
              <SelectValue placeholder="Select project type" />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={id('customer-name')}>Customer Name</Label>
          <AutosaveInput
            className={FIELD_CLASS}
            id={id('customer-name')}
            initialValue={checklist.customerName}
            onSave={(v) => onSaveField('customer_name', v)}
            disabled={readOnly}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={id('project-location')}>Project Location</Label>
          <AutosaveInput
            className={FIELD_CLASS}
            id={id('project-location')}
            initialValue={checklist.projectLocation}
            onSave={(v) => onSaveField('project_location', v)}
            disabled={readOnly}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={id('project-date')}>Project Date</Label>
          <AutosaveInput
            className={FIELD_CLASS}
            id={id('project-date')}
            type="date"
            initialValue={checklist.projectDate ?? ''}
            onSave={(v) => onSaveField('project_date', v || null)}
            debounceMs={400}
            disabled={readOnly}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={id('referral')}>Referral/Project No.</Label>
          <AutosaveInput
            className={FIELD_CLASS}
            id={id('referral')}
            initialValue={checklist.referralProjectNo}
            onSave={(v) => onSaveField('referral_project_no', v)}
            disabled={readOnly}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={id('call-date')}>Call date</Label>
          <AutosaveInput
            className={FIELD_CLASS}
            id={id('call-date')}
            type="date"
            required
            initialValue={checklist.callDate}
            onSave={(v) => onSaveField('call_date', v)}
            onSaved={onCallDateSaved}
            debounceMs={400}
            disabled={readOnly}
          />
        </div>
      </div>
    </section>
  );
}
