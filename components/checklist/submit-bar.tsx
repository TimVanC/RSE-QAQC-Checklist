'use client';

import { LockIcon, TriangleAlertIcon } from 'lucide-react';
import { useRef, useState, type ReactNode, type Ref } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatApp } from '@/src/lib/time';

export interface BlankStep {
  key: string;
  label: string;
  text: string;
}

export interface SubmitBarProps {
  answeredCount: number;
  total: number;
  saveStatus: ReactNode;
  submitted: boolean;
  canReopen: boolean;
  blankScoringSteps: BlankStep[];
  submittedByName: string | null;
  submittedAt: string | null;
  submitButtonRef: Ref<HTMLButtonElement>;
  onSubmit: () => Promise<boolean>;
  onReopen: () => Promise<boolean>;
}

export function SubmitBar({
  answeredCount,
  total,
  saveStatus,
  submitted,
  canReopen,
  blankScoringSteps,
  submittedByName,
  submittedAt,
  submitButtonRef,
  onSubmit,
  onReopen,
}: SubmitBarProps) {
  const [submitOpen, setSubmitOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const reopenConfirmRef = useRef<HTMLButtonElement>(null);

  async function confirmSubmit() {
    setBusy(true);
    const ok = await onSubmit();
    setBusy(false);
    if (ok) setSubmitOpen(false);
  }

  async function confirmReopen() {
    setBusy(true);
    const ok = await onReopen();
    setBusy(false);
    if (ok) setReopenOpen(false);
  }

  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="text-sm tabular-nums">
          <span className="font-medium">{answeredCount}</span>
          <span className="text-muted-foreground"> of {total} answered</span>
        </div>
        <div className="text-xs">{saveStatus}</div>
        <div className="ml-auto flex items-center gap-2">
          {submitted ? (
            <>
              <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                <LockIcon className="size-3.5" aria-hidden />
                Submitted{submittedByName ? ` by ${submittedByName}` : ''}
                {submittedAt ? ` · ${formatApp(submittedAt)} NJ` : ''}
              </span>
              {canReopen && (
                <Button variant="outline" onClick={() => setReopenOpen(true)}>
                  Reopen
                </Button>
              )}
            </>
          ) : (
            <Button ref={submitButtonRef} onClick={() => setSubmitOpen(true)}>
              Submit checklist
            </Button>
          )}
        </div>
      </div>

      <Dialog open={submitOpen} onOpenChange={(o) => !busy && setSubmitOpen(o)}>
        <DialogContent initialFocus={confirmRef} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Submit checklist?</DialogTitle>
            <DialogDescription>
              Step 33 is set to Y automatically. After submitting, the checklist is locked; a
              manager can reopen it if something needs to change.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            {answeredCount} of {total} steps answered.
          </p>
          {blankScoringSteps.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <TriangleAlertIcon className="size-4" aria-hidden />
                {blankScoringSteps.length === 1
                  ? '1 scoring step is blank'
                  : `${blankScoringSteps.length} scoring steps are blank`}
              </p>
              <p className="mt-1 text-xs">
                Blank counts as neither Y nor N in the score. You can still submit.
              </p>
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
                {blankScoringSteps.map((s) => (
                  <li key={s.key} className="flex gap-2">
                    <span className="w-6 shrink-0 font-semibold tabular-nums">{s.label}</span>
                    <span>{s.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={busy} />}>Cancel</DialogClose>
            <Button ref={confirmRef} onClick={() => void confirmSubmit()} disabled={busy}>
              {busy ? 'Submitting…' : 'Submit checklist'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reopenOpen} onOpenChange={(o) => !busy && setReopenOpen(o)}>
        <DialogContent initialFocus={reopenConfirmRef}>
          <DialogHeader>
            <DialogTitle>Reopen this checklist?</DialogTitle>
            <DialogDescription>
              The checklist goes back to In progress so the call team can edit it. It must be
              submitted again before the end of the pay period.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={busy} />}>Cancel</DialogClose>
            <Button ref={reopenConfirmRef} onClick={() => void confirmReopen()} disabled={busy}>
              {busy ? 'Reopening…' : 'Reopen checklist'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
