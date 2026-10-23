'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/src/lib/auth/client';

type State = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; message: string };

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value) return;
    setState({ kind: 'sending' });
    try {
      // Lets the reset page sign the person in automatically when the link is opened in this browser.
      try {
        window.sessionStorage.setItem('rse-reset-email', value);
      } catch {
        /* storage unavailable: the reset page falls back to the sign-in form */
      }
      const { error } = await authClient.requestPasswordReset({
        email: value,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        setState({ kind: 'error', message: error.message || 'Could not send the email.' });
        return;
      }
      setState({ kind: 'sent' });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Could not send the email.' });
    }
  }

  if (state.kind === 'sent') {
    return (
      <div className="space-y-3 text-sm">
        <p>If that email has an account, a reset link is on its way. Check spam if it does not arrive within a few minutes.</p>
        <Button variant="outline" size="sm" render={<Link href="/login" />} nativeButton={false}>
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} disabled={state.kind === 'sending'} />
      </div>
      {state.kind === 'error' && (
        <p role="alert" className="text-destructive text-sm">
          {state.message}
        </p>
      )}
      <Button type="submit" className="h-10 w-full sm:h-8" disabled={state.kind === 'sending'}>
        {state.kind === 'sending' ? 'Sending…' : 'Send reset link'}
      </Button>
      <p className="text-center text-sm">
        <Link href="/login" className="text-muted-foreground underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
