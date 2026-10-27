'use client';

import { CheckIcon, ClipboardPlusIcon, RotateCcwIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition, type ReactElement, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { isOverdue, type ActionStatus } from '@/src/lib/corrective-actions';
import { formatApp, todayAppDate } from '@/src/lib/time';
import { cn } from '@/src/lib/utils';
import {
  createCorrectiveAction,
  reopenCorrectiveAction,
  resolveCorrectiveAction,
} from '@/src/server/actions/corrective-actions';

export interface ActionItemData {
  id: string;
  stepKey: string;
  description: string;
  owner: string;
  dueDate: string | null;
  status: ActionStatus;
  resolutionNote: string | null;
  createdAt: string;
  createdByName: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
}

/** "Add follow-up" dialog for one failed step. */
export function AddActionDialog({
  checklistId,
  stepKey,
  stepTitle,
  trigger,
}: {
  checklistId: string;
  stepKey: string;
  stepTitle: string;
  trigger?: ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [pending, startTransition] = useTransition();
  const id = useId();

  function save() {
    startTransition(async () => {
      const result = await createCorrectiveAction({
        checklistId,
        stepKey,
        description,
        owner,
        dueDate,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Follow-up added.');
      setOpen(false);
      setDescription('');
      setOwner('');
      setDueDate('');
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button variant="outline" size="sm" className="h-9 sm:h-7">
              <ClipboardPlusIcon data-icon="inline-start" />
              Add follow-up
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
            <DialogTitle>Add a follow-up</DialogTitle>
            <DialogDescription>{stepTitle}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-desc`}>What needs to happen</Label>
            <Textarea
              id={`${id}-desc`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              maxLength={1000}
              disabled={pending}
              placeholder="Return to collect the signed permit copy…"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-owner`}>Responsible</Label>
              <Input
                id={`${id}-owner`}
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                maxLength={120}
                disabled={pending}
                placeholder="Technician name or Office"
                className="h-10 sm:h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-due`}>Due date</Label>
              <Input
                id={`${id}-due`}
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={pending}
                className="h-10 sm:h-8"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending || !description.trim()}>
              {pending ? 'Saving…' : 'Add follow-up'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResolveDialog({ action }: { action: ActionItemData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();
  const id = useId();

  function save() {
    startTransition(async () => {
      const result = await resolveCorrectiveAction({ id: action.id, note });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Follow-up resolved.');
      setOpen(false);
      setNote('');
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="h-9 sm:h-7">
            <CheckIcon data-icon="inline-start" />
            Resolve
          </Button>
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
            <DialogTitle>Resolve follow-up</DialogTitle>
            <DialogDescription>{action.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-note`}>How it was resolved (optional)</Label>
            <Textarea
              id={`${id}-note`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              disabled={pending}
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Mark resolved'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReopenButton({ action }: { action: ActionItemData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-9 sm:h-7"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await reopenCorrectiveAction(action.id);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success('Follow-up reopened.');
          router.refresh();
        })
      }
    >
      <RotateCcwIcon data-icon="inline-start" />
      Reopen
    </Button>
  );
}

export function ActionStatusBadge({ action }: { action: ActionItemData }) {
  const overdue = isOverdue(action, todayAppDate());
  return (
    <Badge
      variant="outline"
      className={cn(
        action.status === 'resolved'
          ? 'border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-300'
          : overdue
            ? 'border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20'
            : 'border-transparent bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-300',
      )}
    >
      {action.status === 'resolved' ? 'Resolved' : overdue ? 'Overdue' : 'Open'}
    </Badge>
  );
}

/** One follow-up with its details and, for managers, Resolve / Reopen. */
export function ActionItem({
  action,
  canResolve,
  lead,
}: {
  action: ActionItemData;
  canResolve: boolean;
  /** Extra content shown first (job and step context on the tracker). */
  lead?: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1.5 py-2 text-sm">
      <div className="min-w-0 flex-1 space-y-0.5">
        {lead}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <ActionStatusBadge action={action} />
          <span className="break-words">{action.description}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {action.owner && <span>{action.owner} · </span>}
          {action.dueDate ? `Due ${action.dueDate} · ` : ''}
          Added {formatApp(action.createdAt, 'MMM d')} by {action.createdByName ?? 'unknown'}
          {action.status === 'resolved' && action.resolvedAt && (
            <>
              {' '}
              · Resolved {formatApp(action.resolvedAt, 'MMM d')} by{' '}
              {action.resolvedByName ?? 'unknown'}
              {action.resolutionNote && `: ${action.resolutionNote}`}
            </>
          )}
        </div>
      </div>
      {canResolve && (
        <div className="shrink-0">
          {action.status === 'open' ? (
            <ResolveDialog action={action} />
          ) : (
            <ReopenButton action={action} />
          )}
        </div>
      )}
    </li>
  );
}

/** The follow-ups under one checklist step, with the Add button when the step is failed. */
export function StepActions({
  checklistId,
  stepKey,
  stepTitle,
  actions,
  failed,
  canResolve,
}: {
  checklistId: string;
  stepKey: string;
  stepTitle: string;
  actions: ActionItemData[];
  failed: boolean;
  canResolve: boolean;
}) {
  if (!failed && actions.length === 0) return null;
  return (
    <div className="space-y-1 rounded-md border border-dashed border-border/80 px-2 py-1.5">
      {actions.length > 0 && (
        <ul className="divide-y">
          {actions.map((a) => (
            <ActionItem key={a.id} action={a} canResolve={canResolve} />
          ))}
        </ul>
      )}
      {failed && (
        <AddActionDialog checklistId={checklistId} stepKey={stepKey} stepTitle={stepTitle} />
      )}
    </div>
  );
}
