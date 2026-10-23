'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ROLE_LABELS, ROLES } from '@/src/lib/auth/roles';
import { inviteUser } from '@/src/server/actions/users';

export function InviteUserForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<string>('caller');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [sendResetEmail, setSendResetEmail] = useState(false);
  const [revealed, setRevealed] = useState<{ email: string; password: string } | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await inviteUser({ email, name, role, temporaryPassword, sendResetEmail });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.data.temporaryPassword) {
        setRevealed({ email, password: result.data.temporaryPassword });
      } else {
        setRevealed(null);
      }
      toast.success(
        result.data.resetEmailSent
          ? `Invited ${email} and emailed a set-password link.`
          : sendResetEmail
            ? `Invited ${email}, but the email could not be sent. Use "Send reset email" to retry.`
            : `Invited ${email}.`,
      );
      setEmail('');
      setName('');
      setRole('caller');
      setTemporaryPassword('');
      setSendResetEmail(false);
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
            onChange={(e) => setRole(e.target.value)}
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
            placeholder={sendResetEmail ? 'Not needed' : 'Leave blank to generate'}
            disabled={sendResetEmail}
          />
        </div>
        <Button type="submit" className="h-10 sm:h-8" disabled={pending}>
          {pending ? 'Inviting…' : 'Invite'}
        </Button>
      </form>
      <label className="flex items-start gap-2 text-sm sm:items-center">
        <input
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 sm:mt-0"
          checked={sendResetEmail}
          onChange={(e) => setSendResetEmail(e.target.checked)}
        />
        Email them a link to choose their own password instead of a temporary one
      </label>
      {revealed && (
        <div className="rounded-lg border bg-muted/50 px-3 py-2 text-sm break-words">
          Temporary password for <span className="font-medium">{revealed.email}</span>:{' '}
          <code className="rounded bg-background px-1.5 py-0.5 font-mono">{revealed.password}</code>
          . Share it with them now; it is not shown again. They can change it under Account.
        </div>
      )}
    </div>
  );
}
