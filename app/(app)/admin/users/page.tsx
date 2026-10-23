import { Fragment } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES } from '@/src/lib/auth/roles';
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
        <p className="text-sm text-muted-foreground">Access is by invitation only.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Roles</CardTitle>
          <CardDescription>Each role includes everything the one above it can do.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-[6rem_1fr]">
            {ROLES.map((r) => (
              <Fragment key={r}>
                <dt className="font-medium">{ROLE_LABELS[r]}</dt>
                <dd className="text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</dd>
              </Fragment>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Invite a user</CardTitle>
          <CardDescription>
            Creates the account with a temporary password you pass on, or emails them a link to
            choose their own.
          </CardDescription>
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
