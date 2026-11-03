'use client';

import { CheckIcon, CopyIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
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
} from '@/components/ui/dialog';

export type SignInDetails = { name: string; email: string; password: string };

/**
 * One-time reveal of a new user's sign-in details when the admin chose not to email them.
 * The password is shown once with a copy button; it is not stored anywhere readable.
 */
export function SignInDetailsDialog({
  details,
  onClose,
}: {
  details: SignInDetails | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copyPassword() {
    if (!details) return;
    try {
      await navigator.clipboard.writeText(details.password);
      setCopied(true);
      toast.success('Password copied.');
    } catch {
      toast.error('Could not copy. Select the password and copy it instead.');
    }
  }

  return (
    <Dialog
      open={details !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent data-sign-in-details>
        <DialogHeader>
          <DialogTitle>Sign-in details</DialogTitle>
          <DialogDescription>
            Pass these on to {details?.name ?? 'the new user'}. The password is shown only once;
            they can change it under Account after signing in.
          </DialogDescription>
        </DialogHeader>
        {details && (
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Name</dt>
            <dd className="font-medium break-words">{details.name}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="font-medium break-all">{details.email}</dd>
            <dt className="text-muted-foreground">Password</dt>
            <dd className="flex items-center gap-2">
              <code
                data-sign-in-password
                className="rounded bg-muted px-2 py-1 font-mono text-base break-all select-all"
              >
                {details.password}
              </code>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={copyPassword}
                aria-label={copied ? 'Copied' : 'Copy password'}
                title="Copy password"
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </Button>
            </dd>
          </dl>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Done</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
