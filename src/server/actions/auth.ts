'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { validatePassword } from '@/src/lib/auth/password';
import { getAuth } from '@/src/lib/auth/server';
import { requireRole } from '@/src/lib/auth/session';

export type FormState = { error: string | null; ok?: boolean };

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

/** Email + password sign-in. On success the SDK sets the session cookies and we go to the queue. */
export async function signInWithPassword(_prev: FormState | null, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({ email: formData.get('email'), password: formData.get('password') });
  if (!parsed.success) return { error: 'Enter your email and password.' };

  const { error } = await getAuth().signIn.email(parsed.data);
  if (error) {
    const code = (error as { code?: string }).code ?? '';
    if (code.startsWith('NETWORK_')) return { error: 'The sign-in service is unreachable. Try again in a moment.' };
    return { error: 'Email or password is incorrect.' };
  }
  redirect('/');
}

export async function signOutAction() {
  await getAuth().signOut();
  redirect('/login');
}

const changeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string(),
  confirmPassword: z.string(),
});

/** Signed-in users change their own password; other sessions are revoked. */
export async function changePasswordAction(_prev: FormState | null, formData: FormData): Promise<FormState> {
  try {
    await requireRole('caller');
  } catch {
    redirect('/login');
  }
  const parsed = changeSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) return { error: 'Fill in all three fields.' };
  const { currentPassword, newPassword, confirmPassword } = parsed.data;
  const policy = validatePassword(newPassword);
  if (policy) return { error: policy };
  if (newPassword !== confirmPassword) return { error: 'The new passwords do not match.' };
  if (newPassword === currentPassword) return { error: 'Choose a different password.' };

  const { error } = await getAuth().changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
  if (error) return { error: /invalid|incorrect|password/i.test(error.message ?? '') ? 'Current password is incorrect.' : 'Could not change the password.' };
  return { error: null, ok: true };
}
