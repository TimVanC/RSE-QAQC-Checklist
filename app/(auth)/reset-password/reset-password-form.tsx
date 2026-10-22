'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/src/lib/auth/client';
import { validatePassword } from '@/src/lib/auth/password';

export function ResetPasswordForm({ token, linkError }: { token: string | null; linkError: string | null }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!token || linkError) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-destructive">{linkError ? 'This reset link is invalid or has expired.' : 'This page needs a reset link from your email.'}</p>
        <Button variant="outline" size="sm" render={<Link href="/forgot-password" />} nativeButton={false}>
          Request a new link
        </Button>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const policy = validatePassword(password);
    if (policy) return setError(policy);
    if (password !== confirm) return setError('The passwords do not match.');
    setPending(true);
    setError(null);
    try {
      const { error: err } = await authClient.resetPassword({ newPassword: password, token: token! });
      if (err) {
        setError(err.message || 'Could not reset the password. Request a new link.');
        return;
      }
      // Sign in straight away when we know the email (the reset was requested in this browser);
      // otherwise send them to the sign-in form with a confirmation.
      let email: string | null = null;
      try {
        email = window.sessionStorage.getItem('rse-reset-email');
        window.sessionStorage.removeItem('rse-reset-email');
      } catch {
        email = null;
      }
      if (email) {
        const signedIn = await authClient.signIn.email({ email, password });
        if (!signedIn.error) {
          router.push('/');
          router.refresh();
          return;
        }
      }
      router.push('/login?notice=reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset the password.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input id="password" type="password" autoComplete="new-password" autoFocus required value={password} onChange={(e) => setPassword(e.target.value)} disabled={pending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={pending} />
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Saving…' : 'Set password'}
      </Button>
    </form>
  );
}
