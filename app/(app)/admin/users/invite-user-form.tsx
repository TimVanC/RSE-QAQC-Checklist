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

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await inviteUser({ email, name, role, sendLink: true });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.data.linkSent ? `Invited ${email} and sent a sign-in link.` : `Invited ${email}. The sign-in link could not be sent; use Resend link.`);
      setEmail('');
      setName('');
      setRole('caller');
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1fr_1fr_160px_auto] sm:items-end">
      <div className="space-y-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@rseenergygroup.com" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="invite-name">Name</Label>
        <Input id="invite-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="invite-role">Role</Label>
        <select
          id="invite-role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="border-input bg-background h-8 w-full rounded-lg border px-2 text-sm"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? 'Inviting…' : 'Invite'}
      </Button>
    </form>
  );
}
