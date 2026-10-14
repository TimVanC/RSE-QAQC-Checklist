'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Role } from '@/src/db/schema/enums';
import { ROLE_LABELS, ROLES } from '@/src/lib/auth/roles';
import { formatApp } from '@/src/lib/time';
import { resendMagicLink, setUserActive, setUserRole } from '@/src/server/actions/users';

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

export function UsersTable({ users, currentUserId }: { users: UserRowData[]; currentUserId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

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

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
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
              <TableCell className="font-medium">
                {u.name}
                {isSelf && <span className="text-muted-foreground ml-2 text-xs">(you)</span>}
              </TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell>
                <select
                  aria-label={`Role for ${u.name}`}
                  value={u.role}
                  disabled={pending || isSelf}
                  onChange={(e) => run(() => setUserRole({ userId: u.id, role: e.target.value }), `Role updated for ${u.name}.`)}
                  className="border-input bg-background h-7 rounded-md border px-2 text-sm"
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
                  <Badge variant={u.active ? 'secondary' : 'outline'}>{u.active ? 'Active' : 'Deactivated'}</Badge>
                  {!u.linked && (
                    <Badge variant="outline" title="Has not signed in yet">
                      Never signed in
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{u.lastLoginAt ? formatApp(u.lastLoginAt) : '—'}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending || !u.active}
                    onClick={() => run(() => resendMagicLink(u.id), `Sign-in link sent to ${u.email}.`)}
                  >
                    Resend link
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
            <TableCell colSpan={6} className="text-muted-foreground text-center">
              No users yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
