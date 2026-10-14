import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePageRole } from '@/src/lib/auth/session';
import { listUsers } from '@/src/server/queries/users';
import { InviteUserForm } from './invite-user-form';
import { UsersTable } from './users-table';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const me = await requirePageRole('admin');
  const users = await listUsers();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-muted-foreground text-sm">
          Access is by invitation only. Callers fill checklists; managers can also reopen submitted checklists and see
          the tracker and production counts; admins manage users, pay periods, sync and export.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Invite a user</CardTitle>
          <CardDescription>Creates the account and emails a sign-in link.</CardDescription>
        </CardHeader>
        <CardContent>
          <InviteUserForm />
        </CardContent>
      </Card>
      <UsersTable
        currentUserId={me.id}
        users={users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          active: u.active,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          createdAt: u.createdAt.toISOString(),
          linked: Boolean(u.authUserId),
        }))}
      />
    </div>
  );
}
