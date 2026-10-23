import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ROLE_LABELS } from '@/src/lib/auth/roles';
import { requireUser } from '@/src/lib/auth/session';
import { ChangePasswordForm } from './change-password-form';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your account</h1>
        <p className="text-sm break-words text-muted-foreground">
          {user.name} · {user.email} · <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            At least 8 characters. Your other devices will be signed out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
