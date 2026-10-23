import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in | RSE QA/QC Checklist' };

const NOTICES: Record<string, string> = {
  reset: 'Your password was updated. Sign in with the new one.',
  'signed-out': 'You have been signed out.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const key = typeof params.notice === 'string' ? params.notice : null;
  return (
    <main className="flex flex-1 items-center justify-center p-4 sm:p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>RSE QA/QC Checklist</CardTitle>
          <CardDescription>Sign in with the email and password your admin set up for you.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm notice={key ? (NOTICES[key] ?? null) : null} />
        </CardContent>
      </Card>
    </main>
  );
}
