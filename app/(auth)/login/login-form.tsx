'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/src/lib/auth/client';

type State = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; email: string } | { kind: 'error'; message: string };

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value) return;
    setState({ kind: 'sending' });
    try {
      const { error } = await authClient.signIn.magicLink({ email: value, callbackURL: '/' });
      if (error) {
        const status = (error as { status?: number }).status;
        const message =
          status === 404
            ? 'Magic-link sign-in is not enabled for this app yet. Ask the admin to enable it.'
            : error.message || 'Could not send the sign-in link.';
        setState({ kind: 'error', message });
        return;
      }
      setState({ kind: 'sent', email: value });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Could not send the sign-in link.' });
    }
  }

  if (state.kind === 'sent') {
    return (
      <div className="space-y-3 text-sm">
        <p>
          Check <span className="font-medium">{state.email}</span> for a sign-in link. It expires in 15 minutes.
        </p>
        <p className="text-muted-foreground">
          No email? Check spam, or ask your admin to confirm your account is set up.
        </p>
        <Button variant="outline" size="sm" onClick={() => setState({ kind: 'idle' })}>
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          placeholder="you@rseenergygroup.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={state.kind === 'sending'}
        />
      </div>
      {state.kind === 'error' && (
        <p role="alert" className="text-destructive text-sm">
          {state.message}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={state.kind === 'sending'}>
        {state.kind === 'sending' ? 'Sending link…' : 'Email me a sign-in link'}
      </Button>
    </form>
  );
}
