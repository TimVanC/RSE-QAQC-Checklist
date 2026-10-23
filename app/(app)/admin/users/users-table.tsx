'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Role } from '@/src/db/schema/enums';
import { ROLE_LABELS, ROLES } from '@/src/lib/auth/roles';
import { formatApp } from '@/src/lib/time';
import {
  sendPasswordResetEmail,
  setTemporaryPassword,
  setUserActive,
  setUserRole,
} from '@/src/server/actions/users';

export interface UserRowData {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  linked: boolean;
}

export function UsersTable({
  users,
  currentUserId,
}: {
  users: UserRowData[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [revealed, setRevealed] = useState<{ email: string; password: string } | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error ?? 'Failed');
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  function resetPassword(u: UserRowData) {
    const typed = window.prompt(
      `Temporary password for ${u.name} (leave blank to generate one):`,
      '',
    );
    if (typed === null) return;
    startTransition(async () => {
      const result = await setTemporaryPassword({ userId: u.id, password: typed });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.data.temporaryPassword)
        setRevealed({ email: u.email, password: result.data.temporaryPassword });
      toast.success(`Password set for ${u.name}.`);
    });
  }

  return (
    <div className="space-y-3">
      {revealed && (
        <div className="rounded-lg border bg-muted/50 px-3 py-2 text-sm break-words">
          Temporary password for <span className="font-medium">{revealed.email}</span>:{' '}
          <code className="rounded bg-background px-1.5 py-0.5 font-mono">{revealed.password}</code>
          . Share it now; it is not shown again.
          <Button variant="ghost" size="xs" className="ml-2" onClick={() => setRevealed(null)}>
            Dismiss
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 z-10 bg-background shadow-[inset_-1px_0_0_var(--border)]">
              Name
            </TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last login (NJ)</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => {
            const isSelf = u.id === currentUserId;
            return (
              <TableRow key={u.id} className={u.active ? '' : 'opacity-60'}>
                <TableCell className="sticky left-0 z-10 bg-background font-medium shadow-[inset_-1px_0_0_var(--border)]">
                  {u.name}
                  {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                </TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <select
                    aria-label={`Role for ${u.name}`}
                    value={u.role}
                    disabled={pending || isSelf}
                    onChange={(e) =>
                      run(
                        () => setUserRole({ userId: u.id, role: e.target.value }),
                        `Role updated for ${u.name}.`,
                      )
                    }
                    className="h-7 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge variant={u.active ? 'secondary' : 'outline'}>
                      {u.active ? 'Active' : 'Deactivated'}
                    </Badge>
                    {!u.linked && (
                      <Badge variant="outline" title="Has not signed in yet">
                        Never signed in
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {u.lastLoginAt ? formatApp(u.lastLoginAt) : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending || !u.active || isSelf}
                      onClick={() => resetPassword(u)}
                    >
                      Set password
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending || !u.active}
                      onClick={() =>
                        run(() => sendPasswordResetEmail(u.id), `Reset email sent to ${u.email}.`)
                      }
                    >
                      Send reset email
                    </Button>
                    <Button
                      size="sm"
                      variant={u.active ? 'destructive' : 'secondary'}
                      disabled={pending || isSelf}
                      onClick={() =>
                        run(
                          () => setUserActive({ userId: u.id, active: !u.active }),
                          u.active ? `${u.name} deactivated.` : `${u.name} reactivated.`,
                        )
                      }
                    >
                      {u.active ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {users.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No users yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
