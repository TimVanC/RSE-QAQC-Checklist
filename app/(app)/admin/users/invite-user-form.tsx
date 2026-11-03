'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Role } from '@/src/db/schema/enums';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES } from '@/src/lib/auth/roles';
import { inviteUser } from '@/src/server/actions/users';
import { SignInDetailsDialog, type SignInDetails } from './sign-in-details-dialog';

export function InviteUserForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('caller');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  // Emailing is the default; the admin opts out to hand over the sign-in details themselves.
  const [skipEmail, setSkipEmail] = useState(false);
  const [details, setDetails] = useState<SignInDetails | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await inviteUser({
        email,
        name,
        role,
        temporaryPassword,
        sendResetEmail: !skipEmail,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.data.temporaryPassword) {
        setDetails({ name, email, password: result.data.temporaryPassword });
        toast.success(`Invited ${email}.`);
      } else if (result.data.resetEmailSent) {
        toast.success(
          temporaryPassword.trim()
            ? `Invited ${email} and emailed their sign-in details.`
            : `Invited ${email} and emailed a set-password link.`,
        );
      } else {
        toast.success(
          `Invited ${email}, but the email could not be sent. Use "Send reset email" or "Set password" to retry.`,
        );
      }
      setEmail('');
      setName('');
      setRole('caller');
      setTemporaryPassword('');
      setSkipEmail(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={onSubmit}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_140px_1fr_auto] lg:items-end"
      >
        <div className="space-y-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@rseenergygroup.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-name">Name</Label>
          <Input
            id="invite-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="h-10 w-full rounded-lg border border-input bg-background px-2 text-base sm:h-8 md:text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-password">Temporary password</Label>
          <Input
            id="invite-password"
            type="text"
            autoComplete="off"
            value={temporaryPassword}
            onChange={(e) => setTemporaryPassword(e.target.value)}
            placeholder={
              skipEmail ? 'Leave blank to generate one' : 'Leave blank to email a set-password link'
            }
          />
        </div>
        <Button type="submit" className="h-10 sm:h-8" disabled={pending}>
          {pending ? 'Inviting…' : 'Invite'}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{ROLE_LABELS[role]}:</span>{' '}
        {ROLE_DESCRIPTIONS[role]}
      </p>
      <p className="text-sm text-muted-foreground">
        They are emailed their sign-in details: with a temporary password above, the password and a
        reminder to change it; with it blank, a link to choose their own.
      </p>
      <label className="flex items-start gap-2 text-sm sm:items-center">
        <input
          type="checkbox"
          id="invite-skip-email"
          className="mt-0.5 size-4 shrink-0 sm:mt-0"
          checked={skipEmail}
          onChange={(e) => setSkipEmail(e.target.checked)}
        />
        Don&apos;t email them. Show me the sign-in details so I can pass them on myself.
      </label>
      <SignInDetailsDialog details={details} onClose={() => setDetails(null)} />
    </div>
  );
}
