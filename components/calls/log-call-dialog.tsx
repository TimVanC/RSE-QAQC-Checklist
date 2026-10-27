'use client';

import { PhoneMissedIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition, type ReactElement } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CALL_OUTCOME_LABELS, CALL_OUTCOMES, type CallOutcome } from '@/src/lib/calls';
import { cn } from '@/src/lib/utils';
import { logCall } from '@/src/server/actions/calls';

export interface LogCallDialogProps {
  hcpJobId: string;
  /** Queue date the attempt belongs to. */
  callDate: string;
  customerName: string;
  defaultOutcome?: CallOutcome;
  /** The button that opens the dialog. */
  trigger?: ReactElement;
  onLogged?: () => void;
}

/**
 * Logs one call attempt for a job. From the queue it opens on "No answer" (the one-tap
 * "Not reached" case); from the checklist it opens on "Reached" for the nightly check-in note.
 */
export function LogCallDialog({
  hcpJobId,
  callDate,
  customerName,
  defaultOutcome = 'no_answer',
  trigger,
  onLogged,
}: LogCallDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<CallOutcome>(defaultOutcome);
  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();
  const noteId = useId();

  function reset() {
    setOutcome(defaultOutcome);
    setNote('');
  }

  function save() {
    startTransition(async () => {
      const result = await logCall({ hcpJobId, callDate, outcome, note });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        outcome === 'reached'
          ? `Logged: reached ${customerName}'s technician.`
          : `Logged: ${CALL_OUTCOME_LABELS[outcome].toLowerCase()} for ${customerName}.`,
      );
      setOpen(false);
      reset();
      onLogged?.();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger
        render={
          trigger ?? (
            <Button variant="outline" size="sm" className="h-10 w-full sm:w-auto lg:h-7">
              <PhoneMissedIcon data-icon="inline-start" />
              Not reached
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Log a call</DialogTitle>
            <DialogDescription>
              {customerName} · {callDate}. Every attempt is kept with the time and your name.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Outcome</Label>
            <div
              className="grid grid-cols-1 gap-2 sm:grid-cols-3"
              role="radiogroup"
              aria-label="Outcome"
            >
              {CALL_OUTCOMES.map((o) => (
                <Button
                  key={o}
                  type="button"
                  role="radio"
                  aria-checked={outcome === o}
                  variant={outcome === o ? 'default' : 'outline'}
                  className={cn('h-10 sm:h-9', outcome === o && 'ring-2 ring-ring/40')}
                  onClick={() => setOutcome(o)}
                  disabled={pending}
                >
                  {CALL_OUTCOME_LABELS[o]}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={noteId}>Note (optional)</Label>
            <Textarea
              id={noteId}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                outcome === 'reached'
                  ? 'What was done today, anything to follow up…'
                  : 'Voicemail left, try again after 8, …'
              }
              maxLength={1000}
              disabled={pending}
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
