import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { signOutAction } from '@/src/server/actions/auth';

export const dynamic = 'force-dynamic';

export default function NoAccessPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Account not set up</CardTitle>
          <CardDescription>
            You signed in, but this email has not been added to the RSE checklist app yet. Ask an
            admin to invite you, then sign in again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={signOutAction}>
            <Button type="submit" variant="outline" className="w-full">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
