import type { Metadata } from 'next';
import { BrandLogo } from '@/components/app/brand-logo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = { title: 'Reset password | RSE QA/QC Checklist' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === 'string' ? params.token : null;
  const error = typeof params.error === 'string' ? params.error : null;
  return (
    <main className="flex flex-1 items-center justify-center p-4 sm:p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <BrandLogo className="mb-2 h-10" />
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>
            At least 8 characters. Other devices will be signed out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResetPasswordForm token={token} linkError={error} />
        </CardContent>
      </Card>
    </main>
  );
}
